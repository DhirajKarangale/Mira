/**
 * Audio Storage Manager
 * Stores generated ElevenLabs audio chunks locally using browser IndexedDB,
 * provides memory-safe Object URLs, and automatically revokes audio resources
 * when chunks are completed, skipped, or cleared.
 */

const DB_NAME = "mira_voice_storage";
const DB_VERSION = 1;
const STORE_NAME = "audio_chunks";

interface StoredAudioRecord {
  chunkId: string;
  responseId: string;
  blob: Blob;
  createdAt: number;
}

class AudioStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private activeUrls: Map<string, string> = new Map(); // chunkId -> ObjectURL

  /**
   * Initializes or returns the cached IndexedDB connection.
   */
  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject(new Error("IndexedDB is not supported in this environment"));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "chunkId" });
          store.createIndex("by_responseId", "responseId", { unique: false });
          store.createIndex("by_createdAt", "createdAt", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error("Failed to open IndexedDB"));
      };
    });

    return this.dbPromise;
  }

  /**
   * Stores an audio Blob locally in IndexedDB and generates a memory-tracked Object URL.
   */
  async storeAudio(chunkId: string, responseId: string, blob: Blob): Promise<string> {
    // 1. Create and track Object URL
    this.revokeAudio(chunkId); // clean up any prior URL for this chunk
    const objectUrl = URL.createObjectURL(blob);
    this.activeUrls.set(chunkId, objectUrl);

    // 2. Persist to IndexedDB
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const record: StoredAudioRecord = {
          chunkId,
          responseId,
          blob,
          createdAt: Date.now(),
        };
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });
    } catch (err) {
      console.debug("[AudioStorage] IndexedDB write fallback to memory:", err);
    }

    return objectUrl;
  }

  /**
   * Retrieves an audio Blob by chunkId from memory or IndexedDB.
   */
  async getAudioBlob(chunkId: string): Promise<Blob | null> {
    try {
      const db = await this.getDb();
      return await new Promise<Blob | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(chunkId);
        getReq.onsuccess = () => {
          const record = getReq.result as StoredAudioRecord | undefined;
          resolve(record ? record.blob : null);
        };
        getReq.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Returns a playable Object URL for a chunkId.
   */
  async getAudioUrl(chunkId: string): Promise<string | null> {
    const existing = this.activeUrls.get(chunkId);
    if (existing) return existing;

    const blob = await this.getAudioBlob(chunkId);
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    this.activeUrls.set(chunkId, url);
    return url;
  }

  /**
   * Revokes the in-memory Object URL and removes the chunk record from IndexedDB.
   */
  async revokeAudio(chunkId: string): Promise<void> {
    const url = this.activeUrls.get(chunkId);
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      this.activeUrls.delete(chunkId);
    }

    try {
      const db = await this.getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const delReq = store.delete(chunkId);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => resolve();
      });
    } catch {}
  }

  /**
   * Cleans up all audio chunks associated with a specific response.
   */
  async revokeResponseAudio(responseId: string): Promise<void> {
    try {
      const db = await this.getDb();
      const chunkIds = await new Promise<string[]>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const index = tx.objectStore(STORE_NAME).index("by_responseId");
        const req = index.getAllKeys(responseId);
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => resolve([]);
      });

      for (const cid of chunkIds) {
        await this.revokeAudio(cid);
      }
    } catch {
      // Also scan in-memory URLs matching responseId prefix
      for (const [cid] of this.activeUrls.entries()) {
        if (cid.startsWith(`${responseId}_`)) {
          this.revokeAudio(cid);
        }
      }
    }
  }

  /**
   * Wipes all stored audio records and revokes all active Object URLs.
   */
  async clearAll(): Promise<void> {
    for (const [, url] of this.activeUrls.entries()) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    this.activeUrls.clear();

    try {
      const db = await this.getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const clearReq = store.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => resolve();
      });
    } catch {}
  }
}

export const audioStorage = new AudioStorageManager();
