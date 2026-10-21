import type { FC } from "react";
import {
  MonitorPlay,
  Play,
  Square,
  Power,
  ShieldCheck,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { CaptureStatus } from "../types";
import { cn } from "@/lib/utils";

interface CaptureStatusHeaderProps {
  status: CaptureStatus;
  statusLoading?: boolean;
  autoStart: boolean;
  autoStartLoading: boolean;
  onToggleStatus: () => void;
  onToggleAutoStart: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const CaptureStatusHeader: FC<CaptureStatusHeaderProps> = ({
  status,
  statusLoading = false,
  autoStart,
  autoStartLoading,
  onToggleStatus,
  onToggleAutoStart,
  onRefresh,
  refreshing = false,
}) => {
  const isStarted = status === "Started";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-cyan-950/25 via-zinc-900/60 to-blue-950/25 p-6 backdrop-blur-xl shadow-xl">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Module Identity & Status Badge */}
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)] shrink-0">
            <MonitorPlay className="w-7 h-7" />
          </div>

          <div className="space-y-1.5 min-w-0">
            {/* Header Title & Badges: Locked in single row to prevent jumpy wrapping */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-nowrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white shrink-0 whitespace-nowrap">
                Captured Data
              </h1>

              {/* Status Badge: Started vs Stopped */}
              <div
                id="capture-status-badge"
                className={cn(
                  "inline-flex items-center justify-center gap-2 w-[128px] h-[26px] px-2.5 rounded-full text-xs font-semibold border transition-all duration-200 shrink-0 whitespace-nowrap select-none",
                  isStarted
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    : "bg-zinc-800/80 border-white/[0.08] text-zinc-400"
                )}
              >
                {isStarted ? (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span>Status: Started</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex rounded-full h-2 w-2 bg-zinc-500 shrink-0" />
                    <span>Status: Stopped</span>
                  </>
                )}
              </div>

              {/* Vault Config tag - Stays locked on first row */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06] shrink-0 whitespace-nowrap select-none">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Vault Managed</span>
              </span>

              {/* Explicit Refresh Status Button */}
              {onRefresh && (
                <button
                  type="button"
                  id="btn-refresh-capture-status"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] hover:border-white/[0.2] bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer select-none outline-none disabled:opacity-50"
                  title="Check live Operator status now"
                >
                  <RotateCcw className={cn("w-3 h-3", refreshing && "animate-spin")} />
                </button>
              )}
            </div>

            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Real-time screen capturing loop powered by the Operator engine. Review temporal
              retention ranges and manage capturing preferences.
            </p>
          </div>
        </div>

        {/* Right Controls: Auto-Start Toggle Switch & Start/Stop Button */}
        <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
          {/* Sleek, Redesigned Auto-Start Switch */}
          <button
            type="button"
            id="btn-toggle-auto-start"
            role="switch"
            aria-checked={autoStart}
            onClick={onToggleAutoStart}
            disabled={autoStartLoading}
            className={cn(
              "group relative flex items-center justify-between gap-2.5 h-[44px] w-[212px] px-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0",
              autoStart
                ? "bg-cyan-500/10 border-cyan-500/35 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:border-cyan-500/50 hover:bg-cyan-500/15"
                : "bg-zinc-850/80 border-white/[0.08] text-zinc-400 hover:border-white/[0.16] hover:bg-zinc-800/80 hover:text-zinc-200"
            )}
            title={
              autoStart
                ? "Auto-start is enabled (starts 10s after server launch). Click to turn off."
                : "Auto-start is disabled. Click to turn on (starts 10s after server launch)."
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  "p-1.5 rounded-lg border transition-colors shrink-0",
                  autoStart
                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                    : "bg-zinc-800 border-white/[0.06] text-zinc-500 group-hover:text-zinc-300"
                )}
              >
                <Power className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-zinc-200 whitespace-nowrap">Auto Start</span>
                  <span
                    className={cn(
                      "text-[9px] font-mono w-7 text-center py-0.2 rounded font-bold uppercase tracking-wider shrink-0",
                      autoStart
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "bg-zinc-800 text-zinc-500 border border-white/5"
                    )}
                  >
                    {autoStart ? "ON" : "OFF"}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono w-[100px] whitespace-nowrap">
                  {autoStart ? "10s delay on boot" : "Manual trigger"}
                </span>
              </div>
            </div>

            {/* Modern sliding toggle switch track */}
            <div
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors duration-200 p-0.5 shrink-0",
                autoStart ? "bg-cyan-500 shadow-inner" : "bg-zinc-700/80"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-out flex items-center justify-center",
                  autoStart ? "translate-x-4" : "translate-x-0"
                )}
              >
                {autoStartLoading && (
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-600" />
                )}
              </div>
            </div>
          </button>

          {/* Start / Stop Immediate Capture Button - Sleek, single-line gradient button */}
          <button
            type="button"
            id="btn-toggle-capture-status"
            onClick={onToggleStatus}
            disabled={statusLoading}
            className={cn(
              "group relative inline-flex items-center justify-center gap-2.5 h-[44px] w-[160px] px-4 rounded-xl text-xs sm:text-sm font-semibold shadow-lg transition-all duration-200 cursor-pointer active:scale-95 shrink-0 select-none whitespace-nowrap outline-none focus-visible:ring-2",
              statusLoading && "opacity-75 cursor-not-allowed pointer-events-none",
              isStarted
                ? "bg-gradient-to-r from-rose-500 via-rose-600 to-red-600 hover:from-rose-400 hover:to-red-500 text-white border border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.25)] hover:shadow-[0_0_28px_rgba(244,63,94,0.4)] focus-visible:ring-rose-400"
                : "bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_28px_rgba(16,185,129,0.4)] focus-visible:ring-emerald-400"
            )}
            title={isStarted ? "Stop screenshot capturing" : "Start screenshot capturing"}
          >
            {statusLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="tracking-wide">Updating...</span>
              </>
            ) : isStarted ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current shrink-0 transition-transform group-hover:scale-110" />
                <span className="tracking-wide">Stop Capturing</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current shrink-0 transition-transform group-hover:scale-110" />
                <span className="tracking-wide">Start Capturing</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
