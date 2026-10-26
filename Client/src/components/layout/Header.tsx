import type { FC } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NavTabs } from "./NavTabs";
import { WindowControls } from "./WindowControls";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export const Header: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMicOn, toggleListening } = useSpeechRecognition(true);

  const isMiraActive =
    location.pathname === "/" || location.pathname === "/mira";

  return (
    <header
      id="app-header"
      data-tauri-drag-region
      className="relative flex items-center justify-between h-10 px-3 bg-zinc-950/80 backdrop-blur-md border-b border-white/[0.08] select-none z-50 text-xs shrink-0"
    >
      <button
        type="button"
        id="nav-item-mira"
        role="tab"
        aria-selected={isMiraActive}
        aria-label="MIRA Client Home"
        data-tauri-drag-region="false"
        onClick={() => navigate("/mira")}
        className={cn(
          "group relative flex items-center gap-2 mr-3 px-2 py-1 rounded-md transition-all duration-150 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
          isMiraActive
            ? "bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            : "hover:bg-white/5 border border-transparent"
        )}
      >
        {/* Only one small green blinking dot at MIRA top corner when mic is on */}
        {isMicOn && (
          <span
            id="mira-top-corner-mic-indicator"
            onClick={(e) => {
              e.stopPropagation();
              toggleListening();
            }}
            title="Microphone is ON (Listening). Click to mute."
            className="absolute -top-1 -right-1 flex h-2.5 w-2.5 z-20 cursor-pointer pointer-events-auto"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </span>
        )}

        <div
          className={cn(
            "flex items-center justify-center h-5 w-5 rounded transition-all duration-150",
            isMiraActive
              ? "bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "bg-zinc-800/80 border border-white/10 text-zinc-300 group-hover:text-cyan-400 group-hover:border-cyan-500/30"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-bold tracking-wider text-[13px] transition-colors duration-150",
              isMiraActive
                ? "bg-gradient-to-r from-cyan-200 via-zinc-100 to-cyan-300 bg-clip-text text-transparent"
                : "text-zinc-200 group-hover:text-white"
            )}
          >
            MIRA
          </span>
          <span
            className={cn(
              "text-[10px] uppercase font-mono px-1 py-0.5 rounded transition-colors duration-150",
              isMiraActive
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "bg-zinc-800/80 text-zinc-400 border border-white/5 group-hover:text-zinc-200"
            )}
          >
            Client
          </span>
        </div>

        {isMiraActive && (
          <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded-full" />
        )}
      </button>

      <div
        className="flex-1 flex items-center overflow-x-auto no-scrollbar"
        data-tauri-drag-region
      >
        <NavTabs />
      </div>

      <div className="flex items-center ml-2 -mr-3 h-full">
        <WindowControls />
      </div>
    </header>
  );
};
