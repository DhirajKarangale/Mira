import { useState, useEffect, useRef, useCallback, useMemo, type FC } from "react";
import {
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  MessageCircle,
  Clock,
  Bot,
  User,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Send,
  ArrowDown,
  Layers,
} from "lucide-react";
import { toast } from "@/components";
import {
  engineService,
  type ChatSession,
  type ChatMessage,
} from "@/services/engine.service";
import { cn } from "@/lib/utils";

export const ChatsPage: FC = () => {
  // ============================================================================
  // Sessions State
  // ============================================================================
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState<boolean>(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsPage, setSessionsPage] = useState<number>(1);
  const [sessionsTotalPages, setSessionsTotalPages] = useState<number>(1);
  const [sessionsTotalItems, setSessionsTotalItems] = useState<number>(0);
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRefreshingSessions, setIsRefreshingSessions] = useState<boolean>(false);

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
  // Input State
  // ============================================================================
  const [inputText, setInputText] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  // Refs for scroll management
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sessionsContainerRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // Date Formatter Helper
  // ============================================================================
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return "Just now";
    try {
      const date = new Date(dateStr.replace(" ", "T"));
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

      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      }) + ` • ${timePart}`;
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
          // Auto-select first session if none is selected and sessions exist
          if (!selectedSessionId && data.sessions && data.sessions.length > 0) {
            setSelectedSessionId(data.sessions[0].session_id);
          }
        }

        setSessionsPage(data.current_page || pageToLoad);
        setSessionsTotalPages(data.total_pages || 1);
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
        setIsRefreshingSessions(false);
      }
    },
    [selectedSessionId]
  );

  // Initial load
  useEffect(() => {
    fetchSessions(1, null, false);
  }, []);

  // Handle manual session refresh
  const handleRefreshSessions = async () => {
    setIsRefreshingSessions(true);
    await fetchSessions(1, null, false);
    toast.success("Chat sessions refreshed", { title: "Sessions Sync" });
  };

  // Handle infinite scroll on sessions sidebar
  const handleSessionsScroll = () => {
    const el = sessionsContainerRef.current;
    if (!el || sessionsLoading || !sessionsHasMore) return;

    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      if (sessionsCursor) {
        fetchSessions(sessionsPage + 1, sessionsCursor, true);
      }
    }
  };

  // ============================================================================
  // Fetch Messages for Selected Session
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
            const newItems = data.messages.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newItems];
          });
        } else {
          setMessages(data.messages || []);
        }

        setMessagesPage(data.current_page || pageToLoad);
        setMessagesTotalPages(data.total_pages || 1);
        setMessagesTotalCount(data.total_messages ?? data.messages?.length ?? 0);
        setMessagesCursor(data.next_cursor || null);
        setMessagesHasMore(Boolean(data.has_more));

        // Auto-scroll to bottom on first load or new message
        if (!append) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
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

  // When selectedSessionId changes, load page 1 of messages
  useEffect(() => {
    if (selectedSessionId) {
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

  // Load next page of messages (cursor-based or page-based)
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

    setIsSending(true);
    setInputText("");

    // Optimistically add user message to UI
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
        session_id: selectedSessionId || undefined,
        content: trimmed,
      });

      const actualSessionId = response.session_id;

      // Replace optimistic message with actual stored messages
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempId);
        const updated = [...filtered, response.user_message];
        if (response.ai_message) {
          updated.push(response.ai_message);
        }
        return updated;
      });

      // Update active session selection if this was a brand new chat
      if (!selectedSessionId || selectedSessionId !== actualSessionId) {
        setSelectedSessionId(actualSessionId);
      }

      // Refresh sidebar sessions to reflect latest created_at and order
      fetchSessions(1, null, false);

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message, { title: "Chat Error" });
    } finally {
      setIsSending(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter or Enter to send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Start a fresh new chat session
  const handleStartNewChat = () => {
    setSelectedSessionId(null);
    setMessages([]);
    setInputText("");
    toast.info("Started new conversation session. Type a message below.", {
      title: "New Dialogue",
    });
  };

  // Copy session ID helper
  const handleCopySessionId = (sid: string) => {
    navigator.clipboard.writeText(sid);
    setCopiedSessionId(sid);
    toast.info("Session ID copied to clipboard", { title: "Copied" });
    setTimeout(() => setCopiedSessionId(null), 2000);
  };

  // Seed demo chats helper for testing
  const handleSeedDemo = async () => {
    try {
      setSessionsLoading(true);
      await engineService.seedDemoChats(12);
      toast.success("Seeded 12 demo conversations for testing pagination", {
        title: "Demo Data",
      });
      await fetchSessions(1, null, false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to seed demo data";
      toast.error(message, { title: "Seed Failed" });
    } finally {
      setSessionsLoading(false);
    }
  };

  // Filtered sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.session_id.toLowerCase().includes(query) ||
        (s.chat_name && s.chat_name.toLowerCase().includes(query))
    );
  }, [sessions, searchQuery]);

  // Selected session object
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.session_id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  return (
    <div
      id="page-content-chats"
      className="relative flex h-full w-full overflow-hidden select-none bg-[#080c14] text-zinc-100"
    >
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-blue-600/[0.04] rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-cyan-600/[0.04] rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ==================================================================== */}
      {/* SIDEBAR: All Chat Sessions with Pagination */}
      {/* ==================================================================== */}
      <aside
        id="chats-sidebar"
        aria-label="Chat Sessions Sidebar"
        className="flex flex-col w-80 sm:w-88 border-r border-white/[0.08] bg-zinc-950/70 backdrop-blur-md shrink-0 h-full overflow-hidden z-10"
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-white/[0.08] space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 tracking-wide">
                  Conversations
                </h2>
                <p className="text-[11px] text-zinc-400">
                  {sessionsTotalItems} {sessionsTotalItems === 1 ? "thread" : "threads"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                id="btn-refresh-sessions"
                title="Refresh sessions list"
                aria-label="Refresh sessions"
                onClick={handleRefreshSessions}
                disabled={isRefreshingSessions || sessionsLoading}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", isRefreshingSessions && "animate-spin text-cyan-400")}
                />
              </button>

              <button
                type="button"
                id="btn-new-chat-sidebar"
                onClick={handleStartNewChat}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-sm shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              id="input-search-sessions"
              placeholder="Search by session ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-900/80 border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
            />
          </div>
        </div>

        {/* Sessions Scrollable List */}
        <div
          ref={sessionsContainerRef}
          onScroll={handleSessionsScroll}
          className="flex-1 overflow-y-auto divide-y divide-white/[0.04] p-2 space-y-1 select-none"
        >
          {sessionsLoading && sessions.length === 0 ? (
            // Skeleton Loader
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-zinc-900/40 border border-white/[0.04] animate-pulse space-y-2"
                >
                  <div className="h-3 w-3/4 bg-zinc-800 rounded" />
                  <div className="h-2.5 w-1/2 bg-zinc-800/60 rounded" />
                </div>
              ))}
            </div>
          ) : sessionsError ? (
            // Error State
            <div className="p-4 text-center space-y-2 text-xs text-red-400">
              <AlertCircle className="w-6 h-6 mx-auto text-red-400/80" />
              <p>{sessionsError}</p>
              <button
                type="button"
                onClick={() => fetchSessions(1, null, false)}
                className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            // Empty State
            <div className="p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900/80 border border-white/[0.06] flex items-center justify-center mx-auto text-zinc-500">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-300">No chat sessions found</p>
                <p className="text-[11px] text-zinc-500">
                  {searchQuery ? "Try a different search term" : "Start your first conversation"}
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  id="btn-create-first-chat"
                  onClick={handleStartNewChat}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Start New Chat</span>
                </button>
                <button
                  type="button"
                  id="btn-seed-sample-chats"
                  onClick={handleSeedDemo}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06] transition-all cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Seed Demo Chats</span>
                </button>
              </div>
            </div>
          ) : (
            // Render Chat Sessions List
            filteredSessions.map((s) => {
              const isSelected = selectedSessionId === s.session_id;
              return (
                <button
                  key={s.session_id}
                  type="button"
                  data-session-id={s.session_id}
                  onClick={() => setSelectedSessionId(s.session_id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all duration-150 cursor-pointer border relative group",
                    isSelected
                      ? "bg-gradient-to-r from-blue-600/20 via-cyan-600/10 to-transparent border-blue-500/40 text-white shadow-[0_0_15px_rgba(59,130,246,0.12)]"
                      : "bg-transparent hover:bg-white/[0.04] border-transparent text-zinc-300 hover:text-zinc-100"
                  )}
                >
                  {/* Active Indicator Bar */}
                  {isSelected && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-cyan-400 rounded-r shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  )}

                  <div className="flex items-start justify-between gap-2 pl-1">
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Required: Display session_id as the chat name */}
                      <p
                        className={cn(
                          "text-xs font-mono font-medium truncate",
                          isSelected ? "text-cyan-300" : "text-zinc-200 group-hover:text-white"
                        )}
                        title={s.session_id}
                      >
                        {s.session_id}
                      </p>

                      {/* Required: Show latest chat date in smaller text */}
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
                        <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="truncate">{formatDate(s.latest_created_at || s.created_at)}</span>
                      </div>
                    </div>

                    {/* Message Count Badge */}
                    {typeof s.message_count === "number" && s.message_count > 0 && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-white/[0.06]">
                        {s.message_count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}

          {/* Loading indicator for infinite scroll */}
          {sessionsLoading && sessions.length > 0 && (
            <div className="p-2 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
              <span>Loading more sessions...</span>
            </div>
          )}
        </div>

        {/* Sidebar Pagination Footer */}
        <div className="p-3 border-t border-white/[0.08] bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-zinc-400">
              Page {sessionsPage} of {sessionsTotalPages}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-[11px] text-zinc-500">{sessionsTotalItems} total</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              id="btn-prev-sessions-page"
              title="Previous page"
              aria-label="Previous sessions page"
              disabled={sessionsPage <= 1 || sessionsLoading}
              onClick={() => fetchSessions(sessionsPage - 1, null, false)}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              id="btn-next-sessions-page"
              title="Next page"
              aria-label="Next sessions page"
              disabled={sessionsPage >= sessionsTotalPages || sessionsLoading}
              onClick={() => fetchSessions(sessionsPage + 1, sessionsCursor, false)}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* MAIN VIEWPORT: Chat Window */}
      {/* ==================================================================== */}
      <section
        id="chat-main-viewport"
        aria-label="Chat Messages Area"
        className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-[#080c14] via-[#090e18] to-[#04070d] relative"
      >
        {/* Chat Window Header */}
        <header className="h-14 px-5 border-b border-white/[0.08] bg-zinc-950/50 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-bold tracking-tight text-zinc-100 font-mono truncate">
                  {selectedSessionId ? selectedSessionId : "New Conversation"}
                </h1>

                {selectedSessionId && (
                  <button
                    type="button"
                    onClick={() => handleCopySessionId(selectedSessionId)}
                    title="Copy Session ID"
                    aria-label="Copy session ID"
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {copiedSessionId === selectedSessionId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                {selectedSessionId ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                    <span>Active Session</span>
                    <span className="text-zinc-600">•</span>
                    <span>
                      {messagesTotalCount} {messagesTotalCount === 1 ? "message" : "messages"}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span>
                      Page {messagesPage} of {messagesTotalPages}
                    </span>
                  </>
                ) : (
                  <span>Unsaved dialogue draft</span>
                )}
              </div>
            </div>
          </div>

          {/* Header Action Tools */}
          <div className="flex items-center gap-2">
            {selectedSessionId && (
              <button
                type="button"
                id="btn-refresh-messages"
                onClick={() => fetchMessages(selectedSessionId, 1, null, false)}
                disabled={messagesLoading}
                title="Refresh messages"
                aria-label="Refresh messages"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/80 hover:bg-zinc-800/80 border border-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", messagesLoading && "animate-spin text-cyan-400")} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}

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
          {/* Load More / Pagination Bar at the top of messages */}
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

          {/* Loading Skeletons */}
          {messagesLoading && messages.length === 0 ? (
            <div className="space-y-4 max-w-3xl mx-auto py-8">
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
            // Messages Error State
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
          ) : !selectedSessionId && messages.length === 0 ? (
            // Welcome / No Session Selected State
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
          ) : messages.length === 0 ? (
            // Session is selected, but has 0 messages
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
            // Render Messages List
            <div className="space-y-6 max-w-3xl mx-auto w-full">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-start gap-3 group",
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

                    {/* Content Column */}
                    <div
                      className={cn(
                        "flex flex-col space-y-1 max-w-[85%] sm:max-w-[78%]",
                        isUser ? "items-end" : "items-start"
                      )}
                    >
                      {/* Name / Role label */}
                      <div className="flex items-center gap-2 px-1 text-[11px] text-zinc-500 font-mono">
                        <span className="font-semibold text-zinc-400">
                          {isUser ? "You" : "MIRA AI"}
                        </span>
                        <span>•</span>
                        <span>{formatDate(msg.created_at)}</span>
                      </div>

                      {/* Message Bubble */}
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

              {/* Sending / Thinking Indicator */}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0 animate-pulse">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-900/90 border border-white/[0.08] text-xs text-zinc-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span className="font-mono text-[11px]">MIRA is thinking...</span>
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
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="relative flex items-end gap-2 bg-zinc-900/90 border border-white/[0.1] focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-2xl p-2 transition-all">
              <textarea
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
                className="flex-1 max-h-36 min-h-[36px] bg-transparent resize-none text-xs sm:text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none px-2 py-1.5 leading-relaxed"
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

            <div className="flex items-center justify-between px-2 text-[10px] text-zinc-500 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>MIRA Engine Online</span>
                <span className="text-zinc-700">•</span>
                <span>Press Enter to send</span>
              </div>

              {activeSession && (
                <div className="text-zinc-500 truncate max-w-[200px]">
                  ID: {activeSession.session_id.substring(0, 8)}...
                </div>
              )}
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default ChatsPage;
