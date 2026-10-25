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

  // 1. Maintain global WebSocket connection to Engine
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;

    const notifyIfInactive = (targetSid: string, aiContent?: string) => {
      const store = useChatStore.getState();
      const isViewingThisChat =
        locationRef.current === "/chats" &&
        store.selectedSessionId === targetSid;

      if (!isViewingThisChat) {
        // Mark session as unread in store
        store.markSessionUnread(targetSid);

        const cleanContent = aiContent?.trim();
        const preview = cleanContent
          ? cleanContent.length > 90
            ? `${cleanContent.substring(0, 90)}...`
            : cleanContent
          : "Mira responded to your query";

        const matchedSession = store.cachedSessions.find(
          (s) => s.session_id === targetSid
        );
        const sessionTitle = matchedSession?.chat_name || "Conversation";

        toast.success(preview, {
          title: `New message in "${sessionTitle}"`,
          duration: 5000,
        });
      }
    };

    const connectWs = () => {
      if (!isMounted) return;
      try {
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
                store.resolveAiMessage(targetSid, job_id, user_message, ai_message);
                notifyIfInactive(targetSid, ai_message?.content);
              }
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

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
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
        try {
          const resp = await engineService.getChatsBySession(sid, {
            page: 1,
            limit: 10,
          });
          const msgs = resp.messages || [];
          const lastMsg = msgs[msgs.length - 1];

          // If AI response has arrived in Vault
          if (lastMsg && lastMsg.role === "ai") {
            store.setSessionMessages(sid, msgs);
            store.clearSendingSession(sid);

            const isViewingThisChat =
              locationRef.current === "/chats" &&
              store.selectedSessionId === sid;

            if (!isViewingThisChat) {
              store.markSessionUnread(sid);

              const cleanContent = lastMsg.content?.trim();
              const preview = cleanContent
                ? cleanContent.length > 90
                  ? `${cleanContent.substring(0, 90)}...`
                  : cleanContent
                : "Mira responded to your query";

              const matchedSession = store.cachedSessions.find(
                (s) => s.session_id === sid
              );
              const sessionTitle = matchedSession?.chat_name || "Conversation";

              toast.success(preview, {
                title: `New message in "${sessionTitle}"`,
                duration: 5000,
              });
            }
          }
        } catch (e) {
          console.debug("[Global Chat Poller] Polling check error:", e);
        }
      }
    };

    timer = setInterval(pollActiveSessions, 2500);
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
