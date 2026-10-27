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
  private volumeLevel = 1.0;
  private isMutedState = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
      this.audioElement.volume = 1.0;
      this.audioElement.muted = false;
      this.audioElement.defaultMuted = false;

      // Unlock Web Audio context on user gestures
      const unlockAudio = () => {
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
      // Set to full volume with studio gain boost (1.25x)
      this.gainNode.gain.setValueAtTime(
        this.isMutedState ? 0 : this.volumeLevel * 1.25,
        this.audioContext.currentTime
      );

      this.compressorNode = this.audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-12, this.audioContext.currentTime);
      this.compressorNode.knee.setValueAtTime(24, this.audioContext.currentTime);
      this.compressorNode.ratio.setValueAtTime(4, this.audioContext.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, this.audioContext.currentTime);

      this.mediaSourceNode = this.audioContext.createMediaElementSource(
        this.audioElement
      );
      this.mediaSourceNode.connect(this.gainNode);
      this.gainNode.connect(this.compressorNode);
      this.compressorNode.connect(this.audioContext.destination);
      this.isWebAudioReady = true;
      console.log("[AudioPlayer] Web Audio booster active: 100% Full Volume + 1.25x Gain");
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
    return this.isPlayingAudio;
  }

  /**
   * Sets the playback volume (0.0 to 1.0).
   * 1.0 represents 100% full volume with hardware booster.
   */
  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1.0));
    this.volumeLevel = clamped;
    this.isMutedState = clamped === 0;

    if (this.audioElement) {
      this.audioElement.volume = clamped;
      this.audioElement.muted = this.isMutedState;
    }

    if (this.gainNode && this.audioContext) {
      try {
        const targetGain = this.isMutedState ? 0 : clamped * 1.25;
        this.gainNode.gain.setValueAtTime(
          targetGain,
          this.audioContext.currentTime
        );
      } catch {}
    }
  }

  /**
   * Returns current volume level (0.0 to 1.0).
   */
  getVolume(): number {
    return this.volumeLevel;
  }

  /**
   * Maximizes volume to 100% full volume with hardware booster.
   */
  maximizeVolume(): void {
    this.setVolume(1.0);
  }

  /**
   * Plays an audio URL and resolves when playback naturally finishes.
   * Rejects if interrupted or if playback errors out.
   */
  async playAudioUrl(url: string, signal?: AbortSignal): Promise<void> {
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
      audio.volume = this.volumeLevel;
      audio.muted = this.isMutedState;
      audio.defaultMuted = false;
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
   * Stops playback immediately and resets the audio source.
   */
  stop(): void {
    this.isPlayingAudio = false;
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
  }
}

export const audioPlayer = new AudioPlayer();
