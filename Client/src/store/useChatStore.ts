import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatMessage, ChatSession } from "@/services/engine.service";
import { chatVoiceBridge } from "@/modules/voice";

export interface SendingSessionDetails {
  jobId: string;
  startedAt: number;
  userPrompt?: string;
}

interface ChatStoreState {
  // Key: sessionId -> SendingSessionDetails
  sendingSessions: Record<string, SendingSessionDetails>;
  // Active session ID preserved across page navigation
  selectedSessionId: string | null;
  // Local cache of messages per session: sessionId -> ChatMessage[]
  sessionMessagesCache: Record<string, ChatMessage[]>;
  // Cached session metadata list
  cachedSessions: ChatSession[];
  // Input drafts preserved across navigation: sessionId | "new" -> draft text
  inputDrafts: Record<string, string>;
  // Ref marker to skip initial wipeout fetch when a brand new session was just created
  skipInitialFetchSessionId: string | null;
  // Unread sessions tracker: sessionId -> boolean
  unreadSessionIds: Record<string, boolean>;

  // Actions
  markSessionUnread: (sessionId: string) => void;
  markSessionRead: (sessionId: string) => void;
  clearAllUnreadSessions: () => void;
  isSessionUnread: (sessionId: string) => boolean;
  setSendingSession: (sessionId: string, jobId: string, userPrompt?: string) => void;
  clearSendingSession: (sessionId: string) => void;
  clearAllSendingSessions: () => void;
  isSessionSending: (sessionId: string | null) => boolean;

  setSelectedSessionId: (sessionId: string | null) => void;
  setSkipInitialFetchSessionId: (sessionId: string | null) => void;

  setSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
  addOptimisticMessage: (sessionId: string, message: ChatMessage) => void;
  replaceOptimisticUserMessage: (
    sessionId: string,
    tempId: string,
    savedUserMessage: ChatMessage
  ) => void;
  resolveAiMessage: (
    sessionId: string,
    jobId?: string,
    userMessage?: ChatMessage | null,
    aiMessage?: ChatMessage | null
  ) => void;

  removeSessionMessages: (sessionId: string) => void;
  clearAllSessionMessages: () => void;

  setCachedSessions: (
    sessions: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])
  ) => void;

  setInputDraft: (sessionId: string, draft: string) => void;

  // Synchronize with backend Redis pending jobs
  syncWithBackendPending: (
    pendingMap: Record<string, { job_id: string; created_at?: number; user_query?: string }>
  ) => void;

  // Heuristic recovery: if last message is role === 'user' without an AI reply, restore sending state
  checkAndRecoverPendingState: (sessionId: string, messages: ChatMessage[]) => boolean;
}

const MAX_SENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => ({
      sendingSessions: {},
      selectedSessionId: null,
      sessionMessagesCache: {},
      cachedSessions: [],
      inputDrafts: {},
      skipInitialFetchSessionId: null,
      unreadSessionIds: {},

      markSessionUnread: (sessionId) => {
        if (!sessionId) return;
        set((state) => ({
          unreadSessionIds: {
            ...state.unreadSessionIds,
            [sessionId]: true,
          },
        }));
      },

      markSessionRead: (sessionId) => {
        if (!sessionId) return;
        set((state) => {
          if (!state.unreadSessionIds[sessionId]) return state;
          const next = { ...state.unreadSessionIds };
          delete next[sessionId];
          return { unreadSessionIds: next };
        });
      },

      clearAllUnreadSessions: () => {
        set({ unreadSessionIds: {} });
      },

      isSessionUnread: (sessionId) => {
        if (!sessionId) return false;
        return Boolean(get().unreadSessionIds[sessionId]);
      },

      setSendingSession: (sessionId, jobId, userPrompt) => {
        if (!sessionId) return;
        set((state) => ({
          sendingSessions: {
            ...state.sendingSessions,
            [sessionId]: {
              jobId,
              startedAt: Date.now(),
              userPrompt: userPrompt ? userPrompt.substring(0, 150) : undefined,
            },
          },
        }));
      },

      clearSendingSession: (sessionId) => {
        if (!sessionId) return;
        set((state) => {
          if (!state.sendingSessions[sessionId]) return state;
          const next = { ...state.sendingSessions };
          delete next[sessionId];
          return { sendingSessions: next };
        });
      },

      clearAllSendingSessions: () => {
        set({ sendingSessions: {} });
      },

      isSessionSending: (sessionId) => {
        if (!sessionId) return false;
        const info = get().sendingSessions[sessionId];
        if (!info) return false;

        // Auto-heal if older than 5 minutes
        if (Date.now() - info.startedAt > MAX_SENDING_TIMEOUT_MS) {
          get().clearSendingSession(sessionId);
          return false;
        }
        return true;
      },

      setSelectedSessionId: (sessionId) => {
        set({ selectedSessionId: sessionId });
      },

      setSkipInitialFetchSessionId: (sessionId) => {
        set({ skipInitialFetchSessionId: sessionId });
      },

      setSessionMessages: (sessionId, messages) => {
        if (!sessionId) return;
        set((state) => ({
          sessionMessagesCache: {
            ...state.sessionMessagesCache,
            [sessionId]: messages,
          },
        }));
      },

      addOptimisticMessage: (sessionId, message) => {
        if (!sessionId || !message) return;
        set((state) => {
          const current = state.sessionMessagesCache[sessionId] || [];
          const exists = current.some((m) => m.id === message.id);
          if (exists) return state;
          return {
            sessionMessagesCache: {
              ...state.sessionMessagesCache,
              [sessionId]: [...current, message],
            },
          };
        });
      },

      replaceOptimisticUserMessage: (sessionId, tempId, savedUserMessage) => {
        if (!sessionId) return;
        set((state) => {
          const current = state.sessionMessagesCache[sessionId] || [];
          const updated = current.map((m) => (m.id === tempId ? savedUserMessage : m));
          return {
            sessionMessagesCache: {
              ...state.sessionMessagesCache,
              [sessionId]: updated,
            },
          };
        });
      },

      resolveAiMessage: (sessionId, _jobId, userMessage, aiMessage) => {
        if (!sessionId) return;
        set((state) => {
          const current = state.sessionMessagesCache[sessionId] || [];
          let updated = [...current];

          // 1. If userMessage is provided, replace any temp- matching items
          if (userMessage) {
            updated = updated.map((m) => {
              if (
                m.id.startsWith("temp-") &&
                (m.content === userMessage.content || m.content.trim() === userMessage.content.trim())
              ) {
                return userMessage;
              }
              return m;
            });
          }

          // 2. Remove remaining temp- items for this session
          updated = updated.filter((m) => !m.id.startsWith("temp-"));

          // 3. Append aiMessage if provided and not yet in the list
          if (aiMessage && !updated.some((m) => m.id === aiMessage.id)) {
            updated.push(aiMessage);
          }

          // 4. Clear sending state for this session
          const nextSending = { ...state.sendingSessions };
          delete nextSending[sessionId];

          return {
            sessionMessagesCache: {
              ...state.sessionMessagesCache,
              [sessionId]: updated,
            },
            sendingSessions: nextSending,
          };
        });

        // Simultaneously dispatch AI response text to voice submodule with 0ms delay
        if (aiMessage?.content) {
          try {
            chatVoiceBridge.handleAiResponse(aiMessage.id, aiMessage.content);
          } catch (err) {
            console.debug("[ChatVoiceBridge] Failed to enqueue AI speech response:", err);
          }
        }
      },

      removeSessionMessages: (sessionId) => {
        if (!sessionId) return;
        set((state) => {
          if (!state.sessionMessagesCache[sessionId]) return state;
          const next = { ...state.sessionMessagesCache };
          delete next[sessionId];
          return { sessionMessagesCache: next };
        });
      },

      clearAllSessionMessages: () => {
        set({ sessionMessagesCache: {} });
      },

      setCachedSessions: (updater) => {
        set((state) => ({
          cachedSessions:
            typeof updater === "function" ? updater(state.cachedSessions) : updater,
        }));
      },

      setInputDraft: (sessionId, draft) => {
        set((state) => ({
          inputDrafts: {
            ...state.inputDrafts,
            [sessionId || "new"]: draft,
          },
        }));
      },

      syncWithBackendPending: (pendingMap) => {
        if (!pendingMap || typeof pendingMap !== "object") return;
        const now = Date.now();
        set((state) => {
          const merged = { ...state.sendingSessions };
          let changed = false;

          for (const [sid, info] of Object.entries(pendingMap)) {
            if (!info || !info.job_id) continue;
            // If we don't already track this session or if it's reported active in Redis
            if (!merged[sid]) {
              merged[sid] = {
                jobId: info.job_id,
                startedAt: info.created_at ? info.created_at * 1000 : now,
                userPrompt: info.user_query,
              };
              changed = true;
            }
          }

          return changed ? { sendingSessions: merged } : state;
        });
      },

      checkAndRecoverPendingState: (sessionId, messages) => {
        if (!sessionId || !messages || messages.length === 0) return false;
        const lastMsg = messages[messages.length - 1];

        // If the last message in this session is user, an AI reply is still pending!
        if (lastMsg && lastMsg.role === "user") {
          const now = Date.now();
          const currentSending = get().sendingSessions[sessionId];

          // If not currently marked sending, activate it so loading anim appears
          if (!currentSending) {
            get().setSendingSession(
              sessionId,
              `recovered-${now}`,
              lastMsg.content
            );
            return true;
          }
          return true;
        }

        // If last message is AI, ensure sending state is cleared
        if (lastMsg && lastMsg.role === "ai") {
          if (get().sendingSessions[sessionId]) {
            get().clearSendingSession(sessionId);
          }
          return false;
        }

        return false;
      },
    }),
    {
      name: "mira-chat-store",
      storage: createJSONStorage(() => localStorage),
      // Persist selectedSessionId, sendingSessions, inputDrafts, unreadSessionIds, cachedSessions, and sessionMessagesCache
      partialize: (state) => {
        // Keep up to 30 most recently viewed sessions and 50 messages per session for fast rehydration
        const trimmedCache: Record<string, ChatMessage[]> = {};
        const cacheEntries = Object.entries(state.sessionMessagesCache || {});
        for (const [sid, msgs] of cacheEntries.slice(-30)) {
          if (Array.isArray(msgs)) {
            // Strip any pending optimistic temp messages so they don't persist as ghosts
            trimmedCache[sid] = msgs.filter((m) => !m.id.startsWith("temp-")).slice(-50);
          }
        }

        return {
          selectedSessionId: state.selectedSessionId,
          sendingSessions: state.sendingSessions,
          inputDrafts: state.inputDrafts,
          unreadSessionIds: state.unreadSessionIds,
          cachedSessions: (state.cachedSessions || []).slice(0, 50),
          sessionMessagesCache: trimmedCache,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Purge any stale sending sessions on rehydration (> 5 mins)
        const now = Date.now();
        const validSending: Record<string, SendingSessionDetails> = {};
        for (const [sid, info] of Object.entries(state.sendingSessions || {})) {
          if (info && now - info.startedAt < MAX_SENDING_TIMEOUT_MS) {
            validSending[sid] = info;
          }
        }
        state.sendingSessions = validSending;
      },
    }
  )
);
