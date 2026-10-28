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
import { voiceToTextService, type VoiceToTextResult } from "./voiceToTextService";
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

    // Subscribe to decoupled Voice-to-Text providers
    voiceToTextService.onText((result: VoiceToTextResult) => {
      this.handleSpeechInput(result);
    });
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
        } catch { }
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
      this.start().catch(() => { });
    }
  }

  /**
   * Starts listening to the microphone.
   * Runs both decoupled real-time voice providers and audio capture listener for maximum reliability.
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

    // 1. Start decoupled Voice-to-Text service (Browser streaming speech / OS Native STT)
    try {
      await voiceToTextService.start();
      console.log("[MicManager] VoiceToTextService active.");
    } catch (err) {
      console.warn("[MicManager] VoiceToTextService start notice:", err);
    }

    // 2. Start audio capture listener (feeds audio visualizer and records chunks for neural STT)
    try {
      await this.listener.start();
      console.log("[MicManager] Audio listener active.");
    } catch (listenerErr) {
      console.warn("[MicManager] Audio listener start notice:", listenerErr);
    }

    this.startSilenceMonitoringLoop();
  }

  /**
   * Halts microphone listening and releases all resources.
   */
  public stop(): void {
    try {
      voiceToTextService.stop();
    } catch {}
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

    // If real-time streaming browser speech recognition is actively capturing speech,
    // skip double-transcribing the same audio chunk with Whisper/ElevenLabs to prevent duplicate text.
    const activeProvider = voiceToTextService.getActiveProvider();
    if (activeProvider?.id === "browser_speech" && activeProvider.getIsRunning?.()) {
      return;
    }

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
   * Universal Speech Input Handler:
   * Receives transcribed text from whichever Voice-to-Text service is active
   * (Browser Speech, Local Neural Whisper, ElevenLabs STT, or any future provider).
   */
  public handleSpeechInput(result: VoiceToTextResult): void {
    const clean = (result.text || "").trim();
    if (!clean) return;

    this.lastSpeechTime = Date.now();

    const candidates = result.alternatives && result.alternatives.length > 0
      ? result.alternatives
      : [clean];

    // 1. Voice Playback Interrupt Check (Immediate Stop)
    // Always check for stop, quiet, quite, mute, shut up
    const isVoicePlaying =
      audioPlayer.isPlaying ||
      voiceQueueManager.getCurrentPlaying() !== null ||
      voiceQueueManager.getSnapshot().totalInQueue > 0;

    const stopMatch = candidates.find((t) => isVoiceStopCommand(t));
    if (stopMatch) {
      console.log(`[MicManager] Voice stop command detected ("${stopMatch}"). Stopping playback.`);
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

    // 2. Acoustic Echo & System Audio Suppression Gate:
    // If Mira is actively speaking through the speakers, OR playback just ended (< 1200ms echo hangover window),
    // OR the incoming text matches recently spoken AI audio (self-echo):
    // DISCARD IMMEDIATELY! Do NOT detect wake words, do NOT append segments, do NOT submit to chat.
    const timeSincePlayback = Date.now() - audioPlayer.lastPlaybackEnd;
    const isInEchoHangover = timeSincePlayback < 1200;
    const isEcho = voiceQueueManager.isSelfEcho(clean);

    if (isVoicePlaying || isInEchoHangover || isEcho) {
      console.log(
        `[MicManager] Discarding speech (self-echo / system audio suppression: playing=${isVoicePlaying}, echoHangover=${isInEchoHangover}, isEcho=${isEcho}): "${clean}"`
      );
      return;
    }

    // 3. Wake Word Detection (Mira, Mirror, Meera, Mera, Amira, etc.)
    if (!this.wakeWord.getIsCollecting()) {
      let detectedWake = false;
      for (const candidate of candidates) {
        const wakeCheck = this.wakeWord.processTranscription(candidate);
        if (wakeCheck.detected) {
          detectedWake = true;
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
          if (wakeCheck.commandPart && result.isFinal) {
            this.processor.addSegment(wakeCheck.commandPart);
          }
          break;
        }
      }

      if (!detectedWake) {
        console.log(`[MicManager] Speech ignored (waiting for "Mira"): "${clean}"`);
      }
    } else {
      // 4. Collecting command: ONLY commit FINAL results to SentenceProcessor!
      // Interim results represent live in-progress speech, do NOT append them repeatedly.
      if (result.isFinal) {
        const processed = this.wakeWord.processTranscription(clean);
        const segmentToAdd = processed.commandPart || clean;
        if (segmentToAdd) {
          this.processor.addSegment(segmentToAdd);
          console.log(
            `[MicManager] Collected final segment: "${segmentToAdd}". Current command: "${this.processor.getRawText()}"`
          );
        }
      } else {
        // Live interim feedback: user is currently speaking
        // Reset silence timer, but do not append partial drafts to the sentence processor
        console.debug(`[MicManager] Live speech interim: "${clean}"`);
      }
    }

    // 4. Fast-track finalization if recognizer marks final and we have command content
    if (result.isFinal && this.wakeWord.getIsCollecting() && this.processor.hasContent()) {
      setTimeout(() => {
        const silence = Date.now() - this.lastSpeechTime;
        if (silence >= 1200 && this.wakeWord.getIsCollecting() && !this.isFinalizingCommand) {
          this.handleSilence(silence);
        }
      }, 1400);
    }
  }

  /**
   * Processes a recognized text segment from STT providers.
   */
  private async processTranscribedText(text: string): Promise<void> {
    this.handleSpeechInput({
      text,
      isFinal: true,
      provider: "transcription",
    });
  }

  /**
   * Activates browser SpeechRecognition provider via central VoiceToTextService.
   */
  private startBrowserRecognition(): void {
    try {
      voiceToTextService.setActiveProvider("browser_speech");
      if (this.state === "listening" || this.state === "collecting_command") {
        voiceToTextService.start().catch((err) => {
          console.debug("[MicManager] Failed to start browser speech provider:", err);
        });
      }
    } catch (e) {
      console.warn("[MicManager] Error activating browser speech provider:", e);
    }
  }

  public stopBrowserRecognition(): void {
    try {
      voiceToTextService.getProvider("browser_speech")?.stop();
    } catch {}
  }

  public stopBrowserRecognitionFallback(): void {
    this.stopBrowserRecognition();
  }

  /**
   * Continuous monitoring loop for 1.8-second silence timeout and auto-volume restoration.
   */
  public startSilenceMonitoringLoop(): void {
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

      // If collecting command and silence reached conversational threshold (1.8s), finalize and submit!
      if (this.wakeWord.getIsCollecting() && !this.isFinalizingCommand) {
        if (this.processor.isSilenceTriggered(silenceDurationMs) && this.processor.hasContent()) {
          this.handleSilence(silenceDurationMs);
        }
      }
    }, 250);
  }

  public stopSilenceMonitoringLoop(): void {
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

    try {
      await this.router.submitCommand(validation.command);
    } catch (err) {
      console.error("[MicManager] Failed to submit command to chat:", err);
    } finally {
      // Reset collection state for subsequent commands
      this.wakeWord.reset();
      this.processor.clear();
      this.lastSpeechTime = Date.now();
      if (voiceToTextService.getActiveProvider()?.getIsRunning?.() || this.listener.getIsListening()) {
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

// Ensure prototype safety across hot-module reloads
if (typeof (MicManager.prototype as any).stopBrowserRecognition !== "function") {
  (MicManager.prototype as any).stopBrowserRecognition = function () {
    try {
      (this as any).browserRecognition?.stop();
    } catch { }
    (this as any).browserRecognition = null;
  };
}

export const micManager = new MicManager();

