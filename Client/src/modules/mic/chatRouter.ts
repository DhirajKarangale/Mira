/**
 * ChatRouter: Submits recognized voice commands to MIRA's chat system.
 * - If user is on the chat screen (/chats) and a session is open, submits to that session.
 * - If user is on another screen (or on /chats with no session), creates a new session.
 * - Preserves session history, optimistic messages, and sends query exactly once.
 * - Notifies via MessageBar whenever a command is sent to chat.
 */

import { engineService, type ChatSession, type ChatMessage } from "@/services/engine.service";
import { useChatStore } from "@/store/useChatStore";
import { toast, MessageBarColor } from "@/components";
import type { CommandSubmissionResult } from "./types";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ChatRouter {
  private isSubmitting = false;

  public getIsSubmitting(): boolean {
    return this.isSubmitting;
  }

  /**
   * Submits a validated voice command into MIRA's chat system.
   */
  public async submitCommand(command: string): Promise<CommandSubmissionResult> {
    const cleanCommand = (command || "").trim();
    if (!cleanCommand) {
      throw new Error("Cannot submit an empty voice command.");
    }

    // Guard against simultaneous double-submissions
    if (this.isSubmitting) {
      console.warn("[ChatRouter] A voice command submission is already in progress. Ignoring duplicate.");
      throw new Error("A voice command submission is already in progress.");
    }

    this.isSubmitting = true;
    let targetSessionId = "";

    try {
      const store = useChatStore.getState();
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      const isChatScreen = currentPath.startsWith("/chats");
      const activeSessionId = store.selectedSessionId;

      const hasOpenSessionOnChatScreen = isChatScreen && Boolean(activeSessionId);
      const isNewSession = !hasOpenSessionOnChatScreen;

      // Determine target session ID
      targetSessionId = hasOpenSessionOnChatScreen && activeSessionId
        ? activeSessionId
        : generateUUID();

      // Guard: Prevent double-send if THIS session is already awaiting a reply
      if (store.isSessionSending(targetSessionId)) {
        console.warn(`[ChatRouter] Session ${targetSessionId} is already sending a prompt. Skipping.`);
        toast.warning("Chat is already waiting for an AI response.", {
          title: "Session Busy",
          color: MessageBarColor.Yellow,
          duration: 3500,
        });
        return {
          success: false,
          sessionId: targetSessionId,
          jobId: "",
          isNewSession,
          command: cleanCommand,
          error: "Session is already waiting for a reply.",
        };
      }

      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();

      // If creating a brand new session, initialize session record in store cache
      if (isNewSession) {
        const titleSnippet =
          cleanCommand.length > 32
            ? `${cleanCommand.substring(0, 32)}...`
            : cleanCommand;

        const newSessionRecord: ChatSession = {
          session_id: targetSessionId,
          chat_name: titleSnippet,
          latest_created_at: nowIso,
          created_at: nowIso,
          message_count: 1,
        };

        // Add to cached sessions list in store
        store.setCachedSessions((prev) => [
          newSessionRecord,
          ...prev.filter((s) => s.session_id !== targetSessionId),
        ]);

        // Prevent initial session load wipeout
        store.setSkipInitialFetchSessionId(targetSessionId);
        store.setSelectedSessionId(targetSessionId);

        console.log(
          `[ChatRouter] Created new chat session "${newSessionRecord.chat_name}" (${targetSessionId}) from voice command.`
        );
      } else {
        // Update existing session's timestamp in cached list
        store.setCachedSessions((prev) => {
          const existing = prev.find((s) => s.session_id === targetSessionId);
          if (existing) {
            const updated = {
              ...existing,
              latest_created_at: nowIso,
              created_at: nowIso,
            };
            return [updated, ...prev.filter((s) => s.session_id !== targetSessionId)];
          }
          return prev;
        });
      }

      // Track sending status in global Zustand store
      store.setSendingSession(targetSessionId, jobId, cleanCommand);

      // Create optimistic user message
      const tempId = `temp-${Date.now()}`;
      const optimisticUserMsg: ChatMessage = {
        id: tempId,
        session_id: targetSessionId,
        role: "user",
        content: cleanCommand,
        created_at: nowIso.replace("T", " ").substring(0, 19),
      };

      store.addOptimisticMessage(targetSessionId, optimisticUserMsg);

      // Notify any active chat page view immediately for zero-latency DOM render
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mira:voice_command_submitted", {
            detail: {
              sessionId: targetSessionId,
              jobId,
              isNewSession,
              userMessage: optimisticUserMsg,
              command: cleanCommand,
            },
          })
        );
      }

      console.log(
        `[ChatRouter] Submitting voice command to session ${targetSessionId} (job: ${jobId}): "${cleanCommand}"`
      );

      // Send to Engine Service
      const response = await engineService.sendChatMessage({
        job_id: jobId,
        session_id: targetSessionId,
        content: cleanCommand,
      });

      // Synchronous AI message resolution (if returned directly)
      if (response.ai_message) {
        store.resolveAiMessage(
          targetSessionId,
          jobId,
          response.user_message,
          response.ai_message
        );
      } else {
        // Replace temp optimistic message with persisted user message
        store.replaceOptimisticUserMessage(
          targetSessionId,
          tempId,
          response.user_message
        );
      }

      return {
        success: true,
        sessionId: targetSessionId,
        jobId,
        isNewSession,
        command: cleanCommand,
      };
    } catch (err: unknown) {
      if (targetSessionId) {
        useChatStore.getState().clearSendingSession(targetSessionId);
      }
      const errorMsg = (err as Error)?.message || "Failed to submit voice command to chat.";
      console.error("[ChatRouter] Submission failed:", err);
      toast.error(errorMsg, {
        title: "Voice Command Error",
        color: MessageBarColor.Red,
        duration: 5000,
      });
      throw err;
    } finally {
      this.isSubmitting = false;
    }
  }
}

export const chatRouter = new ChatRouter();
