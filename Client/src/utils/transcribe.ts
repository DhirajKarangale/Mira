/**
 * Mira Speech Recognition & Transcription Utility (TypeScript / Client-Only)
 *
 * Implements browser / WebView speech-to-text via window.webkitSpeechRecognition,
 * handling automatic restart with fresh SpeechRecognition instances, event subscription,
 * real-time dispatch, and disk persistence to `utils/transcribe.json` and `Client/src/utils/transcribe.json`.
 */

// Extend Window interface for Web Speech API recognition types
declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export interface TranscribeRecord {
  text: string;
  time: string;
  source?: "voice" | "chat";
}

export type TranscriptionCallback = (record: TranscribeRecord) => void;

class TranscribeManager {
  private recognition: any = null;
  private isListening = false;
  private shouldRestart = false;
  private restartTimer: any = null;
  private retryCount = 0;
  private callbacks: Set<TranscriptionCallback> = new Set();
  private lastTranscribedText = "";
  private lastTranscribedTime = 0;

  // WebRTC Audio Preprocessing & Level Metering
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private meterInterval: any = null;

  constructor() {
    // Lazy initialization on start() to ensure audio context is ready
  }

  /**
   * Initializes hardware/WebRTC DSP audio preprocessing.
   * Applying echoCancellation, noiseSuppression, and autoGainControl
   * cleans the microphone input before it enters the recognition engine.
   * Also computes live audio RMS levels for visual signal indicators.
   */
  private async initAudioPreprocessing(): Promise<void> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    if (this.micStream) return; // Already active

    try {
      // Engage browser & OS WebRTC Acoustic Echo Cancellation and Noise Reduction
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });

      this.micStream = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        const source = this.audioContext.createMediaStreamSource(stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        this.analyser = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        if (this.meterInterval) clearInterval(this.meterInterval);
        this.meterInterval = setInterval(() => {
          if (!this.analyser || !this.isListening) return;
          this.analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          const level = Math.min(1, Math.max(0, avg / 80));

          window.dispatchEvent(
            new CustomEvent("mira-audio-signal", {
              detail: { level, isSpeaking: level > 0.08 },
            })
          );
        }, 80);
      }
    } catch (err) {
      // Permission prompt declined or device in use; webkitSpeechRecognition can still run
      console.warn("[Transcribe] Audio preprocessing DSP init skipped:", err);
    }
  }

  private cleanupAudioPreprocessing(): void {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {}
      this.analyser = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.micStream = null;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mira-audio-signal", {
          detail: { level: 0, isSpeaking: false },
        })
      );
    }
  }

  /**
   * Safely aborts and destroys the current recognition instance
   * and detaches all event listeners so stale events do not fire.
   */
  private cleanupCurrentInstance(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      const oldInstance = this.recognition;
      this.recognition = null;
      try {
        oldInstance.onstart = null;
        oldInstance.onresult = null;
        oldInstance.onerror = null;
        oldInstance.onend = null;
        oldInstance.onspeechstart = null;
        oldInstance.onspeechend = null;
        oldInstance.abort();
      } catch (e) {
        // Ignore abort errors on already-ended instances
      }
    }
  }

  /**
   * Instantiates a fresh SpeechRecognition instance and starts listening.
   * In WebKit/Chromium (Chrome, Edge, WebView2), SpeechRecognition instances
   * CANNOT be re-used after ending. Recreating a new instance on every start
   * and auto-restart ensures continuous, multi-sentence transcription never dies.
   */
  private createAndStartInstance(): boolean {
    if (typeof window === "undefined" || !this.shouldRestart) {
      return false;
    }

    const SpeechRecognitionClass =
      window.webkitSpeechRecognition || window.SpeechRecognition;

    if (!SpeechRecognitionClass) {
      console.warn(
        "[Transcribe] window.webkitSpeechRecognition is not supported in this environment."
      );
      return false;
    }

    // Always clean up any existing instance first
    this.cleanupCurrentInstance();

    try {
      const instance = new SpeechRecognitionClass();
      this.recognition = instance;

      // Enable continuous mode for endless real-time conversation
      instance.continuous = true;
      instance.interimResults = false;

      // Regional accent adaptation: use user's configured or system locale
      const systemLang = typeof navigator !== "undefined" ? navigator.language : "en-US";
      const preferredLang =
        (typeof window !== "undefined" && localStorage.getItem("mira_transcribe_lang")) ||
        systemLang ||
        "en-US";
      instance.lang = preferredLang;

      // Request multiple phonetic hypothesis alternatives to select highest confidence
      instance.maxAlternatives = 3;

      instance.onstart = () => {
        if (this.recognition !== instance) return;
        this.isListening = true;
        this.retryCount = 0;
        console.log(`[Transcribe] Voice recognition listening (lang: ${instance.lang})...`);
        window.dispatchEvent(
          new CustomEvent("mira-mic-state-change", { detail: { isListening: true } })
        );
      };

      instance.onresult = async (event: any) => {
        if (this.recognition !== instance) return;
        const results = event.results;
        if (!results) return;

        const startIndex = typeof event.resultIndex === "number" ? event.resultIndex : 0;
        for (let i = startIndex; i < results.length; i++) {
          const item = results[i];
          if (!item) continue;

          // When interimResults is false, results are final
          const isFinal = item.isFinal !== false;
          if (isFinal) {
            // Evaluate all hypothesis alternatives and pick the highest confidence text
            let bestTranscript = "";
            let highestConfidence = -1;

            for (let a = 0; a < item.length; a++) {
              const alt = item[a];
              if (!alt?.transcript) continue;
              const conf = typeof alt.confidence === "number" ? alt.confidence : 0.8;
              if (conf > highestConfidence || !bestTranscript) {
                highestConfidence = conf;
                bestTranscript = alt.transcript;
              }
            }

            const cleanedText = cleanAndFormatTranscript(bestTranscript);
            if (cleanedText) {
              const now = Date.now();
              // Deduplicate rapid repeat events within 600ms
              if (
                cleanedText.toLowerCase() === this.lastTranscribedText.toLowerCase() &&
                now - this.lastTranscribedTime < 600
              ) {
                continue;
              }
              this.lastTranscribedText = cleanedText;
              this.lastTranscribedTime = now;

              const record: TranscribeRecord = {
                text: cleanedText,
                time: new Date().toISOString(),
                source: "voice",
              };

              console.log(
                `[Transcribe] Voice captured (confidence: ${Math.round(
                  highestConfidence * 100
                )}%):`,
                record
              );

              // 1. Notify subscriber callbacks
              this.callbacks.forEach((cb) => {
                try {
                  cb(record);
                } catch (e) {
                  console.error("[Transcribe] Callback error:", e);
                }
              });

              // 2. Persist to transcribe.json
              await recordTranscription(record.text, record.time, "voice");
            }
          }
        }
      };

      instance.onerror = (event: any) => {
        if (this.recognition !== instance) return;
        const error = event.error;

        // "no-speech" is normal silence timeout in Chromium; onend will automatically restart
        if (error === "no-speech") {
          return;
        }

        console.warn("[Transcribe] Speech recognition status:", error);

        if (error === "not-allowed" || error === "service-not-allowed") {
          console.error("[Transcribe] Microphone access denied:", error);
          this.shouldRestart = false;
          this.isListening = false;
          this.cleanupCurrentInstance();
          this.cleanupAudioPreprocessing();
          window.dispatchEvent(
            new CustomEvent("mira-mic-state-change", { detail: { isListening: false } })
          );
          return;
        }

        // For audio-capture or transient network hiccups, back off slightly
        this.retryCount++;
      };

      instance.onend = () => {
        if (this.recognition !== instance) return;

        this.isListening = false;

        // Auto-restart loop with fresh instance if mic is still active
        if (this.shouldRestart) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          const delay = Math.min(200 + this.retryCount * 150, 1500);
          this.restartTimer = setTimeout(() => {
            if (this.shouldRestart) {
              this.createAndStartInstance();
            }
          }, delay);
        } else {
          this.cleanupAudioPreprocessing();
          window.dispatchEvent(
            new CustomEvent("mira-mic-state-change", { detail: { isListening: false } })
          );
        }
      };

      instance.start();
      return true;
    } catch (err: any) {
      console.warn("[Transcribe] Start error:", err);
      this.retryCount++;
      if (this.shouldRestart) {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        const delay = Math.min(300 + this.retryCount * 200, 2000);
        this.restartTimer = setTimeout(() => {
          if (this.shouldRestart) {
            this.createAndStartInstance();
          }
        }, delay);
      }
      return false;
    }
  }

  public start(): boolean {
    if (typeof window === "undefined") return false;

    // Idempotent: If already listening and shouldRestart is true, do not interrupt
    if (this.shouldRestart && this.recognition && this.isListening) {
      return true;
    }

    this.shouldRestart = true;
    this.retryCount = 0;

    // Trigger WebRTC audio preprocessing & metering in background
    this.initAudioPreprocessing().catch(() => {});

    return this.createAndStartInstance();
  }

  public stop(): void {
    this.shouldRestart = false;
    this.retryCount = 0;
    this.cleanupCurrentInstance();
    this.cleanupAudioPreprocessing();
    this.isListening = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mira-mic-state-change", { detail: { isListening: false } })
      );
    }
  }

  public getIsListening(): boolean {
    return this.isListening || this.shouldRestart;
  }

  public onTranscription(callback: TranscriptionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
}

/**
 * Intelligent acoustic transcript formatter:
 * 1. Removes stuttered duplicate words
 * 2. Fixes lowercase personal pronouns (I, I'm, I'll, etc.)
 * 3. Enforces sentence capitalization and normalized whitespace
 */
export function cleanAndFormatTranscript(raw: string): string {
  let text = (raw || "").trim();
  if (!text) return "";

  // 1. Remove stuttered consecutive duplicate words (e.g., "the the" -> "the")
  text = text.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // 2. Fix lowercase standalone "i" and contractions
  text = text.replace(/\bi\b/g, "I");
  text = text.replace(/\bi'm\b/gi, "I'm");
  text = text.replace(/\bi'll\b/gi, "I'll");
  text = text.replace(/\bi've\b/gi, "I've");
  text = text.replace(/\bi'd\b/gi, "I'd");

  // 3. Ensure sentence starts with a capital letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // 4. Clean extra spaces
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

export const transcribeManager = new TranscribeManager();

/**
 * Record a transcription or chat item to transcribe.json
 */
export async function recordTranscription(
  text: string,
  time?: string,
  source: "voice" | "chat" = "voice"
): Promise<TranscribeRecord | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const record: TranscribeRecord = {
    text: trimmed,
    time: time || new Date().toISOString(),
    source,
  };

  // 1. Direct file write via Client's Vite dev / local server middleware
  try {
    await fetch("/api/save-transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.warn("[Transcribe] Vite direct save failed:", err);
  }

  // 2. Persist to localStorage cache
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("mira_transcriptions");
      let list: TranscribeRecord[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      const isDup = list.some(
        (existing) => existing.text === record.text && existing.time === record.time
      );
      if (!isDup) {
        list.push(record);
        if (list.length > 500) list = list.slice(list.length - 500);
        localStorage.setItem("mira_transcriptions", JSON.stringify(list));
      }
    }
  } catch {}

  // 3. Dispatch UI event so cards and badges update immediately
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mira-transcription", { detail: record }));
  }

  return record;
}

/**
 * Fetch all stored transcriptions from disk or localStorage with guaranteed cache-busting
 */
export async function getStoredTranscriptions(): Promise<TranscribeRecord[]> {
  try {
    const res = await fetch(`/api/get-transcribe?_t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("mira_transcriptions", JSON.stringify(data));
          }
        } catch {}
        return data;
      }
    }
  } catch (err) {
    console.warn("[Transcribe] Failed to fetch /api/get-transcribe:", err);
  }

  // Fallback to localStorage cache
  try {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("mira_transcriptions");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}

  return [];
}
