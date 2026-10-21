import {
  useEffect,
  useState,
  type FC,
  type ReactNode,
} from "react";
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

export interface MessageBarProps {
  message: ReactNode;
  color: MessageBarColor | `${MessageBarColor}`;
  duration?: number;
  onDismiss?: () => void;
  icon?: ReactNode;
  className?: string;
}


const COLOR_STYLES: Record<
  MessageBarColor | string,
  {
    container: string;
    bullet: string;
  }
> = {
  [MessageBarColor.Red]: {
    container:
      "bg-red-950/90 text-red-200 border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.25)]",
    bullet: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]",
  },
  [MessageBarColor.Green]: {
    container:
      "bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.25)]",
    bullet: "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
  },
  [MessageBarColor.White]: {
    container:
      "bg-zinc-900/95 text-white border-zinc-200/50 shadow-[0_0_25px_rgba(255,255,255,0.2)]",
    bullet: "bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]",
  },
  [MessageBarColor.Yellow]: {
    container:
      "bg-yellow-950/90 text-yellow-200 border-yellow-500/40 shadow-[0_0_25px_rgba(234,179,8,0.25)]",
    bullet: "bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.8)]",
  },
  [MessageBarColor.Cyan]: {
    container:
      "bg-cyan-950/90 text-cyan-200 border-cyan-500/40 shadow-[0_0_25px_rgba(6,182,212,0.25)]",
    bullet: "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]",
  },
  [MessageBarColor.Blue]: {
    container:
      "bg-blue-950/90 text-blue-200 border-blue-500/40 shadow-[0_0_25px_rgba(59,130,246,0.25)]",
    bullet: "bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]",
  },
  [MessageBarColor.Purple]: {
    container:
      "bg-purple-950/90 text-purple-200 border-purple-500/40 shadow-[0_0_25px_rgba(168,85,247,0.25)]",
    bullet: "bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]",
  },
  [MessageBarColor.Orange]: {
    container:
      "bg-orange-950/90 text-orange-200 border-orange-500/40 shadow-[0_0_25px_rgba(249,115,22,0.25)]",
    bullet: "bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.8)]",
  },
  [MessageBarColor.Pink]: {
    container:
      "bg-pink-950/90 text-pink-200 border-pink-500/40 shadow-[0_0_25px_rgba(236,72,153,0.25)]",
    bullet: "bg-pink-400 shadow-[0_0_8px_rgba(236,72,153,0.8)]",
  },
  [MessageBarColor.Gray]: {
    container:
      "bg-zinc-900/90 text-zinc-300 border-zinc-600/40 shadow-[0_0_25px_rgba(113,113,122,0.2)]",
    bullet: "bg-zinc-400 shadow-[0_0_8px_rgba(113,113,122,0.6)]",
  },
};

export const MessageBar: FC<MessageBarProps> = ({
  message,
  color,
  duration = 5000,
  onDismiss,
  icon,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setIsVisible(false);
      setIsRendered(false);
      return;
    }

    setIsRendered(true);

    const appearTimer = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
    }, Math.max(duration - 300, 500));

    const unmountTimer = setTimeout(() => {
      setIsRendered(false);
      onDismiss?.();
    }, duration);

    return () => {
      cancelAnimationFrame(appearTimer);
      clearTimeout(dismissTimer);
      clearTimeout(unmountTimer);
    };
  }, [message, color, duration, onDismiss]);

  if (!isRendered || !message) {
    return null;
  }

  const colorConfig = COLOR_STYLES[color] || COLOR_STYLES[MessageBarColor.Cyan];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center select-none transition-all duration-300 ease-out",
        isVisible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 -translate-y-3 scale-95",
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-none flex items-center gap-2.5 px-4 py-2 rounded-full border backdrop-blur-md text-xs font-medium tracking-wide transition-all",
          colorConfig.container
        )}
      >
        {icon ? (
          <span className="shrink-0">{icon}</span>
        ) : (
          <span
            className={cn("h-2 w-2 rounded-full shrink-0", colorConfig.bullet)}
          />
        )}

        <span className="truncate max-w-[80vw]">{message}</span>
      </div>
    </div>
  );
};

