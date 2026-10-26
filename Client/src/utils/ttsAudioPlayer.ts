/**
 * Gapless Web Audio API Scheduler
 *
 * Stitches chunked audio buffers seamlessly using AudioContext sample-accurate
 * hardware scheduling. Guarantees FIFO chunk sequence playback like "one stroke"
 * with zero audible gaps or stutter between chunks.
 */

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentChunkIndex: number;
  totalChunks: number;
}

export type PlaybackCallback = (state: PlaybackState) => void;

export class TTSAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private nextStartTime: number = 0;
  private nextIndexToSchedule: number = 0;
  private totalExpectedChunks: number = 0;
  private receivedBuffers: Map<number, { buffer: AudioBuffer; text: string }> = new Map();
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private stateCallbacks: Set<PlaybackCallback> = new Set();
  private onFinishCallback: (() => void) | null = null;
  private finishTimeout: any = null;

  constructor() {
    // AudioContext will be initialized lazily on user gesture / playback start
  }

  private initAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.gainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  /**
   * Reset player state before starting a new speech session
   */
  public prepare(totalChunks: number, onFinish?: () => void) {
    this.stop();
    this.totalExpectedChunks = totalChunks;
    this.nextIndexToSchedule = 0;
    this.nextStartTime = 0;
    this.receivedBuffers.clear();
    this.isPlaying = true;
    this.isPaused = false;
    this.onFinishCallback = onFinish || null;
    this.notifyState();
  }

  /**
   * Enqueue a raw audio ArrayBuffer for a specific chunk index.
   * Decodes and schedules chunks in strict sequential order.
   */
  public async enqueueChunkAudio(
    chunkIndex: number,
    arrayBuffer: ArrayBuffer,
    chunkText: string
  ): Promise<void> {
    if (!this.isPlaying) return;

    const ctx = this.initAudioContext();

    try {
      // Decode audio stream (MP3 from ElevenLabs)
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

      // Store in sequencing map
      this.receivedBuffers.set(chunkIndex, { buffer: audioBuffer, text: chunkText });

      // Drain and schedule any sequentially ready chunks
      this.scheduleConsecutiveChunks();
    } catch (e) {
      console.error(`[TTSAudioPlayer] Error decoding audio chunk ${chunkIndex}:`, e);
    }
  }

  /**
   * Drain available buffers in strict 0, 1, 2, ... order and schedule on AudioContext
   */
  private scheduleConsecutiveChunks() {
    if (!this.audioCtx || !this.isPlaying) return;

    while (this.receivedBuffers.has(this.nextIndexToSchedule)) {
      const item = this.receivedBuffers.get(this.nextIndexToSchedule)!;
      this.receivedBuffers.delete(this.nextIndexToSchedule);

      const buffer = item.buffer;
      const index = this.nextIndexToSchedule;

      // Calculate sample-accurate start time for seamless one-stroke transition
      const currentTime = this.audioCtx.currentTime;
      const startTime = Math.max(currentTime + 0.04, this.nextStartTime);

      const sourceNode = this.audioCtx.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.connect(this.gainNode!);

      // Schedule at exact boundary
      sourceNode.start(startTime);
      this.scheduledSources.push(sourceNode);

      // Advance schedule pointer for the next chunk
      this.nextStartTime = startTime + buffer.duration;
      this.nextIndexToSchedule++;

      this.notifyState(index);

      // Clean up finished source node references
      sourceNode.onended = () => {
        const idx = this.scheduledSources.indexOf(sourceNode);
        if (idx !== -1) this.scheduledSources.splice(idx, 1);
      };

      // If all planned chunks have been scheduled, schedule session completion
      if (this.nextIndexToSchedule >= this.totalExpectedChunks && this.totalExpectedChunks > 0) {
        if (this.finishTimeout) clearTimeout(this.finishTimeout);
        const remainingSeconds = Math.max(0, this.nextStartTime - this.audioCtx.currentTime);
        this.finishTimeout = setTimeout(() => {
          if (this.isPlaying) {
            this.handlePlaybackComplete();
          }
        }, remainingSeconds * 1000 + 150);
      }
    }
  }

  private handlePlaybackComplete() {
    this.isPlaying = false;
    this.isPaused = false;
    this.notifyState();
    if (this.onFinishCallback) {
      try {
        this.onFinishCallback();
      } catch (e) {
        console.error("[TTSAudioPlayer] onFinish error:", e);
      }
    }
  }

  /**
   * Stop playback immediately and clear all scheduled audio nodes
   */
  public stop() {
    if (this.finishTimeout) {
      clearTimeout(this.finishTimeout);
      this.finishTimeout = null;
    }

    for (const source of this.scheduledSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.scheduledSources = [];
    this.receivedBuffers.clear();
    this.nextIndexToSchedule = 0;
    this.nextStartTime = 0;
    this.totalExpectedChunks = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.notifyState();
  }

  /**
   * Pause playback
   */
  public async pause() {
    if (this.audioCtx && this.isPlaying && !this.isPaused) {
      await this.audioCtx.suspend();
      this.isPaused = true;
      this.notifyState();
    }
  }

  /**
   * Resume playback
   */
  public async resume() {
    if (this.audioCtx && this.isPlaying && this.isPaused) {
      await this.audioCtx.resume();
      this.isPaused = false;
      this.notifyState();
    }
  }

  /**
   * Set volume from 0.0 to 1.0
   */
  public setVolume(volume: number) {
    if (this.gainNode && this.audioCtx) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.gainNode.gain.setValueAtTime(clamped, this.audioCtx.currentTime);
    }
  }

  public getPlaybackState(): PlaybackState {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentChunkIndex: this.nextIndexToSchedule,
      totalChunks: this.totalExpectedChunks,
    };
  }

  public onStateChange(cb: PlaybackCallback): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  private notifyState(currentChunk: number = this.nextIndexToSchedule) {
    const state: PlaybackState = {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentChunkIndex: currentChunk,
      totalChunks: this.totalExpectedChunks,
    };
    this.stateCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch {}
    });
  }
}

export const ttsAudioPlayer = new TTSAudioPlayer();
