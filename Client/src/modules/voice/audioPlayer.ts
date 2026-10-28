/**
 * HTML5 Audio Player for Voice Playback
 * Manages clean chunk-by-chunk playback with interruption handling,
 * volume maximization, Web Audio gain booster, and resource disposal.
 */

export class AudioPlayer {
  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private isWebAudioReady = false;
  private currentPromiseReject: ((reason?: unknown) => void) | null = null;
  private isPlayingAudio = false;
  private lastPlaybackEndTime = 0;
  private volumeLevel = 1.0;
  private isMutedState = false;
  private isDuckedState = false;
  private preDuckVolume = 1.0;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
      this.audioElement.volume = 1.0;
      this.audioElement.muted = false;
      this.audioElement.defaultMuted = false;

      // Unlock Web Audio context on user gestures
      const unlockAudio = () => {
        if (!this.isWebAudioReady) {
          this.initWebAudio();
        }
        this.resumeAudioContext();
      };
      window.addEventListener("click", unlockAudio, { passive: true });
      window.addEventListener("keydown", unlockAudio, { passive: true });
      window.addEventListener("pointerdown", unlockAudio, { passive: true });
    }
  }

  /**
   * Initializes Web Audio gain & dynamic compression pipeline to provide
   * maximum uncompressed output volume and vocal presence.
   */
  private initWebAudio(): void {
    if (
      typeof window === "undefined" ||
      !this.audioElement ||
      this.isWebAudioReady
    ) {
      return;
    }

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioContext = new AudioCtxClass();
      this.gainNode = this.audioContext.createGain();
      const targetGain = this.isMutedState ? 0 : Math.max(0, this.volumeLevel);
      this.gainNode.gain.value = targetGain;
      try {
        this.gainNode.gain.setValueAtTime(
          targetGain,
          this.audioContext.currentTime
        );
      } catch {}

      this.compressorNode = this.audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.value = -12;
      this.compressorNode.knee.value = 12;
      this.compressorNode.ratio.value = 2.5;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.20;

      this.mediaSourceNode = this.audioContext.createMediaElementSource(
        this.audioElement
      );
      this.mediaSourceNode.connect(this.gainNode);
      this.gainNode.connect(this.compressorNode);
      this.compressorNode.connect(this.audioContext.destination);
      this.isWebAudioReady = true;
      console.log("[AudioPlayer] Web Audio pipeline active (Natural Balance + Anti-Clipping Compressor)");
    } catch (err) {
      console.warn(
        "[AudioPlayer] Web Audio booster init failed; using direct HTML5 audio output:",
        err
      );
      this.isWebAudioReady = false;
    }
  }

  /**
   * Resumes the Web Audio context if suspended by browser autoplay policy.
   */
  private async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // Silently handled if user interaction required
      }
    }
  }

  /**
   * Returns whether audio is actively playing.
   */
  get isPlaying(): boolean {
    const isElemPlaying =
      this.audioElement &&
      !this.audioElement.paused &&
      !this.audioElement.ended &&
      this.audioElement.currentTime > 0;
    const isSpeechSpeaking =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending);
    return this.isPlayingAudio || Boolean(isElemPlaying) || Boolean(isSpeechSpeaking);
  }

  /**
   * Returns timestamp (ms) when playback last finished or was stopped.
   * Used for acoustic echo cancellation and trailing reverberation suppression.
   */
  get lastPlaybackEnd(): number {
    return this.lastPlaybackEndTime;
  }

  /**
   * Sets the playback volume (0.0 to 2.0).
   * 1.0 represents standard full volume (with 2.5x gain booster).
   * Up to 2.0 provides ultra-loud amplified output (up to 5x gain).
   */
  setVolume(volume: number): void {
    const raw = Number.isFinite(volume) ? volume : 1.0;
    // Support both 0.0 - 2.0 (float multiplier) and 0 - 200 (percentage integer)
    const normalized = raw > 2.0 ? raw / 100 : raw;
    const clamped = Math.max(0, Math.min(2.0, normalized));
    this.volumeLevel = clamped;
    this.preDuckVolume = clamped;
    this.isDuckedState = false;
    this.isMutedState = clamped === 0;
    this.applyVolume(clamped);
  }

  /**
   * Ducks (lowers) volume temporarily when the user speaks while voice playback is going on.
   */
  duckVolume(duckRatio = 0.15): void {
    if (this.isDuckedState || !this.isPlayingAudio) return;
    this.preDuckVolume = this.volumeLevel;
    this.isDuckedState = true;
    const duckedLevel = Math.max(0.05, this.preDuckVolume * duckRatio);
    this.applyVolume(duckedLevel);
  }

  /**
   * Restores volume to the previous level when user stops speaking or a new voice query is submitted.
   */
  restoreVolume(): void {
    if (!this.isDuckedState) return;
    this.isDuckedState = false;
    this.applyVolume(this.preDuckVolume);
  }

  get isDucked(): boolean {
    return this.isDuckedState;
  }

  private applyVolume(clamped: number): void {
    if (this.audioElement) {
      try {
        const safeVolume = this.isMutedState
          ? 0
          : Math.min(1.0, Math.max(0, clamped));
        this.audioElement.volume = safeVolume;
        this.audioElement.muted = this.isMutedState;
      } catch (err) {
        console.warn("[AudioPlayer] Error applying audioElement volume:", err);
      }
    }

    if (this.gainNode && this.audioContext) {
      try {
        const targetGain = this.isMutedState ? 0 : Math.max(0, clamped);
        this.gainNode.gain.value = targetGain;
        try {
          this.gainNode.gain.setValueAtTime(
            targetGain,
            this.audioContext.currentTime
          );
        } catch {}
      } catch {}
    }
  }

  /**
   * Returns current volume level (0.0 to 2.0).
   */
  getVolume(): number {
    return this.volumeLevel;
  }

  /**
   * Maximizes volume to full boosted volume.
   */
  maximizeVolume(): void {
    this.setVolume(1.0);
  }

  /**
   * Sets volume to super boosted high level (150% - 200%).
   */
  superBoostVolume(multiplier = 1.5): void {
    this.setVolume(multiplier);
  }

  /**
   * Plays an audio URL and resolves when playback naturally finishes.
   * Rejects if interrupted or if playback errors out.
   */
  async playAudioUrl(url: string, signal?: AbortSignal): Promise<void> {
    this.restoreVolume(); // Ensure new audio chunk plays at original volume
    this.stop(); // Stop any currently playing audio

    // Ensure Web Audio context is initialized and active
    if (!this.isWebAudioReady) {
      this.initWebAudio();
    }
    await this.resumeAudioContext();

    return new Promise<void>((resolve, reject) => {
      if (!this.audioElement) {
        return reject(new Error("Audio element not initialized"));
      }

      if (signal?.aborted) {
        return reject(new Error("Playback aborted"));
      }

      this.currentPromiseReject = reject;
      this.isPlayingAudio = true;

      const audio = this.audioElement;
      audio.src = url;
      // HTMLMediaElement volume MUST strictly be within [0.0, 1.0].
      // Never set audio.volume > 1.0 as it throws DOMException (IndexSizeError).
      // Any boost above 100% is safely handled by Web Audio GainNode.
      audio.volume = this.isMutedState
        ? 0
        : this.isWebAudioReady
        ? 1.0
        : Math.min(1.0, Math.max(0, this.volumeLevel));
      audio.muted = this.isMutedState;
      audio.defaultMuted = false;
      this.applyVolume(this.volumeLevel);
      try {
        audio.load();
      } catch {}

      const cleanup = () => {
        this.isPlayingAudio = false;
        this.currentPromiseReject = null;
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      };

      const onAbort = () => {
        cleanup();
        try {
          audio.pause();
          audio.src = "";
        } catch {}
        reject(new Error("Playback aborted"));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      audio.onended = () => {
        cleanup();
        this.lastPlaybackEndTime = Date.now();
        resolve();
      };

      audio.onerror = () => {
        cleanup();
        reject(
          new Error(
            `Audio playback error: ${audio.error?.message || "Unknown error"}`
          )
        );
      };

      audio
        .play()
        .then(() => {
          this.isPlayingAudio = true;
        })
        .catch((err) => {
          if (err?.name === "NotAllowedError") {
            console.warn(
              "[AudioPlayer] Autoplay blocked by browser policy. Resuming on next interaction."
            );
            const onUserInteraction = async () => {
              window.removeEventListener("click", onUserInteraction);
              window.removeEventListener("keydown", onUserInteraction);
              await this.resumeAudioContext();
              audio
                .play()
                .then(() => {
                  this.isPlayingAudio = true;
                })
                .catch((e) => {
                  cleanup();
                  reject(e);
                });
            };
            window.addEventListener("click", onUserInteraction, { once: true });
            window.addEventListener("keydown", onUserInteraction, { once: true });
            return;
          }
          cleanup();
          reject(err);
        });
    });
  }

  /**
   * Speaks text using browser Web Speech API (fallback when ElevenLabs quotas are exhausted).
   */
  async speakBrowserText(text: string, signal?: AbortSignal): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      throw new Error("Speech synthesis is not supported in this environment.");
    }

    this.stop();
    this.restoreVolume();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = Math.min(1.0, this.volumeLevel);

      // Select high-quality natural English voice if available
      try {
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Natural") ||
                v.name.includes("Google") ||
                v.name.includes("Samantha") ||
                v.name.includes("Jenny") ||
                v.name.includes("Zira"))
          ) || voices.find((v) => v.lang.startsWith("en"));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      } catch {}

      this.isPlayingAudio = true;

      const onAbort = () => {
        try {
          window.speechSynthesis.cancel();
        } catch {}
        this.isPlayingAudio = false;
        reject(new Error("Playback aborted"));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      utterance.onend = () => {
        this.isPlayingAudio = false;
        this.lastPlaybackEndTime = Date.now();
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      };

      utterance.onerror = (e) => {
        this.isPlayingAudio = false;
        if (signal) signal.removeEventListener("abort", onAbort);
        if (e.error === "canceled" || e.error === "interrupted") {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${e.error}`));
        }
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        this.isPlayingAudio = false;
        reject(err);
      }
    });
  }

  /**
   * Stops playback immediately and resets the audio source.
   */
  stop(): void {
    this.isDuckedState = false;
    this.isPlayingAudio = false;
    this.lastPlaybackEndTime = Date.now();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (this.currentPromiseReject) {
      try {
        this.currentPromiseReject(new Error("Playback stopped"));
      } catch {}
      this.currentPromiseReject = null;
    }

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.src = "";
      } catch {}
    }

    // Stop all audio elements across the document if any rogue audio was playing
    if (typeof document !== "undefined") {
      try {
        const audioElements = document.querySelectorAll("audio");
        audioElements.forEach((el) => {
          try {
            el.pause();
            el.currentTime = 0;
          } catch {}
        });
      } catch {}
    }
  }
}

export const audioPlayer = new AudioPlayer();
