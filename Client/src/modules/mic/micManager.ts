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
  private lastSpeechTime = 0;
  private silenceCheckTimer: ReturnType<typeof setInterval> | null = null;
  private hasShownQuotaWarning = false;
  // Browser SpeechRecognition engine (native zero-latency streaming)
  private browserRecognition: any = null;
  private isBrowserRecognitionActive = false;

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

    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.toggle = this.toggle.bind(this);
    this.stopBrowserRecognition = this.stopBrowserRecognition.bind(this);
    this.stopSilenceMonitoringLoop = this.stopSilenceMonitoringLoop.bind(this);

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
   * If browser SpeechRecognition is available (Chrome, Edge, Brave), uses real-time streaming recognition.
   * Otherwise falls back to MediaRecorder + ElevenLabs STT.
   */
  public async start(): Promise<void> {
    if (this.state === "listening" || this.state === "collecting_command") {
      return;
    }

    this.wakeWord.reset();
    this.processor.clear();
    this.isFinalizingCommand = false;
    this.lastSpeechTime = Date.now();
    this.setState("listening");

    const hasSpeechRecognition =
      typeof window !== "undefined" &&
      Boolean(
        (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
      );

    if (hasSpeechRecognition) {
      console.log("[MicManager] Starting native streaming SpeechRecognition engine...");
      this.startBrowserRecognition();
      this.startSilenceMonitoringLoop();
      return;
    }

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
    try {
      this.listener?.stop();
    } catch {}
    try {
      this.stopBrowserRecognition();
    } catch {}
    try {
      this.stopSilenceMonitoringLoop();
    } catch {}
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
      if (text) {
        await this.processTranscribedText(text);
      }
    } catch (err: unknown) {
      const isMicErr = (err as { isMicError?: boolean })?.isMicError;
      const micErrType = (err as { type?: string })?.type;
      const errorMsg = (err as Error)?.message || "";

      if (
        isMicErr &&
        (micErrType === "quota_exhausted" ||
          micErrType === "auth_error" ||
          errorMsg.toLowerCase().includes("quota"))
      ) {
        if (!this.hasShownQuotaWarning) {
          this.hasShownQuotaWarning = true;
          toast.warning(
            "ElevenLabs quota is exhausted on all keys in Vault (0 remaining). Switched to browser speech fallback.",
            {
              title: "ElevenLabs Quota Exhausted",
              color: MessageBarColor.Yellow,
              duration: 7000,
            }
          );
        }
        // Seamlessly enable browser SpeechRecognition fallback so voice commands are never lost
        this.startBrowserRecognition();
        this.startSilenceMonitoringLoop();
      } else if (isMicErr) {
        console.warn(`[MicManager] STT Warning: ${errorMsg}`);
      } else {
        console.error("[MicManager] STT Exception:", err);
      }
    } finally {
      this.pendingSTTPromises--;
    }
  }

  /**
   * Processes a recognized text segment from either ElevenLabs STT or browser SpeechRecognition.
   */
  private async processTranscribedText(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;

    console.log(`[MicManager] Transcript received: "${clean}"`);

    // 1. Voice Playback Interruption:
    // If voice is currently playing and user speaks an interrupt word ("stop", "quiet", "quite", "mute"),
    // immediately cancel ongoing playback and do not submit to chat.
    const isVoicePlaying =
      audioPlayer.isPlaying ||
      voiceQueueManager.getCurrentPlaying() !== null ||
      voiceQueueManager.getSnapshot().totalInQueue > 0;

    if (isVoicePlaying && isVoiceStopCommand(clean)) {
      console.log(`[MicManager] Voice playback interrupt detected ("${clean}"). Stopping playback.`);
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
    const wakeWordResult = this.wakeWord.processTranscription(clean);

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
        toast.info(`"${wakeWordResult.commandPart || clean}"`, {
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
      console.log(`[MicManager] Speech ignored (waiting for "Mira"): "${clean}"`);
    }
  }

  /**
   * Starts native streaming SpeechRecognition with interimResults and multi-alternative candidate evaluation.
   */
  private startBrowserRecognition(): void {
    if (typeof window === "undefined" || this.isBrowserRecognitionActive) return;

    const SpeechRecClass =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecClass) return;

    try {
      this.browserRecognition = new SpeechRecClass();
      this.browserRecognition.continuous = true;
      this.browserRecognition.interimResults = true;
      this.browserRecognition.maxAlternatives = 3;
      this.browserRecognition.lang = "en-US";

      this.browserRecognition.onstart = () => {
        this.isBrowserRecognitionActive = true;
        this.lastSpeechTime = Date.now();
        console.log("[MicManager] Real-time browser SpeechRecognition active (en-US).");
      };

      this.browserRecognition.onspeechstart = () => {
        this.lastSpeechTime = Date.now();
        if (audioPlayer.isPlaying) {
          audioPlayer.duckVolume(0.2);
        }
      };

      this.browserRecognition.onresult = (event: any) => {
        const now = Date.now();
        this.lastSpeechTime = now;

        if (audioPlayer.isPlaying) {
          audioPlayer.duckVolume(0.2);
        }

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;

          // Collect all candidate alternatives
          const alternatives: string[] = [];
          for (let a = 0; a < result.length; a++) {
            if (result[a]?.transcript) {
              alternatives.push(result[a].transcript.trim());
            }
          }
          const primary = alternatives[0] || "";
          if (!primary) continue;

          // Check if user spoke a stop command during voice playback
          const isVoicePlaying =
            audioPlayer.isPlaying ||
            voiceQueueManager.getCurrentPlaying() !== null ||
            voiceQueueManager.getSnapshot().totalInQueue > 0;

          if (isVoicePlaying) {
            const stopMatch = alternatives.find((t) => isVoiceStopCommand(t));
            if (stopMatch) {
              console.log(
                `[MicManager] Voice playback interrupt detected ("${stopMatch}"). Stopping playback.`
              );
              voiceQueueManager.stopAll();
              audioPlayer.stop();
              audioPlayer.restoreVolume();

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
          }

          // If NOT collecting yet: check wake word detection across ALL alternatives!
          if (!this.wakeWord.getIsCollecting()) {
            for (const alt of alternatives) {
              const wakeCheck = this.wakeWord.processTranscription(alt);
              if (wakeCheck.detected) {
                this.setState("collecting_command");
                this.playActivationChime();
                toast.info(
                  wakeCheck.commandPart
                    ? `Wake word detected! Command: "${wakeCheck.commandPart}"`
                    : "Wake word detected! Listening for your command...",
                  {
                    title: "Mira Activated",
                    color: MessageBarColor.Cyan,
                    duration: 4000,
                  }
                );
                if (wakeCheck.commandPart) {
                  this.processor.addSegment(wakeCheck.commandPart);
                }
                break;
              }
            }
          } else if (result.isFinal) {
            // Already collecting command: when result is finalized, process and aggregate segment!
            const processed = this.wakeWord.processTranscription(primary);
            const segmentToAdd = processed.commandPart || primary;
            if (segmentToAdd) {
              this.processor.addSegment(segmentToAdd);
              toast.info(`"${segmentToAdd}"`, {
                title: "Speech Captured",
                color: MessageBarColor.Blue,
                duration: 3500,
              });
              console.log(
                `[MicManager] Collected segment: "${segmentToAdd}". Current command: "${this.processor.getRawText()}"`
              );
            }
          }
        }
      };

      this.browserRecognition.onerror = (e: any) => {
        if (e?.error === "no-speech") {
          return; // Common during silence; silently continue
        }
        if (e?.error === "not-allowed" || e?.error === "permission-denied") {
          toast.error(
            "Microphone access was denied. Please allow microphone permissions in system settings.",
            {
              title: "Microphone Access Denied",
              color: MessageBarColor.Red,
              duration: 6000,
            }
          );
          this.setState("idle");
          return;
        }
        console.debug("[MicManager] Browser SpeechRecognition event warning:", e?.error);
      };

      this.browserRecognition.onend = () => {
        this.isBrowserRecognitionActive = false;
        // Automatically restart continuous recognition if still in listening state
        if (this.state === "listening" || this.state === "collecting_command") {
          try {
            this.browserRecognition?.start();
          } catch {}
        }
      };

      this.browserRecognition.start();
      this.isBrowserRecognitionActive = true;
    } catch (e) {
      console.warn("[MicManager] Failed to start browser SpeechRecognition:", e);
      this.isBrowserRecognitionActive = false;
    }
  }

  private stopBrowserRecognition(): void {
    if (this.browserRecognition) {
      this.isBrowserRecognitionActive = false;
      try {
        this.browserRecognition.onend = null;
        this.browserRecognition.onerror = null;
        this.browserRecognition.onresult = null;
        this.browserRecognition.stop();
      } catch {}
      this.browserRecognition = null;
    }
  }

  public stopBrowserRecognitionFallback(): void {
    this.stopBrowserRecognition();
  }

  /**
   * Continuous monitoring loop for 10-second silence timeout and auto-volume restoration.
   */
  private startSilenceMonitoringLoop(): void {
    if (this.silenceCheckTimer) {
      clearInterval(this.silenceCheckTimer);
    }
    this.silenceCheckTimer = setInterval(() => {
      if (this.state !== "listening" && this.state !== "collecting_command") {
        return;
      }
      const now = Date.now();
      const silenceDurationMs = now - this.lastSpeechTime;

      // If audio was ducked and user stopped speaking for > 1.8s, restore volume
      if (audioPlayer.isDucked && silenceDurationMs >= 1800) {
        audioPlayer.restoreVolume();
      }

      // If collecting command and silence reached 10 seconds, finalize and submit!
      if (this.wakeWord.getIsCollecting() && !this.isFinalizingCommand) {
        if (silenceDurationMs >= 10000) {
          this.handleSilence(silenceDurationMs);
        }
      }
    }, 250);
  }

  private stopSilenceMonitoringLoop(): void {
    if (this.silenceCheckTimer) {
      clearInterval(this.silenceCheckTimer);
      this.silenceCheckTimer = null;
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
      this.lastSpeechTime = Date.now();
      if (this.isBrowserRecognitionActive || this.listener.getIsListening()) {
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

