/**
 * MicListener: Captures microphone audio, measures real-time energy using Web Audio API,
 * detects speech activity and silence, and segments audio into complete, standalone Blobs.
 * Avoids cutting words mid-sentence by triggering segmentation on natural speech pauses or limits.
 */

import type {
  AudioCaptureChunk,
  MicError,
  MicListenerOptions,
} from "./types";
import { audioPlayer } from "@/modules/voice/audioPlayer";

export type AudioChunkCallback = (chunk: AudioCaptureChunk) => void;
export type SilenceCallback = (silenceDurationMs: number) => void;
export type SpeechStartCallback = () => void;
export type ErrorCallback = (error: MicError) => void;
export type StatusCallback = (isListening: boolean) => void;

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidateTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
  ];
  for (const mimeType of candidateTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

export class MicListener {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  private isListening = false;
  private analysisTimer: ReturnType<typeof setInterval> | null = null;

  private options: Required<MicListenerOptions>;
  private recordedBlobs: Blob[] = [];
  private chunkStartTime = 0;
  private lastSpeechTime = 0;
  private peakRmsInCurrentChunk = 0;
  private hasAudioInCurrentChunk = false;
  private isSpeakingNow = false;
  private selectedMimeType = "";

  // Callbacks
  private onAudioChunkCb: AudioChunkCallback | null = null;
  private onSilenceCb: SilenceCallback | null = null;
  private onSpeechStartCb: SpeechStartCallback | null = null;
  private onErrorCb: ErrorCallback | null = null;
  private onStatusChangeCb: StatusCallback | null = null;

  constructor(options?: MicListenerOptions) {
    this.options = {
      // 1.8 corresponds to ~0.018 RMS amplitude (normal voice conversational level)
      energyThreshold: options?.energyThreshold ?? 1.8,
      chunkIntervalMs: options?.chunkIntervalMs ?? 3000,
      silenceThresholdMs: options?.silenceThresholdMs ?? 10000,
    };
  }

  public setOnAudioChunk(cb: AudioChunkCallback): void {
    this.onAudioChunkCb = cb;
  }

  public setOnSilence(cb: SilenceCallback): void {
    this.onSilenceCb = cb;
  }

  public setOnSpeechStart(cb: SpeechStartCallback): void {
    this.onSpeechStartCb = cb;
  }

  public setOnError(cb: ErrorCallback): void {
    this.onErrorCb = cb;
  }

  public setOnStatusChange(cb: StatusCallback): void {
    this.onStatusChangeCb = cb;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public getLastSpeechTime(): number {
    return this.lastSpeechTime;
  }

  /**
   * Requests microphone access, initializes Web Audio analysis,
   * and starts continuous voice-activity-guided recording.
   */
  public async start(): Promise<void> {
    if (this.isListening) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      this.emitError({
        type: "not_supported",
        message: "Microphone recording is not supported in this environment.",
        timestamp: Date.now(),
      });
      return;
    }

    try {
      this.selectedMimeType = getSupportedMimeType();

      // Request microphone stream with voice-optimized constraints
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up Web Audio Analyser for real-time energy & silence measurement
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.analyser);

      this.isListening = true;
      this.lastSpeechTime = Date.now();
      this.chunkStartTime = Date.now();
      this.peakRmsInCurrentChunk = 0;
      this.hasAudioInCurrentChunk = false;
      this.isSpeakingNow = false;

      this.onStatusChangeCb?.(true);
      console.log("[MicListener] Microphone listening started successfully.");

      // Start energy monitoring loop
      this.startEnergyMonitoring();

      // Start segmented MediaRecorder capture
      this.startSegmentRecording();
    } catch (err: unknown) {
      this.cleanup();
      const domError = err as DOMException;
      let errorType: MicError["type"] = "unknown";
      let errorMsg = domError?.message || "Failed to access microphone.";

      if (domError?.name === "NotAllowedError" || domError?.name === "PermissionDeniedError") {
        errorType = "permission_denied";
        errorMsg = "Microphone access was denied. Please allow microphone permissions in system settings.";
      } else if (domError?.name === "NotFoundError" || domError?.name === "DevicesNotFoundError") {
        errorType = "device_not_found";
        errorMsg = "No audio input device detected. Please connect a microphone.";
      } else if (domError?.name === "NotReadableError") {
        errorType = "device_not_found";
        errorMsg = "Microphone is currently in use or blocked by another application.";
      }

      this.emitError({
        type: errorType,
        message: errorMsg,
        originalError: err,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Starts a single recording segment.
   */
  private startSegmentRecording(): void {
    if (!this.isListening || !this.stream) return;

    try {
      this.recordedBlobs = [];
      this.chunkStartTime = Date.now();
      this.peakRmsInCurrentChunk = 0;
      this.hasAudioInCurrentChunk = false;

      const options = this.selectedMimeType ? { mimeType: this.selectedMimeType } : undefined;
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedBlobs.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        if (this.recordedBlobs.length > 0) {
          const mime = this.selectedMimeType || "audio/webm";
          const completeBlob = new Blob(this.recordedBlobs, { type: mime });
          const durationMs = Date.now() - this.chunkStartTime;

          // Dispatch audio chunk if there is valid data
          if (completeBlob.size > 0) {
            this.onAudioChunkCb?.({
              blob: completeBlob,
              durationMs,
              timestamp: Date.now(),
              hasAudioEnergy: this.hasAudioInCurrentChunk,
              peakRms: this.peakRmsInCurrentChunk,
            });
          }
        }
        this.recordedBlobs = [];

        // If still listening, immediately begin the next recording segment
        if (this.isListening) {
          this.startSegmentRecording();
        }
      };

      this.mediaRecorder.start();
    } catch (err) {
      console.warn("[MicListener] Failed to start MediaRecorder segment:", err);
      if (this.isListening) {
        setTimeout(() => {
          this.startSegmentRecording();
        }, 1000);
      }
    }
  }

  /**
   * Rotates the current segment cleanly: stops current recording and starts a new one.
   */
  public flushCurrentSegment(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.debug("[MicListener] Error stopping mediaRecorder segment:", e);
      }
    }
  }

  /**
   * Continuously measures audio energy (RMS) to track speech activity, silence,
   * and intelligent phrase boundary cuts.
   */
  private startEnergyMonitoring(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }

    const dataArray = new Uint8Array(this.analyser?.frequencyBinCount || 256);

    this.analysisTimer = setInterval(() => {
      if (!this.isListening || !this.analyser) return;

      this.analyser.getByteTimeDomainData(dataArray);

      // Compute Root Mean Square (RMS) amplitude
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128; // -1.0 to 1.0
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      // Scale RMS: silence floor is ~1-5, normal voice is ~18-80
      const energy = Math.min(100, Math.round(rms * 1000) / 10);

      if (energy > this.peakRmsInCurrentChunk) {
        this.peakRmsInCurrentChunk = energy;
      }

      const now = Date.now();
      const elapsedInChunk = now - this.chunkStartTime;

      if (energy >= this.options.energyThreshold) {
        // Active speech detected
        this.hasAudioInCurrentChunk = true;
        const wasSilentBefore = !this.isSpeakingNow;
        this.isSpeakingNow = true;
        this.lastSpeechTime = now;

        if (wasSilentBefore) {
          // If MIRA voice playback is currently active, duck volume so user's speech is heard clearly
          if (audioPlayer.isPlaying) {
            audioPlayer.duckVolume(0.2);
          }
          this.onSpeechStartCb?.();
        }

        // If continuous speech chunk exceeds 3.5 seconds, flush segment so STT doesn't lag
        if (elapsedInChunk >= this.options.chunkIntervalMs + 500) {
          this.flushCurrentSegment();
        }
      } else {
        // Silence in this frame
        this.isSpeakingNow = false;
        const silenceDurationMs = now - this.lastSpeechTime;

        // If voice was ducked and user pauses speaking for > 1.8s, restore volume
        if (audioPlayer.isDucked && silenceDurationMs >= 1800) {
          audioPlayer.restoreVolume();
        }

        // If speech was captured in current segment and a natural pause (>= 600ms) occurs,
        // or elapsed segment is over 2 seconds: flush segment cleanly at the pause!
        if (this.hasAudioInCurrentChunk && silenceDurationMs >= 600 && elapsedInChunk >= 1200) {
          this.flushCurrentSegment();
        } else if (!this.hasAudioInCurrentChunk && elapsedInChunk >= 4000) {
          // If pure background silence for 4 seconds, recycle segment without sending to STT
          this.flushCurrentSegment();
        }

        // Report silence duration
        this.onSilenceCb?.(silenceDurationMs);
      }
    }, 100);
  }

  /**
   * Halts listening and releases all hardware resources immediately.
   */
  public stop(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.isListening = false;
    this.onStatusChangeCb?.(false);

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {}
      this.analyser = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch {}
      this.stream = null;
    }

    if (audioPlayer.isDucked) {
      audioPlayer.restoreVolume();
    }

    this.recordedBlobs = [];
    console.log("[MicListener] Microphone resources released completely.");
  }

  private emitError(error: MicError): void {
    console.warn(`[MicListener] Error [${error.type}]: ${error.message}`);
    this.onErrorCb?.(error);
  }
}

export const micListener = new MicListener();
