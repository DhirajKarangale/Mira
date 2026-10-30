import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "@/components";
import {
  engineService,
  getEngineWebSocketUrl,
  type WebSocketChatResponse,
} from "@/services/engine.service";
import { useChatStore } from "@/store/useChatStore";

export function useGlobalChatSync() {
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const wsRef = useRef<WebSocket | null>(null);
  const notifiedIdsRef = useRef<Map<string, number>>(new Map());

  const notifyIfInactive = (
    targetSid: string,
    aiContent?: string,
    userPrompt?: string,
    dedupId?: string
  ) => {
    const store = useChatStore.getState();
    const isViewingThisChat =
      locationRef.current === "/chats" &&
      store.selectedSessionId === targetSid;

    if (!isViewingThisChat) {
      // Mark session as unread in store
      store.markSessionUnread(targetSid);

      const cleanContent = aiContent?.trim();
      const now = Date.now();

      // Deduplication key: combination of dedupId (message ID or job ID) or session + content snippet
      const dedupKey = dedupId || `${targetSid}:${cleanContent?.substring(0, 40) || ""}`;

      // Check if this exact message was already notified within the last 15 seconds
      const lastNotifiedAt = notifiedIdsRef.current.get(dedupKey);
      if (lastNotifiedAt && now - lastNotifiedAt < 15000) {
        return; // Suppress duplicate toast notification
      }

      // Check session-level throttling: don't show another notification for the same session within 3.5 seconds
      const sessionDedupKey = `session:${targetSid}`;
      const lastSessionNotifiedAt = notifiedIdsRef.current.get(sessionDedupKey);
      if (lastSessionNotifiedAt && now - lastSessionNotifiedAt < 3500) {
        return; // Suppress rapid duplicate toast for the same session
      }

      notifiedIdsRef.current.set(dedupKey, now);
      notifiedIdsRef.current.set(sessionDedupKey, now);

      // Prune old entries from cache (older than 30s)
      if (notifiedIdsRef.current.size > 100) {
        for (const [k, ts] of notifiedIdsRef.current.entries()) {
          if (now - ts > 30000) {
            notifiedIdsRef.current.delete(k);
          }
        }
      }

      const preview = cleanContent
        ? cleanContent.length > 90
          ? `${cleanContent.substring(0, 90)}...`
          : cleanContent
        : "Mira responded to your query";

      const matchedSession = store.cachedSessions.find(
        (s) => s.session_id === targetSid
      );
      const promptToUse = userPrompt || store.sendingSessions[targetSid]?.userPrompt;
      const sessionTitle =
        matchedSession?.chat_name ||
        (promptToUse ? `${promptToUse.substring(0, 24)}...` : "Conversation");

      toast.success(preview, {
        title: `New message in "${sessionTitle}"`,
        duration: 5000,
      });
    }
  };

  // 1. Maintain global WebSocket connection to Engine
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;

    const connectWs = () => {
      if (!isMounted) return;
      try {
        if (socket) {
          socket.onclose = null;
          socket.onerror = null;
          socket.onmessage = null;
          try {
            socket.close();
          } catch {}
          socket = null;
        }

        const wsUrl = getEngineWebSocketUrl();
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const data: any = JSON.parse(event.data);

            if (data.type === "chat_rename") {
              const { session_id, chat_name } = data;
              if (session_id && chat_name) {
                useChatStore.getState().setCachedSessions((prev) =>
                  prev.map((s) =>
                    s.session_id === session_id ? { ...s, chat_name } : s
                  )
                );
                window.dispatchEvent(
                  new CustomEvent("mira:chat_rename", {
                    detail: { session_id, chat_name },
                  })
                );
              }
            } else if (data.type === "chat_response") {
              const { job_id, session_id, user_message, ai_message } =
                data as WebSocketChatResponse;

              const store = useChatStore.getState();
              // Find target session ID either from session_id or matching job_id
              const targetSid =
                session_id ||
                Object.keys(store.sendingSessions).find(
                  (sid) => store.sendingSessions[sid]?.jobId === job_id
                );

              if (targetSid) {
                const userPrompt = store.sendingSessions[targetSid]?.userPrompt;
                store.resolveAiMessage(targetSid, job_id, user_message, ai_message);

                // Instantly notify active chat view for zero-latency DOM render
                window.dispatchEvent(
                  new CustomEvent("mira:chat_response", {
                    detail: {
                      session_id: targetSid,
                      job_id,
                      user_message,
                      ai_message,
                    },
                  })
                );

                notifyIfInactive(
                  targetSid,
                  ai_message?.content,
                  userPrompt,
                  ai_message?.id || job_id
                );
              }
            } else if (data.type === "daily_suggestions_update") {
              window.dispatchEvent(
                new CustomEvent("mira:daily_suggestions_update", {
                  detail: data,
                })
              );
            }
          } catch (e) {
            console.debug("[Global Chat WS] Message parsing error:", e);
          }
        };

        socket.onclose = () => {
          if (isMounted) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };

        socket.onerror = (e) => {
          console.debug("[Global Chat WS] Connection error:", e);
        };
      } catch (err) {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    // Heartbeat to keep WebSocket active and responsive
    const pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: "ping" }));
        } catch {}
      } else if (socket && (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING)) {
        connectWs();
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, []);

  // 2. Active Fallback Poller for in-flight sending sessions
  useEffect(() => {
    let timer: any = null;

    const pollActiveSessions = async () => {
      const store = useChatStore.getState();
      const activeIds = Object.keys(store.sendingSessions);
      if (activeIds.length === 0) return;

      for (const sid of activeIds) {
        // Double check session is still sending before querying backend
        if (!useChatStore.getState().sendingSessions[sid]) {
          continue;
        }

        try {
          let resp = await engineService.getChatsBySession(sid, {
            limit: 100,
          });

          // Re-check after async fetch if WebSocket resolved it while awaiting
          if (!useChatStore.getState().sendingSessions[sid]) {
            continue;
          }

          if (resp.total_pages > 1) {
            resp = await engineService.getChatsBySession(sid, {
              page: resp.total_pages,
              limit: 100,
            });
          }

          // Re-check again
          if (!useChatStore.getState().sendingSessions[sid]) {
            continue;
          }

          const msgs = resp.messages || [];
          const lastMsg = msgs[msgs.length - 1];

          // If AI response has arrived in Vault
          if (lastMsg && lastMsg.role === "ai") {
            const sendingInfo = store.sendingSessions[sid];
            const userPrompt = sendingInfo?.userPrompt;
            // Find matching user message in msgs so user prompt is never lost
            const matchedUserMsg =
              msgs.length >= 2 && msgs[msgs.length - 2]?.role === "user"
                ? msgs[msgs.length - 2]
                : ([...msgs].reverse().find((m) => m.role === "user") || null);

            store.resolveAiMessage(sid, sendingInfo?.jobId, matchedUserMsg, lastMsg);
            store.setSessionMessages(sid, msgs);

            // Instantly notify active chat view for zero-latency DOM render
            window.dispatchEvent(
              new CustomEvent("mira:chat_response", {
                detail: {
                  session_id: sid,
                  job_id: sendingInfo?.jobId,
                  user_message: matchedUserMsg,
                  ai_message: lastMsg,
                },
              })
            );

            notifyIfInactive(sid, lastMsg.content, userPrompt, lastMsg.id);
          }
        } catch (e) {
          console.debug("[Global Chat Poller] Polling check error:", e);
        }
      }
    };

    // Sub-second polling (800ms) while sending sessions are in flight
    timer = setInterval(pollActiveSessions, 800);
    return () => clearInterval(timer);
  }, []);

  // 3. Periodic Redis Sync to reconcile pending jobs
  useEffect(() => {
    const syncWithRedis = async () => {
      try {
        const pending = await engineService.getPendingChatSessions();
        if (pending && Object.keys(pending).length > 0) {
          useChatStore.getState().syncWithBackendPending(pending);
        }
      } catch (e) {
        console.debug("[Global Chat Sync] Redis sync check error:", e);
      }
    };

    syncWithRedis();
    const interval = setInterval(syncWithRedis, 15000);
    return () => clearInterval(interval);
  }, []);
}
