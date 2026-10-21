import type { FC } from "react";
import { AppWindow, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import { useRefreshAnimation } from "@/hooks/useRefreshAnimation";
import { cn } from "@/lib/utils";

interface AppsHeaderProps {
  totalApps: number;
  allowedCount: number;
  restrictedCount: number;
  onRefresh: () => Promise<unknown> | void;
  isRefreshing?: boolean;
}

export const AppsHeader: FC<AppsHeaderProps> = ({
  totalApps,
  allowedCount,
  restrictedCount,
  onRefresh,
  isRefreshing = false,
}) => {
  const { isRefreshing: isAnimRefreshing, handleRefresh } = useRefreshAnimation(onRefresh, {
    minDurationMs: 650,
  });
  const isBusy = isRefreshing || isAnimRefreshing;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-blue-950/25 via-zinc-900/60 to-purple-950/25 p-4 sm:p-6 backdrop-blur-xl shadow-xl">
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)] shrink-0">
            <AppWindow className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>

          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white shrink-0 whitespace-nowrap">
                Capture Apps Configurations
              </h1>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-zinc-300">
                  <span className="font-mono">{totalApps}</span>
                  <span>Discovered</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="font-mono">{allowedCount}</span>
                  <span>Allowed</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="font-mono">{restrictedCount}</span>
                  <span>Restricted</span>
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Control which desktop applications MIRA Operator captures. When a restricted application is active,
              screen capturing is skipped automatically without interrupting your workflow.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start xl:self-center">
          <button
            type="button"
            id="btn-refresh-apps"
            onClick={handleRefresh}
            disabled={isBusy}
            className={cn(
              "group relative inline-flex items-center justify-center gap-2 h-[42px] sm:h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold shadow-lg transition-all duration-200 select-none whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              isBusy
                ? "bg-zinc-800/60 border border-blue-500/30 text-blue-300 cursor-not-allowed opacity-80"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:shadow-[0_0_28px_rgba(59,130,246,0.4)] border border-blue-400/30 cursor-pointer active:scale-95"
            )}
            title={isBusy ? "Discovering system applications..." : "Scan system and refresh installed applications"}
          >
            <RefreshCw className={cn("w-4 h-4 text-blue-300 transition-transform", isBusy && "animate-spin")} />
            <span>{isBusy ? "Scanning Apps..." : "Refresh Apps"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
