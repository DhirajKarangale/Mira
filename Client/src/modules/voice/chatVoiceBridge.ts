import { canPlayVoice } from "./eligibility";
import { voiceQueueManager } from "./voiceQueueManager";
import { useVoiceStore } from "@/store/useVoiceStore";

class ChatVoiceBridge {
  private processedMessageIds: Set<string> = new Set();
  private isSubscribedToStore = false;

  constructor() {
    this.initStoreListener();
    this.initRouteListener();
  }

  /**
   * Watches store configuration changes. If master voice is disabled,
   * immediately halts any active or queued playback.
   */
  private initStoreListener(): void {
    if (this.isSubscribedToStore) return;
    this.isSubscribedToStore = true;

    useVoiceStore.subscribe((state, prevState) => {
      // If master voice is turned off, immediately stop all queued and playing audio
      if (prevState.voiceEnableMaster && !state.voiceEnableMaster) {
        voiceQueueManager.stopAll();
      }

      // If typing speech is turned off and user is currently on /chats, stop current playback
      if (
        prevState.voiceEnableWhileTyping &&
        !state.voiceEnableWhileTyping &&
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/chats")
      ) {
        voiceQueueManager.stopAll();
      }
    });
  }

  /**
   * Watches browser route navigation to immediately pause/stop speech if route rules dictate.
   */
  private initRouteListener(): void {
    if (typeof window === "undefined") return;

    window.addEventListener("popstate", () => {
      this.handleRouteChange();
    });
  }

  /**
   * Called whenever route changes in the single-page application.
   */
  handleRouteChange(newRoute?: string): void {
    const route = newRoute || (typeof window !== "undefined" ? window.location.pathname : "");
    if (!canPlayVoice(route)) {
      // If not eligible on new route (e.g. user entered /chats without voice_enable_while_typing)
      voiceQueueManager.stopAll();
    }
  }

  /**
   * Handles incoming AI LLM message responses:
   * - Deduplicates across repeated events (WebSocket, polling, and HTTP).
   * - Validates voice eligibility.
   * - Non-blockingly submits text to the voice queue manager for concurrent audio generation and playback.
   */
  handleAiResponse(messageId: string, content?: string): void {
    if (!content || !content.trim()) {
      return;
    }

    const dedupKey = messageId || content.trim().substring(0, 60);

    // Prevent duplicate playback when the same response arrives through multiple events
    if (this.processedMessageIds.has(dedupKey)) {
      return;
    }

    this.processedMessageIds.add(dedupKey);

    // Prune deduplication cache if it grows large
    if (this.processedMessageIds.size > 300) {
      const iterator = this.processedMessageIds.values();
      for (let i = 0; i < 100; i++) {
        const next = iterator.next();
        if (!next.done) {
          this.processedMessageIds.delete(next.value);
        }
      }
    }

    // Check voice eligibility
    if (!canPlayVoice()) {
      return;
    }

    // Submit non-blockingly
    voiceQueueManager.submitResponse(content, messageId).catch((err) => {
      console.debug("[ChatVoiceBridge] Failed to enqueue AI speech response:", err);
    });
  }
}

export const chatVoiceBridge = new ChatVoiceBridge();
