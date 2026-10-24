import { useState, useEffect, useRef, useCallback, useMemo, type FC } from "react";
import {
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  MessageCircle,
  Bot,
  User,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Send,
  ArrowDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import { toast } from "@/components";
import {
  engineService,
  getEngineWebSocketUrl,
  type ChatSession,
  type ChatMessage,
  type WebSocketChatResponse,
} from "@/services/engine.service";
import { cn } from "@/lib/utils";

const CHAT_LOADING_MESSAGES: readonly string[] = [
  "Reflecting on your query...",
  "Consulting short-term memory...",
  "Analyzing dialogue context...",
  "Formulating response...",
  "Synthesizing thoughts...",
  "Connecting the dots...",
  "Scanning conversation history...",
  "Crafting a personalized answer...",
  "Retrieving knowledge...",
  "Processing your request...",
  "Drafting reply...",
  "Calibrating response...",
  "Reviewing recent activity...",
  "Finalizing insights...",
  "Polishing the details...",
] as const;

export const ChatsPage: FC = () => {
  // ============================================================================
  // Sessions State
  // ============================================================================
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState<boolean>(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsPage, setSessionsPage] = useState<number>(1);
  const [sessionsTotalItems, setSessionsTotalItems] = useState<number>(0);
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // ============================================================================
  // Messages State
  // ============================================================================
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesPage, setMessagesPage] = useState<number>(1);
  const [messagesTotalPages, setMessagesTotalPages] = useState<number>(1);
  const [messagesTotalCount, setMessagesTotalCount] = useState<number>(0);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [messagesHasMore, setMessagesHasMore] = useState<boolean>(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState<boolean>(false);

  // ============================================================================
  // Input & WebSocket State
  // ============================================================================
  const [inputText, setInputText] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<number>(0);
  const pendingJobIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Scroll reference
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInitialSessionLoadRef = useRef<boolean>(false);

  // Issue 9: Auto-resize input textarea height-wise up to 180px
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 180);
    el.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);

  // Cycle through 15 loading messages every 2.5s while waiting for response
  useEffect(() => {
    if (!isSending) {
      setLoadingMessageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % CHAT_LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [isSending]);

  // ============================================================================
  // Format Date Helper (Displays in User's Local Time)
  // ============================================================================
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return "Just now";
    try {
      const trimmed = dateStr.trim();
      let isoStr = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
      // If no timezone offset is specified (no 'Z', no '+', no trailing '-HH:MM'), append 'Z'
      // because Vault stores UTC timestamps in SQLite
      if (!isoStr.endsWith("Z") && !isoStr.includes("+") && !/-\d{2}:\d{2}$/.test(isoStr)) {
        isoStr += "Z";
      }
      const date = new Date(isoStr);
      if (isNaN(date.getTime())) return dateStr;

      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const timePart = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (isToday) {
        return `Today at ${timePart}`;
      }

      return (
        date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        }) + ` • ${timePart}`
      );
    } catch {
      return dateStr;
    }
  };

  // ============================================================================
  // Fetch Sessions
  // ============================================================================
  const fetchSessions = useCallback(
    async (pageToLoad: number = 1, cursorToUse?: string | null, append: boolean = false) => {
      try {
        if (!append) {
          setSessionsLoading(true);
        }
        setSessionsError(null);

        const data = await engineService.getChatSessions({
          page: pageToLoad,
          cursor: cursorToUse || undefined,
          limit: 10,
        });

        if (append) {
          setSessions((prev) => {
            const existingIds = new Set(prev.map((s) => s.session_id));
            const newItems = data.sessions.filter((s) => !existingIds.has(s.session_id));
            return [...prev, ...newItems];
          });
        } else {
          setSessions(data.sessions || []);
        }

        setSessionsPage(data.current_page || pageToLoad);
        setSessionsTotalItems(data.total_items ?? data.sessions?.length ?? 0);
        setSessionsCursor(data.next_cursor || null);
        setSessionsHasMore(Boolean(data.has_more));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load chat sessions";
        setSessionsError(message);
        if (!append) {
          setSessions([]);
        }
      } finally {
        setSessionsLoading(false);
      }
    },
    [selectedSessionId]
  );

  useEffect(() => {
    fetchSessions(1, null, false);
  }, []);

  const handleSessionsScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (sessionsLoading || !sessionsHasMore || !sessionsCursor) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      fetchSessions(sessionsPage + 1, sessionsCursor, true);
    }
  };

  // ============================================================================
  // Fetch Messages
  // ============================================================================
  const fetchMessages = useCallback(
    async (
      sessionId: string,
      pageToLoad: number = 1,
      cursorToUse?: string | null,
      append: boolean = false
    ) => {
      if (!sessionId) return;
      try {
        if (!append) {
          setMessagesLoading(true);
        } else {
          setLoadingMoreMessages(true);
        }
        setMessagesError(null);

        const data = await engineService.getChatsBySession(sessionId, {
          page: pageToLoad,
          cursor: cursorToUse || undefined,
          limit: 30,
        });

        if (append) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newItems = (data.messages || []).filter(
              (m) =>
                !existingIds.has(m.id) &&
                !prev.some((p) => p.role === "user" && m.role === "user" && p.content === m.content)
            );
            return [...prev, ...newItems];
          });
        } else {
          // Clean up any historical duplicate user messages from DB
          const deduped: ChatMessage[] = [];
          for (const m of data.messages || []) {
            const isDup = deduped.some(
              (p) => p.id === m.id || (p.role === "user" && m.role === "user" && p.content === m.content)
            );
            if (!isDup) {
              deduped.push(m);
            }
          }
          setMessages(deduped);
        }

        const fetchedCount = Math.max(
          data.total_messages ?? 0,
          append ? messages.length + (data.messages?.length || 0) : (data.messages?.length || 0)
        );
        setMessagesPage(data.current_page || pageToLoad);
        setMessagesTotalPages(data.total_pages || 1);
        setMessagesTotalCount(fetchedCount);
        setSessions((prev) =>
          prev.map((s) =>
            s.session_id === sessionId
              ? { ...s, message_count: fetchedCount }
              : s
          )
        );
        setMessagesCursor(data.next_cursor || null);
        setMessagesHasMore(Boolean(data.has_more));

        if (!append) {
          // Issue 5: Start directly at the bottom without animated scrolling
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load messages";
        setMessagesError(message);
        if (!append) {
          setMessages([]);
        }
      } finally {
        setMessagesLoading(false);
        setLoadingMoreMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedSessionId) {
      isInitialSessionLoadRef.current = true;
      fetchMessages(selectedSessionId, 1, null, false);
    } else {
      setMessages([]);
      setMessagesPage(1);
      setMessagesTotalPages(1);
      setMessagesTotalCount(0);
      setMessagesCursor(null);
      setMessagesHasMore(false);
    }
  }, [selectedSessionId, fetchMessages]);

  // Jump to bottom immediately as soon as session messages render in DOM
  useEffect(() => {
    if (isInitialSessionLoadRef.current && messages.length > 0) {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      isInitialSessionLoadRef.current = false;
    }
  }, [messages]);

  // Keep active session message count in sidebar and top header synchronized in real-time
  useEffect(() => {
    if (!selectedSessionId || messages.length === 0) return;
    setMessagesTotalCount((prev) => Math.max(prev, messages.length));
    setSessions((prev) =>
      prev.map((s) =>
        s.session_id === selectedSessionId
          ? { ...s, message_count: Math.max(s.message_count || 0, messages.length) }
          : s
      )
    );
  }, [messages.length, selectedSessionId]);

  // Connect to Engine WebSocket for real-time response delivery
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;

    const connectWs = () => {
      if (!isMounted) return;
      try {
        const wsUrl = getEngineWebSocketUrl();
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const data: WebSocketChatResponse = JSON.parse(event.data);
            if (data.type === "chat_response") {
              const { job_id, session_id, user_message, ai_message } = data;

              const isMatch =
                (selectedSessionId && session_id === selectedSessionId) ||
                (pendingJobIdRef.current && pendingJobIdRef.current === job_id);

              if (isMatch) {
                if (ai_message) {
                  setMessages((prev) => {
                    const hasAi = prev.some((m) => m.id === ai_message.id);
                    if (hasAi) return prev;

                    // 1. Replace any optimistic temp- user message in-place at its original position
                    const updated = prev.map((m) => {
                      if (m.id.startsWith("temp-") && user_message && m.content === user_message.content) {
                        return user_message;
                      }
                      return m;
                    });

                    // 2. Remove any remaining temp- items for this query
                    const filtered = updated.filter((m) => !m.id.startsWith("temp-"));

                    // 3. Append ONLY the AI message at the end
                    return [...filtered, ai_message];
                  });
                }

                if (!selectedSessionId && session_id) {
                  setSelectedSessionId(session_id);
                }

                setIsSending(false);
                pendingJobIdRef.current = null;
                fetchSessions(1, null, false);

                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }
            }
          } catch (e) {
            console.error("[Chat WS] Error parsing message:", e);
          }
        };

        socket.onclose = () => {
          if (isMounted) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };

        socket.onerror = (e) => {
          console.debug("[Chat WS] Connection error:", e);
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
  }, [selectedSessionId, fetchSessions]);

  const handleLoadMoreMessages = () => {
    if (!selectedSessionId || loadingMoreMessages || !messagesHasMore) return;
    fetchMessages(selectedSessionId, messagesPage + 1, messagesCursor, true);
  };

  // ============================================================================
  // Sending Message
  // ============================================================================
  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    pendingJobIdRef.current = jobId;

    setIsSending(true);
    setInputText("");

    const tempId = `temp-${Date.now()}`;
    const optimisticUserMsg: ChatMessage = {
      id: tempId,
      session_id: selectedSessionId || "new-session",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

    try {
      const response = await engineService.sendChatMessage({
        job_id: jobId,
        session_id: selectedSessionId || undefined,
        content: trimmed,
      });

      const actualSessionId = response.session_id;
      if (!selectedSessionId || selectedSessionId !== actualSessionId) {
        setSelectedSessionId(actualSessionId);
      }

      // If response returned synchronous ai_message (e.g. fallback)
      if (response.ai_message) {
        setMessages((prev) => {
          const hasAi = prev.some((m) => m.id === response.ai_message!.id);
          const hasUser = prev.some((m) => m.id === response.user_message.id || (m.role === "user" && m.content === trimmed));
          if (hasAi && hasUser) {
            return prev.filter((m) => m.id !== tempId);
          }
          const filtered = prev.filter((m) => m.id !== tempId && m.id !== response.user_message.id);
          return [...filtered, response.user_message, response.ai_message!];
        });
        setIsSending(false);
        pendingJobIdRef.current = null;
        fetchSessions(1, null, false);
      } else {
        // Job is queued into llm_chat stream; replace tempId in-place with saved user msg
        setMessages((prev) => {
          const hasTemp = prev.some((m) => m.id === tempId);
          if (hasTemp) {
            // Replace tempId in-place at its original position
            return prev.map((m) => (m.id === tempId ? response.user_message : m));
          }
          // If temp was already removed or replaced (e.g. WebSocket arrived first)
          const alreadyHasUser = prev.some(
            (m) => m.id === response.user_message.id || (m.role === "user" && m.content === trimmed)
          );
          if (alreadyHasUser) {
            return prev; // Do not append duplicate user query after AI response!
          }
          return [...prev, response.user_message];
        });
        // 35-second safety fallback timeout in case WebSocket misses the event
        setTimeout(() => {
          if (pendingJobIdRef.current === jobId) {
            setIsSending(false);
            pendingJobIdRef.current = null;
            if (actualSessionId) {
              fetchMessages(actualSessionId, 1, null, false);
            }
          }
        }, 35000);
      }

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message, { title: "Chat Error" });
      setIsSending(false);
      pendingJobIdRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStartNewChat = () => {
    setSelectedSessionId(null);
    setMessages([]);
    setInputText("");
  };

  const handleCopySessionId = (sid: string) => {
    navigator.clipboard.writeText(sid);
    setCopiedSessionId(sid);
    toast.info("Session ID copied to clipboard", { title: "Copied" });
    setTimeout(() => setCopiedSessionId(null), 2000);
  };

  // ============================================================================
  // Filtered Sessions (Issue 6: Search by Name or Session ID)
  // ============================================================================
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase().trim();
    return sessions.filter((s) => {
      const nameMatches = s.chat_name ? s.chat_name.toLowerCase().includes(query) : false;
      const idMatches = s.session_id.toLowerCase().includes(query);
      return nameMatches || idMatches;
    });
  }, [sessions, searchQuery]);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.session_id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  // Guarantee clean message stream: filter out any repeating user query that appears right after an AI reply
  const cleanMessages = useMemo(() => {
    const result: ChatMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user") {
        const trimmedContent = msg.content.trim();
        // If immediately preceding message is an identical user message, skip
        if (
          result.length > 0 &&
          result[result.length - 1].role === "user" &&
          result[result.length - 1].content.trim() === trimmedContent
        ) {
          continue;
        }
        // If this user query appears directly after an AI response that answered the exact same user query, skip
        if (result.length >= 2) {
          const prevMsg = result[result.length - 1]; // ai message
          const prevPrevMsg = result[result.length - 2]; // original user message
          if (
            prevMsg.role === "ai" &&
            prevPrevMsg.role === "user" &&
            prevPrevMsg.content.trim() === trimmedContent
          ) {
            continue;
          }
        }
      }
      result.push(msg);
    }
    return result;
  }, [messages]);

  // Issue 1 & 2: Map chats to SidebarItem with real-time active message count
  const sidebarItems: SidebarItem[] = useMemo(() => {
    return filteredSessions.map((s) => {
      const isCurrent = s.session_id === selectedSessionId;
      const count = isCurrent ? Math.max(s.message_count || 0, cleanMessages.length) : s.message_count;
      return {
        key: s.session_id,
        name: s.chat_name || s.session_id,
        icon: MessageSquare,
        badge: count && count > 0 ? count : undefined,
      };
    });
  }, [filteredSessions, selectedSessionId, cleanMessages.length]);

  return (
    <div
      id="page-content-chats"
      className="relative flex h-full w-full overflow-hidden select-none bg-[#080c14] text-zinc-100"
    >
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-blue-600/[0.04] rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-cyan-600/[0.04] rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ==================================================================== */}
      {/* Issue 1: Reused Sidebar Component with Issue 2: Just show chats */}
      {/* ==================================================================== */}
      <Sidebar
        items={sidebarItems}
        activeKey={selectedSessionId || undefined}
        onSelect={(key) => setSelectedSessionId(key)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={setIsSidebarCollapsed}
        onScroll={handleSessionsScroll}
        className="border-r border-white/[0.08] bg-zinc-950/80 shadow-lg"
        header={
          <div className="relative w-full h-full flex items-center">
            {/* When collapsed: strictly ONE button centered (Requirement 2) */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-200",
                isSidebarCollapsed
                  ? "opacity-100 pointer-events-auto scale-100"
                  : "opacity-0 pointer-events-none scale-90"
              )}
            >
              <button
                type="button"
                id="btn-sidebar-open"
                onClick={() => setIsSidebarCollapsed(false)}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-white/10 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>

            {/* When open: Full header controls without + button (Requirement 3 & 4) */}
            <div
              className={cn(
                "w-full flex flex-col gap-2 transition-[opacity,transform] duration-200",
                !isSidebarCollapsed
                  ? "opacity-100 pointer-events-auto translate-x-0"
                  : "opacity-0 pointer-events-none -translate-x-2"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase truncate">
                    Chats
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    id="btn-sidebar-close"
                    onClick={() => setIsSidebarCollapsed(true)}
                    title="Close sidebar"
                    aria-label="Close sidebar"
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Issue 6: Search by Name or Session ID */}
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  id="input-sidebar-search"
                  placeholder="Search by name or session ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-zinc-900/90 border border-white/[0.08] rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-inset focus:ring-cyan-500/40 transition-colors duration-150"
                />
              </div>
            </div>
          </div>
        }
        // Issue 5: In sidebar bottoms show total number of chats of users (visible both expanded and collapsed)
        footer={
          <div className="h-8 flex items-center justify-center text-xs text-zinc-400 font-mono select-none overflow-hidden whitespace-nowrap w-full">
            {!isSidebarCollapsed ? (
              <span className="truncate">Total Chats: {sessionsTotalItems || sessions.length}</span>
            ) : (
              <span
                className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-zinc-900 border border-white/10 text-cyan-400 font-semibold text-[11px] shadow-sm"
                title={`Total Chats: ${sessionsTotalItems || sessions.length}`}
              >
                {sessionsTotalItems || sessions.length}
              </span>
            )}
          </div>
        }
      />

      {/* ==================================================================== */}
      {/* MAIN VIEWPORT: Chat Window */}
      {/* ==================================================================== */}
      <section
        id="chat-main-viewport"
        aria-label="Chat Messages Area"
        className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-[#080c14] via-[#090e18] to-[#04070d] relative"
      >
        {/* Chat Window Header */}
        <header className="h-14 px-4 sm:px-6 border-b border-white/[0.08] bg-zinc-950/50 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>

            {selectedSessionId ? (
              // Issue 7: When chat is open show both name and session id
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <h1 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">
                    {activeSession?.chat_name || "Conversation"}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    Active
                  </span>
                  {Math.max(messagesTotalCount, cleanMessages.length) > 0 && (
                    <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                      • {Math.max(messagesTotalCount, cleanMessages.length)}{" "}
                      {Math.max(messagesTotalCount, cleanMessages.length) === 1 ? "message" : "messages"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                  <span className="text-zinc-500 text-[11px]">ID:</span>
                  <span className="text-zinc-300 text-[11px] truncate max-w-[180px] sm:max-w-[340px]">
                    {selectedSessionId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySessionId(selectedSessionId)}
                    title="Copy Session ID"
                    aria-label="Copy session ID"
                    className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {copiedSessionId === selectedSessionId ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-zinc-200">New Conversation</h1>
              </div>
            )}
          </div>

          {/* Header Action Tools */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-header-new-chat"
              onClick={handleStartNewChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-sm shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* Messages Container Area */}
        {/* ==================================================================== */}
        <div
          ref={messagesContainerRef}
          id="messages-scroll-area"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {/* Load More Messages Button */}
          {selectedSessionId && messagesHasMore && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                id="btn-load-more-messages"
                onClick={handleLoadMoreMessages}
                disabled={loadingMoreMessages}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-zinc-900/90 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-950/40 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingMoreMessages ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading next 30 messages...</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span>
                      Load more messages (Page {messagesPage + 1} of {messagesTotalPages})
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Loading State */}
          {messagesLoading && messages.length === 0 ? (
            <div className="space-y-4 max-w-6xl mx-auto px-2 sm:px-6 py-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0" />
                  <div className="space-y-2 flex-1 max-w-lg">
                    <div className="h-4 bg-zinc-800 rounded w-1/4" />
                    <div className="h-12 bg-zinc-800/60 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : messagesError ? (
            // Error State
            <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-red-950/20 border border-red-500/30 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-red-300">Failed to load messages</h3>
                <p className="text-xs text-red-400/80">{messagesError}</p>
              </div>
              <button
                type="button"
                onClick={() => selectedSessionId && fetchMessages(selectedSessionId, 1, null, false)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : !selectedSessionId && cleanMessages.length === 0 ? (
            // Empty / No Session Selected
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto space-y-6 py-12">
              <div className="relative">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 border border-cyan-500/30 text-cyan-400 shadow-[0_0_35px_rgba(6,182,212,0.2)]">
                  <Bot className="w-8 h-8" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-6 h-6 rounded-lg bg-cyan-500 text-zinc-950 shadow-md">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  MIRA Chat Assistant
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Select a previous session from the sidebar to review dialogue history, or start a new conversation below.
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left pt-2">
                {[
                  "What modules are online in MIRA?",
                  "Summarize my recent work activities",
                  "Explain the Redis Streams architecture",
                  "How does Vault encrypt local storage?",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(prompt);
                    }}
                    className="p-3 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.06] hover:border-cyan-500/30 text-xs text-zinc-300 hover:text-white transition-all text-left space-y-1 group cursor-pointer"
                  >
                    <p className="font-medium group-hover:text-cyan-300 transition-colors">{prompt}</p>
                    <span className="text-[10px] text-zinc-500">Click to fill prompt →</span>
                  </button>
                ))}
              </div>
            </div>
          ) : cleanMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto space-y-3 py-16">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-500">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-300">No messages in this session</h3>
                <p className="text-xs text-zinc-500">
                  Send your first question or command below to begin chatting.
                </p>
              </div>
            </div>
          ) : (
            // Messages List (Issue 7 & 8: wide layout stretching user messages right and Mira messages left)
            <div className="space-y-6 max-w-6xl mx-auto w-full px-2 sm:px-6">
              {cleanMessages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-start gap-3 group w-full",
                      isUser ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-semibold shadow-md",
                        isUser
                          ? "bg-gradient-to-tr from-blue-600 to-cyan-600 text-white"
                          : "bg-zinc-900 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                      )}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Content */}
                    <div
                      className={cn(
                        "flex flex-col space-y-1 max-w-[88%] sm:max-w-[80%]",
                        isUser ? "items-end" : "items-start"
                      )}
                    >
                      {/* Issue 2 & 3: For user remove 'You •', for Mira use 'Mira' */}
                      <div className="flex items-center gap-2 px-1 text-[11px] text-zinc-500 font-mono">
                        {!isUser && (
                          <>
                            <span className="font-semibold text-cyan-400">Mira</span>
                            <span>•</span>
                          </>
                        )}
                        <span>{formatDate(msg.created_at)}</span>
                      </div>

                      <div
                        className={cn(
                          "px-4 py-3 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-sm break-words whitespace-pre-wrap select-text",
                          isUser
                            ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-sm shadow-blue-500/10"
                            : "bg-zinc-900/90 border border-white/[0.08] text-zinc-200 rounded-tl-sm shadow-zinc-950/40"
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Sending / Thinking Indicator with 15 Rotating Messages */}
              {isSending && (
                <div className="flex items-start gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                    <Bot className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="flex flex-col space-y-1.5 max-w-[88%] sm:max-w-[80%]">
                    <div className="flex items-center gap-2 px-1 text-[11px] text-zinc-500 font-mono">
                      <span className="font-semibold text-cyan-400">Mira</span>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-900/90 border border-cyan-500/30 text-xs sm:text-[13px] text-zinc-200 shadow-[0_0_25px_rgba(6,182,212,0.1)] flex items-center gap-3">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                      </div>
                      <span className="font-mono text-cyan-300 text-xs transition-all duration-300 animate-pulse truncate">
                        {CHAT_LOADING_MESSAGES[loadingMessageIndex]}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* INPUT AREA: Text Input & Controls */}
        {/* ==================================================================== */}
        <footer className="p-3 sm:p-4 border-t border-white/[0.08] bg-zinc-950/70 backdrop-blur-md shrink-0 z-10">
          <div className="max-w-6xl mx-auto w-full px-2 sm:px-6 space-y-2">
            <div className="relative flex items-end gap-2 bg-zinc-900/90 border border-white/[0.1] focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-2xl p-2 transition-all">
              <textarea
                ref={textareaRef}
                id="input-chat-message"
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedSessionId
                    ? "Type your message... (Enter to send, Shift+Enter for new line)"
                    : "Type a prompt to start a new chat session..."
                }
                className="flex-1 max-h-44 min-h-[38px] bg-transparent resize-none text-xs sm:text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none px-2 py-1.5 leading-relaxed overflow-y-auto"
              />

              <button
                type="button"
                id="btn-send-message"
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isSending}
                title="Send message (Enter)"
                aria-label="Send message"
                className={cn(
                  "p-2 rounded-xl text-white font-medium transition-all duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-md",
                  inputText.trim() && !isSending
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:scale-95 shadow-cyan-500/20"
                    : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
                )}
              >
                {isSending ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Issue 4: Removed 'mira engine online' text */}
            <div className="flex items-center justify-between px-2 text-[10px] text-zinc-500 font-mono">
              {sessionsError && (
                <span className="text-red-400">Offline fallback active</span>
              )}
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default ChatsPage;
