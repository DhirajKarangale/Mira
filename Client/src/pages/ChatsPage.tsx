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
  MoreVertical,
  Edit3,
  X,
  Trash2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Sidebar, type SidebarItem, type SidebarRenderItemState } from "@/components/Sidebar";
import { toast } from "@/components";
import {
  engineService,
  type ChatSession,
  type ChatMessage,
} from "@/services/engine.service";
import { useChatStore } from "@/store/useChatStore";
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

// Helper for fast, collision-free UUID generation across environments
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

export const ChatsPage: FC = () => {
  // ============================================================================
  // Sessions State
  // ============================================================================
  // ============================================================================
  // Global Chat Store (persisted across page navigation via Zustand & Redis)
  // ============================================================================
  const selectedSessionId = useChatStore((s) => s.selectedSessionId);
  const setSelectedSessionId = useChatStore((s) => s.setSelectedSessionId);
  const sendingSessions = useChatStore((s) => s.sendingSessions);
  const setSendingSession = useChatStore((s) => s.setSendingSession);
  const clearSendingSession = useChatStore((s) => s.clearSendingSession);
  const isSessionSending = useChatStore((s) => s.isSessionSending);
  const sessionMessagesCache = useChatStore((s) => s.sessionMessagesCache);
  const setSessionMessages = useChatStore((s) => s.setSessionMessages);
  const addOptimisticMessage = useChatStore((s) => s.addOptimisticMessage);
  const replaceOptimisticUserMessage = useChatStore((s) => s.replaceOptimisticUserMessage);
  const resolveAiMessage = useChatStore((s) => s.resolveAiMessage);
  const checkAndRecoverPendingState = useChatStore((s) => s.checkAndRecoverPendingState);
  const removeSessionMessages = useChatStore((s) => s.removeSessionMessages);
  const clearAllSessionMessages = useChatStore((s) => s.clearAllSessionMessages);
  const skipInitialFetchSessionId = useChatStore((s) => s.skipInitialFetchSessionId);
  const setSkipInitialFetchSessionId = useChatStore((s) => s.setSkipInitialFetchSessionId);
  const unreadSessionIds = useChatStore((s) => s.unreadSessionIds);
  const markSessionRead = useChatStore((s) => s.markSessionRead);

  // Active session sending status derived from persistent Zustand store
  const isCurrentSessionSending = isSessionSending(selectedSessionId);

  // ============================================================================
  // Sessions State
  // ============================================================================
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState<boolean>(true);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState<boolean>(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsPage, setSessionsPage] = useState<number>(1);
  const [sessionsTotalItems, setSessionsTotalItems] = useState<number>(0);
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [menuOpenSessionId, setMenuOpenSessionId] = useState<string | null>(null);
  const [isRenamingLoading, setIsRenamingLoading] = useState<boolean>(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingSessionId, setIsDeletingSessionId] = useState<string | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState<string>("");
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);

  // ============================================================================
  // Messages State
  // ============================================================================
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return selectedSessionId && sessionMessagesCache[selectedSessionId]
      ? sessionMessagesCache[selectedSessionId]
      : [];
  });
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesPage, setMessagesPage] = useState<number>(1);
  const [messagesTotalPages, setMessagesTotalPages] = useState<number>(1);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [messagesHasMore, setMessagesHasMore] = useState<boolean>(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState<boolean>(false);

  // ============================================================================
  // Input & Multi-Session Sending State
  // ============================================================================
  const [inputText, setInputText] = useState<string>("");
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<number>(0);

  // Session refs for fresh access inside async effects / callbacks
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  selectedSessionIdRef.current = selectedSessionId;

  const sendingSessionsRef = useRef(sendingSessions);
  sendingSessionsRef.current = sendingSessions;

  // Scroll reference and user scroll tracking
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInitialSessionLoadRef = useRef<boolean>(false);
  const isNearBottomRef = useRef<boolean>(true);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);

  // Track whether the user is scrolled near bottom (< 100px from bottom)
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(distanceFromBottom > 160);
  }, []);

  const scrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

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

  // Cycle through 15 loading messages every 2.5s while waiting for response in current session
  useEffect(() => {
    if (!isCurrentSessionSending) {
      setLoadingMessageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % CHAT_LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [isCurrentSessionSending]);

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
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(
    async (pageToLoad: number = 1, cursorToUse?: string | null, append: boolean = false) => {
      try {
        if (!append) {
          setSessionsLoading(true);
        } else {
          setLoadingMoreSessions(true);
        }
        setSessionsError(null);

        const data = await engineService.getChatSessions({
          page: pageToLoad,
          cursor: cursorToUse || undefined,
          limit: 15,
        });

        const fetchedSessions = data.sessions || [];
        useChatStore.getState().setCachedSessions(fetchedSessions);

        setSessions((prev) => {
          // Keep any optimistic sessions that are currently sending and not yet in backend response
          const fetchedIds = new Set(fetchedSessions.map((s) => s.session_id));
          const sendingLocalSessions = prev.filter(
            (s) => sendingSessionsRef.current[s.session_id] && !fetchedIds.has(s.session_id)
          );

          if (append) {
            const existingIds = new Set(prev.map((s) => s.session_id));
            const newItems = fetchedSessions.filter((s) => !existingIds.has(s.session_id));
            return [...prev, ...newItems];
          } else {
            return [...sendingLocalSessions, ...fetchedSessions];
          }
        });

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
        setLoadingMoreSessions(false);
      }
    },
    []
  );

  const fetchSessionsRef = useRef(fetchSessions);
  fetchSessionsRef.current = fetchSessions;

  useEffect(() => {
    fetchSessions(1, null, false);
  }, []);

  // Auto-pagination observer: when sentinel is visible and more items exist, automatically load next page
  useEffect(() => {
    if (!sessionsHasMore || sessionsLoading || loadingMoreSessions) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (!sessionsLoading && !loadingMoreSessions && sessionsHasMore) {
            fetchSessions(sessionsPage + 1, sessionsCursor, true);
          }
        }
      },
      { threshold: 0.1, rootMargin: "80px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sessionsHasMore, sessionsLoading, loadingMoreSessions, sessionsPage, sessionsCursor, fetchSessions]);

  const handleSessionsScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (sessionsLoading || loadingMoreSessions || !sessionsHasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
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

        // Strict Session Isolation Check: User might have switched sessions while request was in-flight!
        if (selectedSessionIdRef.current !== sessionId) {
          return;
        }

        let currentMessagesCount = 0;
        let newMessagesList: ChatMessage[] = [];

        if (append) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newItems = (data.messages || []).filter(
              (m) =>
                !existingIds.has(m.id) &&
                !prev.some((p) => p.role === "user" && m.role === "user" && p.content === m.content)
            );
            const combined = [...prev, ...newItems];
            currentMessagesCount = combined.length;
            newMessagesList = combined;
            return combined;
          });
        } else {
          // Clean up any historical duplicate messages from DB
          const deduped: ChatMessage[] = [];
          for (const m of data.messages || []) {
            const isDup = deduped.some(
              (p) => p.id === m.id || (p.role === "user" && m.role === "user" && p.content === m.content)
            );
            if (!isDup) {
              deduped.push(m);
            }
          }

          // If this session is currently sending, retain any optimistic temporary message in-flight
          const currentSendingJob = isSessionSending(sessionId);
          const cached = useChatStore.getState().sessionMessagesCache[sessionId] || [];
          const optimisticTemps = cached.filter((m) => m.id.startsWith("temp-"));
          for (const opt of optimisticTemps) {
            const alreadyInDeduped = deduped.some(
              (m) => m.role === "user" && m.content === opt.content
            );
            if (!alreadyInDeduped && currentSendingJob) {
              deduped.push(opt);
            }
          }

          // Heuristic check: if the last message in deduped is from user and no AI reply yet,
          // restore sending/loading state in Zustand & Redis!
          checkAndRecoverPendingState(sessionId, deduped);

          currentMessagesCount = deduped.length;
          newMessagesList = deduped;
          setMessages(deduped);
        }

        setSessionMessages(sessionId, newMessagesList);

        setMessagesPage(data.current_page || pageToLoad);
        setMessagesTotalPages(data.total_pages || 1);
        setSessions((prev) =>
          prev.map((s) =>
            s.session_id === sessionId
              ? { ...s, message_count: currentMessagesCount || s.message_count }
              : s
          )
        );
        setMessagesCursor(data.next_cursor || null);
        setMessagesHasMore(Boolean(data.has_more));

        if (!append) {
          // Only scroll directly to bottom on initial load or if user is already at the bottom
          if (isInitialSessionLoadRef.current || isNearBottomRef.current) {
            requestAnimationFrame(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
              }
            });
          }
        }
      } catch (err: unknown) {
        if (selectedSessionIdRef.current !== sessionId) return;
        const message = err instanceof Error ? err.message : "Failed to load messages";
        setMessagesError(message);
        if (!append) {
          setMessages([]);
        }
      } finally {
        if (selectedSessionIdRef.current === sessionId) {
          setMessagesLoading(false);
          setLoadingMoreMessages(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
    if (selectedSessionId) {
      // If this session was just created by handleSendMessage, do not fetch immediately
      // because that would wipe out the optimistic user message!
      if (skipInitialFetchSessionId === selectedSessionId) {
        setSkipInitialFetchSessionId(null);
        return;
      }
      isInitialSessionLoadRef.current = true;
      isNearBottomRef.current = true;
      setShowScrollBottom(false);

      // Instant display from cache if available
      const cached = useChatStore.getState().sessionMessagesCache[selectedSessionId];
      if (cached && cached.length > 0) {
        setMessages(cached);
      } else {
        setMessages([]);
      }
      fetchMessages(selectedSessionId, 1, null, false);
    } else {
      setMessages([]);
      setMessagesPage(1);
      setMessagesTotalPages(1);
      setMessagesCursor(null);
      setMessagesHasMore(false);
    }
  }, [selectedSessionId, skipInitialFetchSessionId, fetchMessages, setSkipInitialFetchSessionId]);

  // Jump to bottom immediately as soon as session messages render in DOM on initial session load
  useEffect(() => {
    if (isInitialSessionLoadRef.current && messages.length > 0) {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      isInitialSessionLoadRef.current = false;
    }
  }, [messages]);

  // Clear unread mark whenever current session is active/viewed
  useEffect(() => {
    if (selectedSessionId && unreadSessionIds[selectedSessionId]) {
      markSessionRead(selectedSessionId);
    }
  }, [selectedSessionId, unreadSessionIds, markSessionRead]);

  // Close three-dot menu and inline rename on click outside or Escape
  useEffect(() => {
    if (!editingSessionId && !menuOpenSessionId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-session-item-actions]")) {
        return;
      }
      setMenuOpenSessionId(null);
      setEditingSessionId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpenSessionId(null);
        setEditingSessionId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingSessionId, menuOpenSessionId]);

  // Synchronize visible messages whenever store's cached messages for selected session update
  useEffect(() => {
    if (!selectedSessionId) return;
    const cached = sessionMessagesCache[selectedSessionId];
    if (!cached) return;

    setMessages((prev) => {
      // Avoid state update if messages list has not actually changed
      if (
        prev === cached ||
        (prev.length === cached.length &&
          prev.length > 0 &&
          prev[prev.length - 1]?.id === cached[cached.length - 1]?.id &&
          prev[prev.length - 1]?.content === cached[cached.length - 1]?.content)
      ) {
        return prev;
      }
      return cached;
    });

    // Only auto-scroll if the user is already at or near bottom
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      });
    }
  }, [selectedSessionId, sessionMessagesCache]);

  // When sending completes for current session, refresh sessions list in background
  const wasSendingRef = useRef(isCurrentSessionSending);
  useEffect(() => {
    if (wasSendingRef.current && !isCurrentSessionSending) {
      fetchSessionsRef.current(1, null, false);
    }
    wasSendingRef.current = isCurrentSessionSending;
  }, [isCurrentSessionSending]);

  const handleLoadMoreMessages = () => {
    if (!selectedSessionId || loadingMoreMessages || !messagesHasMore) return;
    fetchMessages(selectedSessionId, messagesPage + 1, messagesCursor, true);
  };

  // ============================================================================
  // Session Renaming Handlers
  // ============================================================================
  const handleStartRename = useCallback((sessionId: string, currentName: string) => {
    setEditingSessionId(sessionId);
    setEditingName(currentName);
    setMenuOpenSessionId(null);
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditingSessionId(null);
    setEditingName("");
  }, []);

  const handleSaveRename = useCallback(
    async (sessionId: string) => {
      const cleanName = editingName.trim();
      if (!cleanName) return;

      try {
        setIsRenamingLoading(true);
        await engineService.renameChatSession(sessionId, cleanName);

        setSessions((prev) =>
          prev.map((s) =>
            s.session_id === sessionId ? { ...s, chat_name: cleanName } : s
          )
        );

        toast.success(`Chat has been renamed to "${cleanName}".`, {
          title: "Chat Renamed",
        });

        setEditingSessionId(null);
        setEditingName("");
        fetchSessions(1, null, false);
      } catch (err) {
        console.error("Failed to rename session:", err);
        toast.error("Failed to update chat session name. Please try again.", {
          title: "Rename Failed",
        });
      } finally {
        setIsRenamingLoading(false);
      }
    },
    [editingName, fetchSessions]
  );

  // ============================================================================
  // Delete Session Handlers
  // ============================================================================
  const handleConfirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;
    const { id, name } = sessionToDelete;
    setIsDeletingSessionId(id);
    try {
      await engineService.deleteChatSession(id);

      // Remove from sessions state
      setSessions((prev) => prev.filter((s) => s.session_id !== id));
      setSessionsTotalItems((prev) => Math.max(0, prev - 1));
      removeSessionMessages(id);

      // If the deleted session is currently selected, clear the chat window and switch to no-chat-selected state
      if (selectedSessionIdRef.current === id) {
        setSelectedSessionId(null);
        setMessages([]);
        setInputText("");
      }

      toast.success(`Chat "${name || id}" deleted successfully`, {
        title: "Chat Deleted",
      });
      setSessionToDelete(null);
    } catch (err: unknown) {
      console.error("Failed to delete chat session:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete chat session";
      toast.error(msg, { title: "Delete Failed" });
    } finally {
      setIsDeletingSessionId(null);
    }
  }, [sessionToDelete, removeSessionMessages, setSelectedSessionId]);

  const handleCancelDeleteSession = useCallback(() => {
    if (isDeletingSessionId) return;
    setSessionToDelete(null);
  }, [isDeletingSessionId]);

  const DELETE_ALL_CONFIRMATION_PHRASE = "DELETE ALL CHATS";

  const handleConfirmDeleteAll = useCallback(async () => {
    if (deleteAllConfirmText.trim().toUpperCase() !== DELETE_ALL_CONFIRMATION_PHRASE) return;
    setIsDeletingAll(true);
    try {
      await engineService.deleteAllChats();

      setSessions([]);
      setSessionsTotalItems(0);
      setSessionsHasMore(false);
      setSessionsCursor(null);
      setSelectedSessionId(null);
      setMessages([]);
      setInputText("");
      clearAllSessionMessages();

      toast.success("All chats have been permanently deleted from local encrypted storage", {
        title: "All Chats Deleted",
      });
      setIsDeleteAllModalOpen(false);
      setDeleteAllConfirmText("");
      // Refresh sessions from server to confirm empty state
      fetchSessions(1, null, false);
    } catch (err: unknown) {
      console.error("Failed to delete all chats:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete all chats";
      toast.error(msg, { title: "Delete All Failed" });
    } finally {
      setIsDeletingAll(false);
    }
  }, [deleteAllConfirmText, fetchSessions]);

  // ============================================================================
  // Sending Message
  // ============================================================================
  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Upfront session determination: reuse existing or generate new UUID immediately
    const targetSessionId = selectedSessionId || generateUUID();

    // Guard: Prevent double-send if THIS session is already awaiting a reply
    if (isSessionSending(targetSessionId) || isCurrentSessionSending) return;

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Set sending state strictly for this target session in Zustand store
    setSendingSession(targetSessionId, jobId, trimmed);
    setInputText("");

    const isNewSession = !selectedSessionId;

    // Issue 1: INSTANTLY add to chat area in sidebar on send
    const nowIso = new Date().toISOString();
    if (isNewSession) {
      const initialTitle = trimmed.length > 32 ? `${trimmed.substring(0, 32)}...` : trimmed;
      const newSession: ChatSession = {
        session_id: targetSessionId,
        chat_name: initialTitle,
        latest_created_at: nowIso,
        created_at: nowIso,
        message_count: 1,
      };

      // Instantly prepend to sidebar list (0ms delay)
      setSessions((prev) => [newSession, ...prev.filter((s) => s.session_id !== targetSessionId)]);
      setSessionsTotalItems((prev) => prev + 1);

      // Skip the initial wipeout fetch in useEffect([selectedSessionId])
      setSkipInitialFetchSessionId(targetSessionId);
      setSelectedSessionId(targetSessionId);
    } else {
      // For existing session, bump it to the top of the sidebar list
      setSessions((prev) => {
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

    const tempId = `temp-${Date.now()}`;
    const optimisticUserMsg: ChatMessage = {
      id: tempId,
      session_id: targetSessionId,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    };

    // Update message state if this is currently viewed
    setMessages((prev) => [...prev, optimisticUserMsg]);
    addOptimisticMessage(targetSessionId, optimisticUserMsg);

    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

    try {
      const response = await engineService.sendChatMessage({
        job_id: jobId,
        session_id: targetSessionId,
        content: trimmed,
      });

      // If response returned synchronous ai_message (e.g. fallback or mock)
      if (response.ai_message) {
        resolveAiMessage(targetSessionId, jobId, response.user_message, response.ai_message);
        fetchSessions(1, null, false);
      } else {
        // Job queued into llm_chat stream; replace tempId in-place with saved user msg
        replaceOptimisticUserMessage(targetSessionId, tempId, response.user_message);
        if (selectedSessionIdRef.current === targetSessionId) {
          setMessages((prev) => {
            const hasTemp = prev.some((m) => m.id === tempId);
            if (hasTemp) {
              return prev.map((m) => (m.id === tempId ? response.user_message : m));
            }
            const alreadyHasUser = prev.some(
              (m) => m.id === response.user_message.id || (m.role === "user" && m.content === trimmed)
            );
            if (alreadyHasUser) {
              return prev;
            }
            return [...prev, response.user_message];
          });
        }
      }

      setTimeout(() => {
        if (isNearBottomRef.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message, { title: "Chat Error" });
      clearSendingSession(targetSessionId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isCurrentSessionSending) {
        handleSendMessage();
      }
    }
  };

  const handleStartNewChat = () => {
    if (selectedSessionId) {
      setSessionMessages(selectedSessionId, messages);
    }
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

  const handleCopyMessage = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(msgId);
    toast.success("Message copied to clipboard", { title: "Copied" });
    setTimeout(() => {
      setCopiedMessageId((prev) => (prev === msgId ? null : prev));
    }, 2000);
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

  // Map chats to SidebarItem
  const sidebarItems: SidebarItem[] = useMemo(() => {
    return filteredSessions.map((s) => {
      return {
        key: s.session_id,
        name: s.chat_name || s.session_id,
        icon: MessageSquare,
      };
    });
  }, [filteredSessions]);

  // Render item in sidebar with 3-dot dropdown menu, inline editing, and loading spinner
  const renderSidebarItem = useCallback(
    (item: SidebarItem, state: SidebarRenderItemState) => {
      const { isActive, isCollapsed, handleSelect } = state;
      const isEditing = editingSessionId === item.key;
      const isMenuOpen = menuOpenSessionId === item.key;
      const sessionName = typeof item.name === "string" ? item.name : "";
      const isSessionSending = Boolean(sendingSessions[item.key]);
      const isUnread = Boolean(unreadSessionIds[item.key]);

      if (isCollapsed) {
        return (
          <button
            type="button"
            id={`sidebar-item-${item.key}`}
            role="menuitem"
            aria-current={isActive ? "page" : undefined}
            title={sessionName}
            onClick={() => {
              if (isDeletingSessionId === item.key) return;
              markSessionRead(item.key);
              handleSelect();
            }}
            disabled={isDeletingSessionId === item.key}
            className={cn(
              "group relative flex items-center justify-center w-full rounded-md text-xs font-medium cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 h-9 px-2 overflow-hidden transition-colors duration-150",
              isDeletingSessionId === item.key && "opacity-40 pointer-events-none",
              isActive
                ? "bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.12)] font-semibold"
                : isUnread
                ? "text-cyan-300 hover:text-cyan-200 hover:bg-cyan-950/30 border border-cyan-500/20"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent"
            )}
          >
            <span
              className={cn(
                "shrink-0 flex items-center justify-center w-8 h-8 rounded transition-colors relative",
                isActive ? "text-cyan-400" : isUnread ? "text-cyan-300" : "text-zinc-400 group-hover:text-zinc-200"
              )}
            >
              {isDeletingSessionId === item.key ? (
                <RefreshCw className="h-4 w-4 animate-spin text-rose-400" />
              ) : isSessionSending ? (
                <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              {isUnread && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)] animate-pulse"
                  title="Unread response"
                />
              )}
            </span>
            {isActive && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-cyan-400 rounded-full" />
            )}
          </button>
        );
      }

      if (isEditing) {
        return (
          <div
            data-session-item-actions
            className="flex items-center w-full h-9 px-2 gap-1 rounded-md bg-zinc-900 border border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)] select-none"
          >
            <MessageSquare className="h-4 w-4 text-cyan-400 shrink-0" />
            <input
              type="text"
              id={`input-rename-session-${item.key}`}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveRename(item.key);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancelRename();
                }
              }}
              autoFocus
              disabled={isRenamingLoading}
              className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-medium selection:bg-cyan-500/30 selection:text-cyan-100 py-0.5"
              placeholder="Chat name..."
            />
            <button
              type="button"
              id={`btn-save-rename-${item.key}`}
              onClick={() => handleSaveRename(item.key)}
              disabled={isRenamingLoading || !editingName.trim()}
              title="Save"
              aria-label="Save"
              className="p-1 rounded text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              id={`btn-cancel-rename-${item.key}`}
              onClick={handleCancelRename}
              disabled={isRenamingLoading}
              title="Cancel"
              aria-label="Cancel"
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      }

      return (
        <div
          className={cn(
            "group relative flex items-center w-full rounded-md text-xs font-medium cursor-pointer h-9 px-2 transition-colors duration-150 select-none",
            isDeletingSessionId === item.key && "opacity-40 pointer-events-none",
            isActive
              ? "bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.12)] font-semibold"
              : isUnread
              ? "text-zinc-200 hover:text-white bg-cyan-950/20 hover:bg-cyan-950/35 border border-cyan-500/25 shadow-[0_0_8px_rgba(6,182,212,0.08)]"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent"
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-cyan-400 rounded-full" />
          )}

          <div
            onClick={() => {
              if (isDeletingSessionId === item.key) return;
              markSessionRead(item.key);
              handleSelect();
            }}
            className={cn(
              "flex items-center flex-1 min-w-0 h-full overflow-hidden",
              isDeletingSessionId === item.key && "pointer-events-none opacity-40"
            )}
          >
            {/* Unread indicator icon in front of chat */}
            {isUnread && (
              <span
                className="shrink-0 flex items-center justify-center mr-1.5"
                title="Unread response"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.95)] animate-pulse" />
              </span>
            )}

            <span
              className={cn(
                "shrink-0 flex items-center justify-center w-7 h-7 rounded transition-colors mr-1.5 relative",
                isActive ? "text-cyan-400" : isUnread ? "text-cyan-300" : "text-zinc-400 group-hover:text-zinc-200"
              )}
            >
              {isDeletingSessionId === item.key ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
              ) : isSessionSending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              ) : isUnread ? (
                <span className="relative flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-cyan-400" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)] animate-pulse" />
                </span>
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </span>

            <span
              title={sessionName}
              className={cn(
                "truncate tracking-wide text-left flex-1 whitespace-nowrap",
                isUnread && !isActive ? "text-zinc-100 font-semibold" : ""
              )}
            >
              {sessionName}
            </span>

            {isUnread && !isActive && (
              <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-[9px] font-mono text-cyan-300 font-semibold shrink-0 ml-1.5">
                NEW
              </span>
            )}
          </div>

          <div
            data-session-item-actions
            className="flex items-center gap-1 shrink-0 ml-1.5"
          >
            <div className="relative">
              <button
                type="button"
                id={`btn-session-menu-${item.key}`}
                title="Session menu"
                aria-label="Session menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenSessionId((prev) => (prev === item.key ? null : item.key));
                }}
                className={cn(
                  "p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
                  isMenuOpen
                    ? "opacity-100 text-zinc-100 bg-white/15"
                    : "opacity-0 group-hover:opacity-100"
                )}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>

              {isMenuOpen && (
                <div
                  id={`dropdown-session-menu-${item.key}`}
                  className="absolute right-0 top-7 z-50 w-28 py-1 bg-zinc-900 border border-white/10 rounded-md shadow-2xl backdrop-blur-md text-xs animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    id={`btn-rename-session-${item.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenSessionId(null);
                      handleStartRename(item.key, sessionName);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors text-left cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Rename</span>
                  </button>
                  <button
                    type="button"
                    id={`btn-delete-session-${item.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenSessionId(null);
                      setSessionToDelete({ id: item.key, name: sessionName });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-500/15 transition-colors text-left cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    },
    [
      editingSessionId,
      editingName,
      menuOpenSessionId,
      isRenamingLoading,
      isDeletingSessionId,
      sendingSessions,
      handleSaveRename,
      handleCancelRename,
      handleStartRename,
    ]
  );

  const sidebarBottomContent = useMemo(() => {
    if (!sessionsHasMore && !loadingMoreSessions) return null;
    const remaining = sessionsTotalItems > sessions.length ? sessionsTotalItems - sessions.length : 0;
    return (
      <div className="pt-1.5 pb-2 w-full px-1 flex flex-col items-center select-none">
        {/* Infinite scroll sentinel for IntersectionObserver */}
        <div ref={loadMoreSentinelRef} className="h-1 w-full" />
        {loadingMoreSessions ? (
          <div className="flex items-center justify-center py-2 gap-2 text-xs text-zinc-400 font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            {!isSidebarCollapsed && <span>Loading remaining chats...</span>}
          </div>
        ) : (
          sessionsHasMore && (
            <button
              type="button"
              id="btn-load-more-chats"
              onClick={() => fetchSessions(sessionsPage + 1, sessionsCursor, true)}
              className="w-full py-1.5 px-2 flex items-center justify-center gap-1.5 rounded-md bg-white/[0.04] hover:bg-cyan-500/10 border border-white/[0.08] hover:border-cyan-500/30 text-xs text-zinc-300 hover:text-cyan-300 transition-all cursor-pointer font-medium select-none shadow-sm"
            >
              <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
              {!isSidebarCollapsed ? (
                <span>Load More Chats {remaining > 0 ? `(${remaining} left)` : ""}</span>
              ) : (
                <span>+</span>
              )}
            </button>
          )
        )}
      </div>
    );
  }, [
    sessionsHasMore,
    loadingMoreSessions,
    sessionsTotalItems,
    sessions.length,
    isSidebarCollapsed,
    sessionsPage,
    sessionsCursor,
    fetchSessions,
  ]);

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
        onSelect={(key) => {
          if (selectedSessionId === key) return;
          if (selectedSessionId) {
            setSessionMessages(selectedSessionId, messages);
          }
          markSessionRead(key);
          setSelectedSessionId(key);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={setIsSidebarCollapsed}
        onScroll={handleSessionsScroll}
        renderItem={renderSidebarItem}
        isLoading={sessionsLoading}
        isLoadingMore={loadingMoreSessions}
        bottomContent={sidebarBottomContent}
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
                  {sessions.length > 0 && (
                    <button
                      type="button"
                      id="btn-sidebar-delete-all"
                      onClick={() => setIsDeleteAllModalOpen(true)}
                      title="Delete All Chats"
                      aria-label="Delete All Chats"
                      className="p-1 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
          <div className="h-8 flex items-center justify-between px-3 text-xs text-zinc-400 font-mono select-none overflow-hidden whitespace-nowrap w-full">
            {!isSidebarCollapsed ? (
              <>
                <span className="truncate">Total Chats: {sessionsTotalItems || sessions.length}</span>
                {sessions.length > 0 && (
                  <button
                    type="button"
                    id="btn-footer-delete-all"
                    onClick={() => setIsDeleteAllModalOpen(true)}
                    className="text-[11px] font-sans text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1"
                    title="Delete All Chats"
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                    <span>Delete All</span>
                  </button>
                )}
              </>
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
                  {cleanMessages.length > 0 && (
                    <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                      • {cleanMessages.length}{" "}
                      {cleanMessages.length === 1 ? "message" : "messages"}
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
          onScroll={handleMessagesScroll}
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

              {/* Requirement 3: Privacy Notice */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-cyan-950/25 border border-cyan-500/25 text-left w-full shadow-[0_0_20px_rgba(6,182,212,0.06)] select-none">
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  All chats are stored locally in secure, encrypted storage. Nobody else can read or alter them. Chats are not stored in the cloud or used for any other purposes.
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left pt-1">
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
                      {/* Message header with name/date & copy button */}
                      <div className="flex items-center gap-1.5 px-1 text-[11px] text-zinc-500 font-mono">
                        {isUser ? (
                          <>
                            <button
                              type="button"
                              id={`btn-copy-msg-${msg.id}`}
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              title="Copy message"
                              aria-label="Copy message"
                              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              {copiedMessageId === msg.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            <span>{formatDate(msg.created_at)}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-cyan-400">Mira</span>
                            <span>•</span>
                            <span>{formatDate(msg.created_at)}</span>
                            <button
                              type="button"
                              id={`btn-copy-msg-${msg.id}`}
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              title="Copy message"
                              aria-label="Copy message"
                              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              {copiedMessageId === msg.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </>
                        )}
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
              {isCurrentSessionSending && (
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

        {/* Floating scroll to bottom button when user has scrolled up */}
        {showScrollBottom && selectedSessionId && cleanMessages.length > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            className="absolute bottom-20 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/95 text-cyan-400 hover:text-cyan-300 border border-cyan-500/40 shadow-xl shadow-black/60 text-xs font-medium backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Latest messages</span>
          </button>
        )}

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
                disabled={!inputText.trim() || isCurrentSessionSending}
                title={isCurrentSessionSending ? "Waiting for AI response..." : "Send message (Enter)"}
                aria-label="Send message"
                className={cn(
                  "p-2 rounded-xl text-white font-medium transition-all duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-md",
                  inputText.trim() && !isCurrentSessionSending
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:scale-95 shadow-cyan-500/20"
                    : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
                )}
              >
                {isCurrentSessionSending ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Privacy message & system status */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-2 pt-1 text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] text-center sm:text-left select-none">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400/80 shrink-0" />
                <span>
                  All chats are stored locally in secure, encrypted storage. Nobody else can read or alter them. Chats are not stored in the cloud or used for any other purposes.
                </span>
              </div>
              {sessionsError && (
                <span className="text-red-400 shrink-0 font-mono text-[10px]">Offline fallback active</span>
              )}
            </div>
          </div>
        </footer>
      </section>

      {/* ==================================================================== */}
      {/* MODAL: Confirmation Dialog for Single Session Deletion */}
      {/* ==================================================================== */}
      {sessionToDelete && (
        <div
          id="modal-delete-session-confirmation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={handleCancelDeleteSession}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-base font-semibold text-zinc-100">Delete Chat Session?</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Are you sure you want to delete this chat session? All messages will be permanently removed from local encrypted storage and Redis memory.
                </p>
                <div className="mt-2 p-2 rounded-lg bg-zinc-950/60 border border-white/5 font-mono text-xs text-zinc-300 truncate">
                  {sessionToDelete.name || sessionToDelete.id}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                id="btn-cancel-delete-session"
                onClick={handleCancelDeleteSession}
                disabled={Boolean(isDeletingSessionId)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                No
              </button>
              <button
                type="button"
                id="btn-confirm-delete-session"
                onClick={handleConfirmDeleteSession}
                disabled={Boolean(isDeletingSessionId)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 active:scale-95 text-white transition-all shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isDeletingSessionId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: Confirmation Dialog for Delete All Chats */}
      {/* ==================================================================== */}
      {isDeleteAllModalOpen && (
        <div
          id="modal-delete-all-chats-confirmation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeletingAll) {
              setIsDeleteAllModalOpen(false);
              setDeleteAllConfirmText("");
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-rose-500/30 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div className="space-y-1.5 min-w-0 flex-1">
                <h3 className="text-base font-semibold text-zinc-100">Delete All Chat Sessions?</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  This action is <span className="font-semibold text-rose-400">permanent and irreversible</span>. All chat sessions and messages will be wiped from local encrypted storage, and all short-term conversation state will be cleared from Redis.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>To confirm, type the phrase below:</span>
                <button
                  type="button"
                  onClick={() => setDeleteAllConfirmText(DELETE_ALL_CONFIRMATION_PHRASE)}
                  className="font-mono font-bold text-xs text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  title="Click to fill confirmation phrase"
                >
                  {DELETE_ALL_CONFIRMATION_PHRASE}
                </button>
              </div>
              <input
                id="input-delete-all-confirm"
                type="text"
                autoFocus
                disabled={isDeletingAll}
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder={DELETE_ALL_CONFIRMATION_PHRASE}
                className="w-full px-3 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-colors"
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    deleteAllConfirmText.trim().toUpperCase() === DELETE_ALL_CONFIRMATION_PHRASE &&
                    !isDeletingAll
                  ) {
                    handleConfirmDeleteAll();
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                id="btn-cancel-delete-all"
                onClick={() => {
                  setIsDeleteAllModalOpen(false);
                  setDeleteAllConfirmText("");
                }}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-all"
                onClick={handleConfirmDeleteAll}
                disabled={
                  deleteAllConfirmText.trim().toUpperCase() !== DELETE_ALL_CONFIRMATION_PHRASE ||
                  isDeletingAll
                }
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-medium transition-all shadow-md flex items-center gap-2 cursor-pointer",
                  deleteAllConfirmText.trim().toUpperCase() === DELETE_ALL_CONFIRMATION_PHRASE &&
                    !isDeletingAll
                    ? "bg-rose-600 hover:bg-rose-500 active:scale-95 text-white shadow-rose-600/30"
                    : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
                )}
              >
                {isDeletingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting All Chats...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All Chats</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatsPage;
