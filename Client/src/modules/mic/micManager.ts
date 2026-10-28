/**
 * MicManager: Master orchestrator for the dedicated Microphone module.
 * Coordinates:
 *   1. MicListener (Audio capture & silence measurement)
 *   2. ElevenLabsSTT (Audio transcription with key rotation)
 *   3. WakeWordDetector (Detects "Mira", ignores prior speech, isolates command)
 *   4. SentenceProcessor (Combines segments, 5-second silence timeout, greeting/fragment filters)
 *   5. ChatRouter (Screen detection, session management, and single query submission)
 *
 * Automatically tracks hardware mic state from useVoiceStore.
 * Uses MessageBar (toast) to notify whenever speech is detected and whenever a command is sent to chat.
 */

import { useVoiceStore } from "@/store/useVoiceStore";
import { voiceQueueManager } from "@/modules/voice/voiceQueueManager";
import { audioPlayer } from "@/modules/voice/audioPlayer";
import { micListener, MicListener } from "./listener";
import { elevenLabsSTT, ElevenLabsSTT } from "./speechToText";
import { wakeWordDetector, WakeWordDetector } from "./wakeWordDetector";
import { sentenceProcessor, SentenceProcessor, isVoiceStopCommand } from "./sentenceProcessor";
import { chatRouter, ChatRouter } from "./chatRouter";
import type {
  MicState,
  MicError,
  AudioCaptureChunk,
  TranscriptionResult,
} from "./types";
import { toast, MessageBarColor } from "@/components";

export type MicStateListener = (state: MicState) => void;

export class MicManager {
  private listener: MicListener;
  private stt: ElevenLabsSTT;
  private wakeWord: WakeWordDetector;
  private processor: SentenceProcessor;
  private router: ChatRouter;

  private state: MicState = "disabled";
  private stateListeners: Set<MicStateListener> = new Set();
  private storeUnsubscribe: (() => void) | null = null;
  private isFinalizingCommand = false;
  private pendingSTTPromises = 0;

  constructor(
    listener = micListener,
    stt = elevenLabsSTT,
    wakeWord = wakeWordDetector,
    processor = sentenceProcessor,
    router = chatRouter
  ) {
    this.listener = listener;
    this.stt = stt;
    this.wakeWord = wakeWord;
    this.processor = processor;
    this.router = router;

    this.bindListenerEvents();
    this.initStoreSubscription();
  }

  public getState(): MicState {
    return this.state;
  }

  public addStateListener(listener: MicStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setState(next: MicState): void {
    if (this.state !== next) {
      this.state = next;
      this.stateListeners.forEach((fn) => {
        try {
          fn(next);
        } catch (e) {
          console.debug("[MicManager] Error in state listener:", e);
        }
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mira:mic_state_change", {
            detail: {
              state: next,
              isListening: next === "listening" || next === "collecting_command",
              isCollecting: next === "collecting_command",
            },
          })
        );
      }
    }
  }

  /**
   * Plays a pleasant, subtle two-tone activation chime via Web Audio API
   * when "Mira" is detected, signaling the user to speak their command.
   */
  private playActivationChime(): void {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.start(now);
      osc.stop(now + 0.22);
      setTimeout(() => {
        try {
          ctx.close();
        } catch {}
      }, 300);
    } catch (e) {
      console.debug("[MicManager] Chime error:", e);
    }
  }

  /**
   * Binds listener events (audio chunks, silence measurement, errors).
   */
  private bindListenerEvents(): void {
    this.listener.setOnAudioChunk((chunk: AudioCaptureChunk) => {
      this.handleAudioChunk(chunk);
    });

    this.listener.setOnSilence((silenceDurationMs: number) => {
      this.handleSilence(silenceDurationMs);
    });

    this.listener.setOnSpeechStart(() => {
      if (this.state === "listening") {
        console.log("[MicManager] Voice activity detected. Processing speech...");
      }
    });

    this.listener.setOnError((error: MicError) => {
      this.handleMicError(error);
    });

    this.listener.setOnStatusChange((isListening: boolean) => {
      if (!isListening && this.state !== "disabled") {
        this.setState("idle");
      }
    });
  }

  /**
   * Subscribes to changes in useVoiceStore.isMicOn to automatically start/stop listening.
   */
  private initStoreSubscription(): void {
    if (this.storeUnsubscribe) return;

    this.storeUnsubscribe = useVoiceStore.subscribe((state, prevState) => {
      if (!prevState.isMicOn && state.isMicOn) {
        this.start().catch((err) => {
          console.error("[MicManager] Auto-start on mic toggle failed:", err);
        });
      } else if (prevState.isMicOn && !state.isMicOn) {
        this.stop();
      }
    });

    // Check initial state on creation
    if (useVoiceStore.getState().isMicOn) {
      this.start().catch(() => {});
    }
  }

  /**
   * Starts listening to the microphone.
   */
  public async start(): Promise<void> {
    if (this.listener.getIsListening()) {
      return;
    }

    this.wakeWord.reset();
    this.processor.clear();
    this.isFinalizingCommand = false;
    this.setState("listening");

    try {
      await this.listener.start();
    } catch (err) {
      this.setState("idle");
      throw err;
    }
  }

  /**
   * Halts microphone listening and releases all resources.
   */
  public stop(): void {
    this.listener.stop();
    this.wakeWord.reset();
    this.processor.clear();
    this.isFinalizingCommand = false;
    audioPlayer.restoreVolume();
    this.setState("disabled");
  }

  /**
   * Toggles microphone state directly.
   */
  public async toggle(): Promise<boolean> {
    const isCurrentlyOn = useVoiceStore.getState().isMicOn;
    const nextState = isCurrentlyOn ? "off" : "on";
    await useVoiceStore.getState().setMicrophoneState(nextState);
    return nextState === "on";
  }

  /**
   * Handles incoming segmented audio chunks from MicListener.
   * Notifies via MessageBar whenever text is detected from Speech-to-Text.
   */
  private async handleAudioChunk(chunk: AudioCaptureChunk): Promise<void> {
    const isCollecting = this.wakeWord.getIsCollecting();

    // Transcribe if speech was detected OR we are already collecting a command
    if (!chunk.hasAudioEnergy && !isCollecting && chunk.peakRms < 1.0) {
      return;
    }

    this.pendingSTTPromises++;
    if (this.state === "listening" && isCollecting) {
      this.setState("collecting_command");
    }

    try {
      const transcription: TranscriptionResult = await this.stt.transcribeAudio(chunk.blob, {
        languageCode: "en",
      });
      const text = transcription.text.trim();

      if (!text) return;

      console.log(`[MicManager] STT Transcript received: "${text}"`);

      // 1. Voice Playback Interruption:
      // If voice is currently playing and user speaks an interrupt word ("stop", "quiet", "quite", "mute"),
      // immediately cancel ongoing playback and do not submit to chat.
      const isVoicePlaying =
        audioPlayer.isPlaying ||
        voiceQueueManager.getCurrentPlaying() !== null ||
        voiceQueueManager.getSnapshot().totalInQueue > 0;

      if (isVoicePlaying && isVoiceStopCommand(text)) {
        console.log(`[MicManager] Voice playback interrupt detected ("${text}"). Stopping playback.`);
        voiceQueueManager.stopAll();
        audioPlayer.stop();
        audioPlayer.restoreVolume();

        // Reset collection state
        this.wakeWord.reset();
        this.processor.clear();
        this.setState("listening");

        toast.info("Voice playback stopped", {
          title: "Voice Stopped",
          color: MessageBarColor.Gray,
          duration: 3000,
        });
        return;
      }

      // Feed transcription into Wake Word Detector
      const wakeWordResult = this.wakeWord.processTranscription(text);

      if (wakeWordResult.detected) {
        if (wakeWordResult.isNewActivation) {
          this.setState("collecting_command");
          // Play subtle activation chime & notify user via MessageBar
          this.playActivationChime();
          toast.info(
            wakeWordResult.commandPart
              ? `Wake word detected! Command: "${wakeWordResult.commandPart}"`
              : "Wake word detected! Listening for your command...",
            {
              title: "Mira Activated",
              color: MessageBarColor.Cyan,
              duration: 4000,
            }
          );
        } else {
          // Additional command segment detected while collecting
          toast.info(`"${wakeWordResult.commandPart || text}"`, {
            title: "Speech Captured",
            color: MessageBarColor.Blue,
            duration: 3500,
          });
        }

        // If a command portion was returned, feed into Sentence Processor
        if (wakeWordResult.commandPart) {
          this.processor.addSegment(wakeWordResult.commandPart);
          console.log(
            `[MicManager] Collected command segment: "${wakeWordResult.commandPart}". Current raw command: "${this.processor.getRawText()}"`
          );
        }
      } else {
        // Speech detected prior to wake word - quietly ignored
        console.log(`[MicManager] Speech ignored (waiting for "Mira"): "${text}"`);
      }
    } catch (err: unknown) {
      const isMicErr = (err as { isMicError?: boolean })?.isMicError;
      if (isMicErr) {
        console.warn(`[MicManager] STT Warning: ${(err as Error).message}`);
      } else {
        console.error("[MicManager] STT Exception:", err);
      }
    } finally {
      this.pendingSTTPromises--;
    }
  }

  /**
   * Handles silence measurement:
   * When wake word has been detected and silence reaches 10 seconds, finalize the command.
   */
  private async handleSilence(silenceDurationMs: number): Promise<void> {
    if (!this.wakeWord.getIsCollecting() || this.isFinalizingCommand) {
      return;
    }

    // 10-second pause indicates the end of the command
    if (this.processor.isSilenceTriggered(silenceDurationMs)) {
      this.isFinalizingCommand = true;

      // Allow any active in-flight STT transcription requests to complete before evaluating
      if (this.pendingSTTPromises > 0) {
        let waitAttempts = 0;
        while (this.pendingSTTPromises > 0 && waitAttempts < 15) {
          await new Promise((r) => setTimeout(r, 100));
          waitAttempts++;
        }
      }

      await this.finalizeAndSubmitCommand();
      this.isFinalizingCommand = false;
    }
  }

  /**
   * Evaluates collected segments via SentenceProcessor and routes valid commands.
   * Notifies via MessageBar when the command is sent or if rejected.
   */
  private async finalizeAndSubmitCommand(): Promise<void> {
    const validation = this.processor.validateAndFormatCommand();

    if (!validation.isValid) {
      audioPlayer.restoreVolume();
      console.log(
        `[MicManager] Command rejected (reason: ${validation.reason}, raw: "${validation.rawText}")`
      );

      if (validation.reason === "standalone_greeting") {
        toast.warning(
          `Ignored greeting "${validation.rawText}". Speak "Mira" followed by a command.`,
          {
            title: "Greeting Ignored",
            color: MessageBarColor.Yellow,
            duration: 4000,
          }
        );
      } else if (validation.reason === "incomplete_fragment") {
        toast.info(`Ignored fragment: "${validation.rawText}"`, {
          title: "Speech Fragment Ignored",
          color: MessageBarColor.Gray,
          duration: 3000,
        });
      } else if (validation.reason === "non_english") {
        toast.warning("Only English voice commands are supported.", {
          title: "English Only",
          color: MessageBarColor.Yellow,
          duration: 3500,
        });
      }

      // Reset collection state so the user can speak the wake word again
      this.wakeWord.reset();
      this.processor.clear();
      this.setState("listening");
      return;
    }

    // Valid command ready for submission!
    console.log(
      `[MicManager] Valid voice command confirmed (${validation.wordCount} words): "${validation.command}"`
    );

    // Ensure volume is restored back to previous level for new voice query response
    audioPlayer.restoreVolume();

    this.setState("submitting");

    // Notify in MessageBar that command is being sent to chat
    toast.show({
      title: "Sending Voice Command to Chat...",
      message: `"${validation.command}"`,
      type: "info",
      color: MessageBarColor.Cyan,
      duration: 3500,
    });

    try {
      await this.router.submitCommand(validation.command);
    } catch (err) {
      console.error("[MicManager] Failed to submit command to chat:", err);
    } finally {
      // Reset collection state for subsequent commands
      this.wakeWord.reset();
      this.processor.clear();
      if (this.listener.getIsListening()) {
        this.setState("listening");
      } else {
        this.setState("idle");
      }
    }
  }

  /**
   * Handles microphone hardware or permission errors.
   */
  private handleMicError(error: MicError): void {
    if (error.type === "permission_denied") {
      toast.error(error.message, {
        title: "Microphone Access Denied",
        color: MessageBarColor.Red,
        duration: 6000,
      });
    } else if (error.type === "device_not_found") {
      toast.error(error.message, {
        title: "No Microphone Found",
        color: MessageBarColor.Red,
        duration: 6000,
      });
    }
    this.setState("idle");
  }

  public dispose(): void {
    this.stop();
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.stateListeners.clear();
  }
}

export const micManager = new MicManager();

