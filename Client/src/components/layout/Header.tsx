import type { FC } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NavTabs } from "./NavTabs";
import { WindowControls } from "./WindowControls";
import { cn } from "@/lib/utils";

export const Header: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isMiraActive =
    location.pathname === "/" || location.pathname === "/mira";

  return (
    <header
      id="app-header"
      data-tauri-drag-region
      className="relative flex items-center justify-between h-10 px-2 sm:px-3 bg-zinc-950/80 backdrop-blur-md border-b border-white/[0.08] select-none z-50 text-xs shrink-0"
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
          "group relative flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-3 px-1.5 sm:px-2 py-1 rounded-md transition-all duration-150 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 shrink-0",
          isMiraActive
            ? "bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            : "hover:bg-white/5 border border-transparent"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center h-5 w-5 rounded overflow-hidden transition-all duration-150 shrink-0",
            isMiraActive
              ? "bg-cyan-500/25 border border-cyan-400/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "bg-zinc-800/80 border border-white/10 group-hover:border-cyan-500/30"
          )}
        >
          <img
            src="/icons/icon.png"
            alt="MIRA"
            className="h-4 w-4 object-contain rounded-sm"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-bold tracking-wider text-[12px] sm:text-[13px] transition-colors duration-150",
              isMiraActive
                ? "bg-gradient-to-r from-cyan-200 via-zinc-100 to-cyan-300 bg-clip-text text-transparent"
                : "text-zinc-200 group-hover:text-white"
            )}
          >
            MIRA
          </span>
          <span
            className={cn(
              "text-[9px] sm:text-[10px] uppercase font-mono px-1 py-0.5 rounded transition-colors duration-150 hidden xs:inline",
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
        className="flex-1 flex items-center overflow-x-auto no-scrollbar min-w-0"
        data-tauri-drag-region
      >
        <NavTabs />
      </div>

      <div className="flex items-center ml-1 sm:ml-2 -mr-2 sm:-mr-3 h-full shrink-0">
        <WindowControls />
      </div>
    </header>
  );
};
