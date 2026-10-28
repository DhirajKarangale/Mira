import { canPlayVoice } from "./eligibility";
import { cleanTextForSpeech, chunkText } from "./textProcessor";
import { generateChunkAudio } from "./elevenlabsClient";
import { audioStorage } from "./audioStorage";
import { audioPlayer } from "./audioPlayer";
import type {
  QueuedVoiceResponse,
  QueuedChunk,
  VoiceQueueSnapshot,
  ResponseState,
} from "./types";

class VoiceQueueManager {
  private queue: QueuedVoiceResponse[] = [];
  private activeResponse: QueuedVoiceResponse | null = null;
  private interResponseDelayMs = 15000; // Configurable 15 seconds default
  private interResponseTimer: ReturnType<typeof setTimeout> | null = null;

  private playbackAbortController: AbortController | null = null;
  private generationAbortControllers: Map<string, AbortController> = new Map();
  private lastSpokenTexts: { text: string; timestamp: number }[] = [];

  // Subscribers for reactive UI updates
  private listeners: Set<() => void> = new Set();

  constructor() {
    // If window unloads, cleanly dispose audio resources
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.stopAll();
      });
    }
  }

  /**
   * Subscribes to queue state changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.debug("[VoiceQueueManager] Listener error:", err);
      }
    }
  }

  /**
   * Submits text to the voice pipeline:
   * - Validates voice eligibility.
   * - Cleans text (removes emojis, icons, code blocks, noisy symbols).
   * - Splits into natural sentence chunks respecting ElevenLabs limits.
   * - Enqueues response and begins background chunk generation immediately.
   * - Starts playback as soon as the first chunk is ready.
   */
  async submitResponse(rawText: string, customId?: string): Promise<string | null> {
    // 1. Eligibility Check
    if (!canPlayVoice()) {
      return null;
    }

    // 2. Clean Text
    const cleanText = cleanTextForSpeech(rawText);
    if (!cleanText || cleanText.trim().length === 0) {
      return null;
    }

    // 3. Chunk Text
    const responseId =
      customId || `voice_resp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const textChunks = chunkText(cleanText, responseId);

    if (textChunks.length === 0) {
      return null;
    }

    const queuedChunks: QueuedChunk[] = textChunks.map((tc) => ({
      ...tc,
      state: "pending",
    }));

    const response: QueuedVoiceResponse = {
      id: responseId,
      originalText: rawText,
      cleanText,
      chunks: queuedChunks,
      state: "queued",
      currentChunkIndex: 0,
      createdAt: Date.now(),
    };

    // 4. Add to queue
    this.queue.push(response);
    this.notify();

    // 5. Immediately begin preparing audio for chunks concurrently
    this.startGeneratingChunks(response);

    // 6. If no active playback and no delay timer ticking, start processing
    if (!this.activeResponse && !this.interResponseTimer) {
      this.processQueue();
    }

    return responseId;
  }

  /**
   * Generates audio for chunks with a concurrency limit of 2 in-flight requests.
   */
  private async startGeneratingChunks(response: QueuedVoiceResponse): Promise<void> {
    const abortCtrl = new AbortController();
    this.generationAbortControllers.set(response.id, abortCtrl);

    const CONCURRENCY = 2;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < response.chunks.length) {
        if (abortCtrl.signal.aborted || response.state === "cancelled") {
          break;
        }

        const chunkIdx = nextIndex++;
        const chunk = response.chunks[chunkIdx];

        if (chunk.state !== "pending") {
          continue;
        }

        chunk.state = "generating";
        this.notify();

        try {
          const blob = await generateChunkAudio(chunk.text);
          if (abortCtrl.signal.aborted || (response.state as ResponseState) === "cancelled") {
            break;
          }

          const audioUrl = await audioStorage.storeAudio(chunk.id, response.id, blob);
          chunk.audioBlob = blob;
          chunk.audioUrl = audioUrl;
          chunk.state = "ready";
          this.notify();
        } catch (err: unknown) {
          if (abortCtrl.signal.aborted) break;
          const msg = (err as Error)?.message || "Audio generation failed";
          console.warn(`[VoiceQueueManager] Chunk #${chunk.orderIndex + 1} failed:`, msg);
          chunk.state = "failed";
          chunk.error = msg;
          this.notify();
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, response.chunks.length) }, () =>
      worker()
    );

    Promise.all(workers).finally(() => {
      this.generationAbortControllers.delete(response.id);
    });
  }

  /**
   * Processes the next queued response.
   */
  private async processQueue(): Promise<void> {
    if (this.activeResponse || this.queue.length === 0) {
      return;
    }

    if (this.interResponseTimer) {
      clearTimeout(this.interResponseTimer);
      this.interResponseTimer = null;
    }

    // Check voice eligibility before playback
    if (!canPlayVoice()) {
      return;
    }

    const nextResponse = this.queue.shift();
    if (!nextResponse || nextResponse.state === "cancelled") {
      return;
    }

    this.activeResponse = nextResponse;
    nextResponse.state = "playing";
    nextResponse.startedAt = Date.now();
    this.notify();

    this.playbackAbortController = new AbortController();
    const { signal } = this.playbackAbortController;

    try {
      // Play chunks sequentially
      for (let i = 0; i < nextResponse.chunks.length; i++) {
        if (signal.aborted || (nextResponse.state as ResponseState) === "cancelled") {
          break;
        }

        nextResponse.currentChunkIndex = i;
        const chunk = nextResponse.chunks[i];

        // Ensure voice playback is still allowed (e.g. route didn't change)
        if (!canPlayVoice()) {
          console.debug("[VoiceQueueManager] Voice eligibility revoked during playback. Stopping.");
          break;
        }

        // Await chunk readiness if generation is in-flight
        if (chunk.state === "pending" || chunk.state === "generating") {
          await this.waitForChunkReady(chunk, signal);
        }

        if (signal.aborted || (nextResponse.state as ResponseState) === "cancelled") {
          break;
        }

        // If chunk audio generation failed (e.g. ElevenLabs quota exhausted), fall back to browser Web Speech API
        if (chunk.state === "failed" || !chunk.audioUrl) {
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            console.log(
              `[VoiceQueueManager] ElevenLabs audio unavailable; using browser speech fallback for chunk #${
                chunk.orderIndex + 1
              }: "${chunk.text}"`
            );
            chunk.state = "playing";
            this.notify();
            try {
              this.recordSpokenText(chunk.text);
              await audioPlayer.speakBrowserText(chunk.text, signal);
              chunk.state = "completed";
              this.notify();
              continue;
            } catch (err: unknown) {
              if (signal.aborted) break;
              console.warn(
                `[VoiceQueueManager] Browser speech fallback error for chunk #${
                  chunk.orderIndex + 1
                }:`,
                err
              );
              chunk.state = "failed";
              this.notify();
            }
          }
          continue;
        }

        chunk.state = "playing";
        this.notify();

        try {
          this.recordSpokenText(chunk.text);
          await audioPlayer.playAudioUrl(chunk.audioUrl, signal);
          chunk.state = "completed";
          this.notify();
          // Clean up chunk audio immediately after it finishes playing
          await audioStorage.revokeAudio(chunk.id);
        } catch (err: unknown) {
          if (signal.aborted) break;
          console.warn(`[VoiceQueueManager] Chunk #${chunk.orderIndex + 1} playback error:`, err);
          chunk.state = "failed";
          this.notify();
        }
      }

      const playedAny = nextResponse.chunks.some((c) => c.state === "completed");
      if (playedAny) {
        nextResponse.state = "completed";
      } else if ((nextResponse.state as ResponseState) !== "cancelled") {
        nextResponse.state = "failed";
        nextResponse.error =
          nextResponse.chunks.find((c) => c.error)?.error ||
          "All audio chunks failed generation or playback";
        console.warn("[VoiceQueueManager] Voice response failed:", nextResponse.error);
      }
      nextResponse.finishedAt = Date.now();
      this.recordSpokenText(nextResponse.cleanText);
    } catch (err) {
      if (!signal.aborted) {
        nextResponse.state = "failed";
        nextResponse.error = (err as Error)?.message || "Playback failed";
      }
    } finally {
      // Cleanup response audio resources
      await audioStorage.revokeResponseAudio(nextResponse.id);
      this.activeResponse = null;
      this.playbackAbortController = null;
      this.notify();

      // If more responses are queued, wait for the configurable inter-response delay
      if (this.queue.length > 0) {
        this.interResponseTimer = setTimeout(() => {
          this.interResponseTimer = null;
          this.processQueue();
        }, this.interResponseDelayMs);
      }
    }
  }

  /**
   * Helper that waits for a chunk to become ready or fail.
   */
  private waitForChunkReady(chunk: QueuedChunk, signal: AbortSignal): Promise<void> {
    if (chunk.state === "ready" || chunk.state === "failed") {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (chunk.state === "ready" || chunk.state === "failed" || signal.aborted) {
          clearInterval(interval);
          resolve();
        }
      }, 50);

      signal.addEventListener(
        "abort",
        () => {
          clearInterval(interval);
          resolve();
        },
        { once: true }
      );
    });
  }

  /**
   * Retrieves the currently playing response.
   */
  getCurrentPlaying(): QueuedVoiceResponse | null {
    return this.activeResponse;
  }

  /**
   * Retrieves all pending responses in queue.
   */
  getPendingResponses(): QueuedVoiceResponse[] {
    return this.queue.filter((r) => r.state === "queued" || r.state === "generating");
  }

  /**
   * Returns a complete queue snapshot.
   */
  getSnapshot(): VoiceQueueSnapshot {
    return {
      currentResponse: this.activeResponse,
      pendingResponses: this.getPendingResponses(),
      interResponseDelayMs: this.interResponseDelayMs,
      isPaused: !canPlayVoice(),
      totalInQueue: (this.activeResponse ? 1 : 0) + this.queue.length,
    };
  }

  /**
   * Stops the current playing response and moves to the next response.
   */
  stopCurrent(): void {
    if (this.playbackAbortController) {
      this.playbackAbortController.abort();
    }
    audioPlayer.stop();

    if (this.activeResponse) {
      this.activeResponse.state = "cancelled";
      const respId = this.activeResponse.id;
      audioStorage.revokeResponseAudio(respId).catch(() => {});
      this.activeResponse = null;
    }

    if (this.interResponseTimer) {
      clearTimeout(this.interResponseTimer);
      this.interResponseTimer = null;
    }

    this.notify();

    // Immediately process next item
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Stops playback and removes all pending responses.
   * Cancels all in-flight generation requests and frees audio resources.
   */
  stopAll(): void {
    // 1. Stop active playback
    if (this.playbackAbortController) {
      this.playbackAbortController.abort();
      this.playbackAbortController = null;
    }
    audioPlayer.stop();

    // 2. Abort all chunk generation requests
    for (const [, ctrl] of this.generationAbortControllers.entries()) {
      ctrl.abort();
    }
    this.generationAbortControllers.clear();

    // 3. Clear delay timer
    if (this.interResponseTimer) {
      clearTimeout(this.interResponseTimer);
      this.interResponseTimer = null;
    }

    // 4. Mark all items as cancelled
    if (this.activeResponse) {
      this.activeResponse.state = "cancelled";
      this.activeResponse = null;
    }
    for (const r of this.queue) {
      r.state = "cancelled";
    }
    this.queue = [];

    // 5. Free all audio storage resources
    audioStorage.clearAll().catch(() => {});

    this.notify();
  }

  /**
   * Sets the configurable inter-response delay in milliseconds.
   */
  setInterResponseDelay(delayMs: number): void {
    this.interResponseDelayMs = Math.max(0, delayMs);
    this.notify();
  }

  /**
   * Gets the current inter-response delay in milliseconds.
   */
  getInterResponseDelay(): number {
    return this.interResponseDelayMs;
  }

  /**
   * Records spoken AI text to prevent acoustic feedback / self-echo loopback into the microphone.
   */
  public recordSpokenText(text: string): void {
    if (!text) return;
    const clean = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    this.lastSpokenTexts.push({ text: clean, timestamp: Date.now() });
    // Keep last 30 seconds of speech
    const cutoff = Date.now() - 30000;
    this.lastSpokenTexts = this.lastSpokenTexts.filter((item) => item.timestamp > cutoff);
  }

  /**
   * Returns recent spoken text entries from the last 30 seconds.
   */
  public getLastSpokenTexts(): string[] {
    const cutoff = Date.now() - 30000;
    return this.lastSpokenTexts
      .filter((item) => item.timestamp > cutoff)
      .map((item) => item.text);
  }

  /**
   * Determines whether an incoming transcribed speech phrase is self-echo from Mira's own speakers.
   * Compares against recently synthesized and played AI speech.
   */
  public isSelfEcho(incoming: string): boolean {
    if (!incoming) return false;
    const cleanIncoming = incoming
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanIncoming) return false;

    // Never suppress explicit interrupt / stop commands
    const isStop = [
      "stop",
      "quiet",
      "quite",
      "mute",
      "silence",
      "be quiet",
      "stop talking",
      "stop speaking",
      "shut up",
      "shush",
      "pause",
      "cancel",
      "mira stop",
    ].includes(cleanIncoming);
    if (isStop) return false;

    const incomingWords = cleanIncoming.split(/\s+/).filter(Boolean);
    if (incomingWords.length === 0) return false;

    const cutoff = Date.now() - 30000;
    this.lastSpokenTexts = this.lastSpokenTexts.filter((item) => item.timestamp > cutoff);

    for (const item of this.lastSpokenTexts) {
      // 1. Direct substring match
      if (item.text.includes(cleanIncoming)) {
        return true;
      }

      // 2. 3-word n-gram phrase match
      if (incomingWords.length >= 3) {
        for (let i = 0; i <= incomingWords.length - 3; i++) {
          const phrase = incomingWords.slice(i, i + 3).join(" ");
          if (item.text.includes(phrase)) {
            return true;
          }
        }
      }

      // 3. Significant word overlap (>= 60% of incoming words are in spoken text)
      if (incomingWords.length >= 2) {
        const spokenWordSet = new Set(item.text.split(/\s+/).filter(Boolean));
        let matches = 0;
        for (const w of incomingWords) {
          if (spokenWordSet.has(w)) matches++;
        }
        if (matches / incomingWords.length >= 0.6) {
          return true;
        }
      }
    }

    return false;
  }
}

export const voiceQueueManager = new VoiceQueueManager();
