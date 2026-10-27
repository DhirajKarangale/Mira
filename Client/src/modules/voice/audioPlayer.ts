/**
 * HTML5 Audio Player for Voice Playback
 * Manages clean chunk-by-chunk playback with interruption handling,
 * volume control, and resource disposal.
 */

export class AudioPlayer {
  private audioElement: HTMLAudioElement | null = null;
  private currentPromiseReject: ((reason?: unknown) => void) | null = null;
  private isPlayingAudio = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
    }
  }

  /**
   * Returns whether audio is actively playing.
   */
  get isPlaying(): boolean {
    return this.isPlayingAudio;
  }

  /**
   * Plays an audio URL and resolves when playback naturally finishes.
   * Rejects if interrupted or if playback errors out.
   */
  playAudioUrl(url: string, signal?: AbortSignal): Promise<void> {
    this.stop(); // Stop any currently playing audio

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
      audio.volume = 1.0;
      audio.muted = false;
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
        reject(new Error(`Audio playback error: ${audio.error?.message || "Unknown error"}`));
      };

      audio
        .play()
        .then(() => {
          this.isPlayingAudio = true;
        })
        .catch((err) => {
          if (err?.name === "NotAllowedError") {
            console.warn(
              "[AudioPlayer] Autoplay blocked by browser policy. Audio will start on next click or keydown."
            );
            const onUserInteraction = () => {
              window.removeEventListener("click", onUserInteraction);
              window.removeEventListener("keydown", onUserInteraction);
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
