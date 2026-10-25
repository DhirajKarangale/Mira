import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type FC,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export enum MessageBarColor {
  Red = "red",
  Green = "green",
  White = "white",
  Yellow = "yellow",
  Cyan = "cyan",
  Blue = "blue",
  Purple = "purple",
  Orange = "orange",
  Pink = "pink",
  Gray = "gray",
}

export type MessageType = "success" | "error" | "warning" | "info" | "default";

export interface MessageToastOptions {
  id?: string;
  title?: ReactNode;
  message: ReactNode;
  type?: MessageType;
  color?: MessageBarColor | `${MessageBarColor}` | string;
  duration?: number;
  icon?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export interface MessageBarProps {
  message: ReactNode;
  title?: ReactNode;
  color?: MessageBarColor | `${MessageBarColor}` | MessageType | string;
  type?: MessageType;
  duration?: number;
  onDismiss?: () => void;
  icon?: ReactNode;
  className?: string;
}

interface InternalToast extends MessageToastOptions {
  id: string;
  duration: number;
  createdAt: number;
}

interface ColorTheme {
  border: string;
  bg: string;
  text: string;
  glow: string;
  bullet: string;
  progress: string;
  defaultIcon: ReactNode;
}

const THEME_STYLES: Record<string, ColorTheme> = {
  success: {
    border: "border-emerald-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-emerald-200",
    glow: "shadow-[0_8px_30px_rgba(16,185,129,0.18)]",
    bullet: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]",
    progress: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]",
    defaultIcon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  },
  green: {
    border: "border-emerald-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-emerald-200",
    glow: "shadow-[0_8px_30px_rgba(16,185,129,0.18)]",
    bullet: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]",
    progress: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]",
    defaultIcon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  },
  error: {
    border: "border-rose-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-rose-200",
    glow: "shadow-[0_8px_30px_rgba(244,63,94,0.18)]",
    bullet: "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)]",
    progress: "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)]",
    defaultIcon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
  },
  red: {
    border: "border-rose-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-rose-200",
    glow: "shadow-[0_8px_30px_rgba(244,63,94,0.18)]",
    bullet: "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)]",
    progress: "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)]",
    defaultIcon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
  },
  warning: {
    border: "border-amber-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-amber-200",
    glow: "shadow-[0_8px_30px_rgba(245,158,11,0.18)]",
    bullet: "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)]",
    progress: "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)]",
    defaultIcon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  },
  yellow: {
    border: "border-amber-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-amber-200",
    glow: "shadow-[0_8px_30px_rgba(245,158,11,0.18)]",
    bullet: "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)]",
    progress: "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)]",
    defaultIcon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  },
  info: {
    border: "border-cyan-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-cyan-200",
    glow: "shadow-[0_8px_30px_rgba(6,182,212,0.18)]",
    bullet: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]",
    progress: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]",
    defaultIcon: <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />,
  },
  cyan: {
    border: "border-cyan-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-cyan-200",
    glow: "shadow-[0_8px_30px_rgba(6,182,212,0.18)]",
    bullet: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]",
    progress: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]",
    defaultIcon: <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />,
  },
  blue: {
    border: "border-blue-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-blue-200",
    glow: "shadow-[0_8px_30px_rgba(59,130,246,0.18)]",
    bullet: "bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.9)]",
    progress: "bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.9)]",
    defaultIcon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
  },
  purple: {
    border: "border-purple-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-purple-200",
    glow: "shadow-[0_8px_30px_rgba(168,85,247,0.18)]",
    bullet: "bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.9)]",
    progress: "bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.9)]",
    defaultIcon: <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />,
  },
  orange: {
    border: "border-orange-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-orange-200",
    glow: "shadow-[0_8px_30px_rgba(249,115,22,0.18)]",
    bullet: "bg-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.9)]",
    progress: "bg-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.9)]",
    defaultIcon: <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />,
  },
  pink: {
    border: "border-pink-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-pink-200",
    glow: "shadow-[0_8px_30px_rgba(236,72,153,0.18)]",
    bullet: "bg-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.9)]",
    progress: "bg-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.9)]",
    defaultIcon: <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />,
  },
  white: {
    border: "border-zinc-300/30",
    bg: "bg-zinc-900/90 hover:bg-zinc-900/95",
    text: "text-white",
    glow: "shadow-[0_8px_30px_rgba(255,255,255,0.1)]",
    bullet: "bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]",
    progress: "bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]",
    defaultIcon: <Info className="w-4 h-4 text-white shrink-0" />,
  },
  gray: {
    border: "border-zinc-700/40",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-zinc-300",
    glow: "shadow-[0_8px_30px_rgba(113,113,122,0.15)]",
    bullet: "bg-zinc-400 shadow-[0_0_8px_rgba(113,113,122,0.6)]",
    progress: "bg-zinc-400 shadow-[0_0_8px_rgba(113,113,122,0.6)]",
    defaultIcon: <Info className="w-4 h-4 text-zinc-400 shrink-0" />,
  },
  default: {
    border: "border-cyan-500/35",
    bg: "bg-zinc-950/90 hover:bg-zinc-950/95",
    text: "text-cyan-200",
    glow: "shadow-[0_8px_30px_rgba(6,182,212,0.18)]",
    bullet: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]",
    progress: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]",
    defaultIcon: <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />,
  },
};

function resolveTheme(
  color?: MessageBarColor | `${MessageBarColor}` | MessageType | string,
  type?: MessageType
): ColorTheme {
  const key = (color || type || "cyan").toString().toLowerCase();
  return THEME_STYLES[key] || THEME_STYLES[type || "cyan"] || THEME_STYLES.cyan;
}

type ToastListener = (toast: InternalToast) => void;
type DismissListener = (id: string) => void;
type ClearListener = () => void;

const listeners = new Set<ToastListener>();
const dismissListeners = new Set<DismissListener>();
const clearListeners = new Set<ClearListener>();

let toastCounter = 0;

/**
 * ToastCard - Individual bottom-right animated slide notification
 */
export const ToastCard: FC<{
  toast: InternalToast;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const duration = toast.duration || 5000;
  const theme = resolveTheme(toast.color, toast.type);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTimeRef = useRef(duration);
  const pauseStartRef = useRef<number>(Date.now());
  const hasExitedRef = useRef(false);

  const startDismissAnimation = useCallback(() => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
      toast.onDismiss?.();
    }, 360);
  }, [onDismiss, toast]);

  useEffect(() => {
    if (isPaused) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      const elapsed = Date.now() - pauseStartRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    } else {
      pauseStartRef.current = Date.now();
      dismissTimerRef.current = setTimeout(() => {
        startDismissAnimation();
      }, remainingTimeRef.current);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [isPaused, startDismissAnimation]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={cn(
        "pointer-events-auto relative w-full sm:w-auto min-w-[280px] max-w-[92vw] sm:max-w-md",
        "flex flex-col rounded-xl overflow-hidden border backdrop-blur-2xl text-xs select-none transition-all duration-300",
        theme.bg,
        theme.border,
        theme.glow,
        isExiting ? "animate-message-slide-out" : "animate-message-slide-in",
        toast.className
      )}
    >
      <div className="flex items-start gap-3 p-3.5 pr-2.5 pb-3">
        <div className="shrink-0 pt-0.5">
          {toast.icon ? toast.icon : theme.defaultIcon}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          {toast.title && (
            <h4 className="font-semibold text-zinc-100 text-xs mb-0.5 tracking-tight truncate">
              {toast.title}
            </h4>
          )}
          <div className={cn("text-xs font-medium leading-relaxed break-words", theme.text)}>
            {toast.message}
          </div>
        </div>

        <button
          type="button"
          aria-label="Dismiss message"
          onClick={startDismissAnimation}
          className="shrink-0 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Animated lifespan progress bar line pinned flush to bottom */}
      <div className="absolute bottom-0 inset-x-0 h-[2.5px] bg-white/[0.08] overflow-hidden">
        <div
          className={cn("h-full w-full", theme.progress)}
          style={{
            animation: `toastProgressLine ${duration}ms linear forwards`,
            animationPlayState: isPaused ? "paused" : "running",
          }}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) {
              startDismissAnimation();
            }
          }}
        />
      </div>
    </div>
  );
};

/**
 * MessageContainer - The fixed bottom-right overlay hosting all active messages
 */
export const MessageContainer: FC<{
  toasts: InternalToast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      id="mira-message-overlay-viewport"
      data-tauri-drag-region="false"
      className="fixed bottom-5 right-5 z-[99999] pointer-events-none flex flex-col items-end gap-2.5 max-w-[94vw] sm:max-w-md w-full"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} toast={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export interface MessageContextValue {
  toasts: InternalToast[];
  showMessage: (options: MessageToastOptions | string) => string;
  success: (message: ReactNode, options?: Partial<MessageToastOptions>) => string;
  error: (message: ReactNode, options?: Partial<MessageToastOptions>) => string;
  warning: (message: ReactNode, options?: Partial<MessageToastOptions>) => string;
  info: (message: ReactNode, options?: Partial<MessageToastOptions>) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const MessageContext = createContext<MessageContextValue | null>(null);

/**
 * MessageProvider - Wrap root App to enable seamless bottom-right message overlays
 */
export const MessageProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<InternalToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const showMessage = useCallback((options: MessageToastOptions | string): string => {
    const normalized: MessageToastOptions =
      typeof options === "string" ? { message: options } : options;

    const id = normalized.id || `toast-${++toastCounter}-${Date.now()}`;
    const newToast: InternalToast = {
      ...normalized,
      id,
      duration: normalized.duration ?? 5000,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      return [...filtered.slice(-4), newToast];
    });

    return id;
  }, []);

  const success = useCallback(
    (message: ReactNode, opts?: Partial<MessageToastOptions>) =>
      showMessage({ ...opts, message, type: "success" }),
    [showMessage]
  );

  const error = useCallback(
    (message: ReactNode, opts?: Partial<MessageToastOptions>) =>
      showMessage({ ...opts, message, type: "error" }),
    [showMessage]
  );

  const warning = useCallback(
    (message: ReactNode, opts?: Partial<MessageToastOptions>) =>
      showMessage({ ...opts, message, type: "warning" }),
    [showMessage]
  );

  const info = useCallback(
    (message: ReactNode, opts?: Partial<MessageToastOptions>) =>
      showMessage({ ...opts, message, type: "info" }),
    [showMessage]
  );

  useEffect(() => {
    const handleGlobalAdd: ToastListener = (incoming) => {
      setToasts((prev) => {
        const filtered = prev.filter((t) => t.id !== incoming.id);
        return [...filtered.slice(-4), incoming];
      });
    };

    const handleGlobalDismiss: DismissListener = (id) => {
      dismiss(id);
    };

    const handleGlobalClear: ClearListener = () => {
      clearAll();
    };

    listeners.add(handleGlobalAdd);
    dismissListeners.add(handleGlobalDismiss);
    clearListeners.add(handleGlobalClear);

    return () => {
      listeners.delete(handleGlobalAdd);
      dismissListeners.delete(handleGlobalDismiss);
      clearListeners.delete(handleGlobalClear);
    };
  }, [dismiss, clearAll]);

  const value = {
    toasts,
    showMessage,
    success,
    error,
    warning,
    info,
    dismiss,
    clearAll,
  };

  return (
    <MessageContext.Provider value={value}>
      {children}
      <MessageContainer toasts={toasts} onDismiss={dismiss} />
    </MessageContext.Provider>
  );
};

export const useMessage = (): MessageContextValue => {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    return {
      toasts: [],
      showMessage: toast.show,
      success: toast.success,
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
      dismiss: toast.dismiss,
      clearAll: toast.clearAll,
    };
  }
  return ctx;
};

export const useToast = useMessage;

/**
 * Imperative global toast API - can be called anywhere in app or service callbacks!
 */
export const toast = {
  show: (options: MessageToastOptions | string): string => {
    const normalized: MessageToastOptions =
      typeof options === "string" ? { message: options } : options;
    const id = normalized.id || `toast-${++toastCounter}-${Date.now()}`;
    const item: InternalToast = {
      ...normalized,
      id,
      duration: normalized.duration ?? 5000,
      createdAt: Date.now(),
    };
    listeners.forEach((fn) => fn(item));
    return id;
  },
  success: (message: ReactNode, options?: Partial<MessageToastOptions>): string => {
    return toast.show({ ...options, message, type: "success" });
  },
  error: (message: ReactNode, options?: Partial<MessageToastOptions>): string => {
    return toast.show({ ...options, message, type: "error" });
  },
  warning: (message: ReactNode, options?: Partial<MessageToastOptions>): string => {
    return toast.show({ ...options, message, type: "warning" });
  },
  info: (message: ReactNode, options?: Partial<MessageToastOptions>): string => {
    return toast.show({ ...options, message, type: "info" });
  },
  dismiss: (id: string): void => {
    dismissListeners.forEach((fn) => fn(id));
  },
  clearAll: (): void => {
    clearListeners.forEach((fn) => fn());
  },
};

/**
 * MessageBar Component
 * Can be used standalone in JSX if desired, or driven declaratively by props.
 * Slides from bottom-right, displays for duration (default 5000ms), then slides out.
 */
export const MessageBar: FC<MessageBarProps> = ({
  message,
  title,
  color,
  type,
  duration = 5000,
  onDismiss,
  icon,
  className,
}) => {
  const [internalToast, setInternalToast] = useState<InternalToast | null>(null);

  useEffect(() => {
    if (!message) {
      setInternalToast(null);
      return;
    }

    const item: InternalToast = {
      id: `standalone-toast-${Date.now()}`,
      message,
      title,
      color: color as string,
      type,
      duration,
      onDismiss,
      icon,
      className,
      createdAt: Date.now(),
    };

    setInternalToast(item);
  }, [message, title, color, type, duration, onDismiss, icon, className]);

  if (!internalToast) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[99999] pointer-events-none">
      <ToastCard
        toast={internalToast}
        onDismiss={() => {
          setInternalToast(null);
          onDismiss?.();
        }}
      />
    </div>
  );
};
