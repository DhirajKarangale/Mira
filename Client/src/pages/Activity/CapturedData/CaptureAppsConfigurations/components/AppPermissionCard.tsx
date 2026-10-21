import type { FC } from "react";
import { AppWindow, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import type { AppPermission } from "../../types";
import { cn } from "@/lib/utils";

interface AppPermissionCardProps {
  app: AppPermission;
  onTogglePermission: (appId: string, currentAllowed: boolean) => void;
  isUpdating?: boolean;
}

export const AppPermissionCard: FC<AppPermissionCardProps> = ({
  app,
  onTogglePermission,
  isUpdating = false,
}) => {
  const isAllowed = app.allowed_to_capture;

  // Generate consistent vibrant color based on app_name
  const getAvatarGradient = (name: string) => {
    const gradients = [
      "from-blue-600/20 to-cyan-600/20 text-cyan-400 border-cyan-500/30",
      "from-purple-600/20 to-indigo-600/20 text-indigo-400 border-indigo-500/30",
      "from-emerald-600/20 to-teal-600/20 text-emerald-400 border-emerald-500/30",
      "from-amber-600/20 to-orange-600/20 text-amber-400 border-amber-500/30",
      "from-rose-600/20 to-pink-600/20 text-rose-400 border-rose-500/30",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const initial = (app.app_name || app.app_id || "A").trim()[0]?.toUpperCase() || "A";
  const avatarStyle = getAvatarGradient(app.app_name);

  return (
    <div
      id={`app-card-${app.app_id}`}
      className={cn(
        "group relative flex items-center justify-between p-4 rounded-2xl border backdrop-blur-xl transition-all duration-200 select-none",
        isAllowed
          ? "bg-zinc-900/40 border-white/[0.08] hover:border-white/[0.15] hover:bg-zinc-900/60 shadow-lg hover:shadow-cyan-500/5"
          : "bg-zinc-950/40 border-rose-500/20 hover:border-rose-500/30 hover:bg-zinc-950/60 shadow-lg"
      )}
    >
      {/* Left: App Identity */}
      <div className="flex items-center gap-3.5 min-w-0 pr-4">
        {/* App Initial / Icon Avatar */}
        <div
          className={cn(
            "flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br border font-bold text-sm shadow-md shrink-0",
            avatarStyle
          )}
        >
          {initial}
        </div>

        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-zinc-100 truncate tracking-tight group-hover:text-white transition-colors">
              {app.app_name}
            </h3>
            {/* Status indicator tag */}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-semibold border shrink-0",
                isAllowed
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/25 text-rose-400"
              )}
            >
              {isAllowed ? (
                <>
                  <ShieldCheck className="w-2.5 h-2.5" />
                  <span>Allowed</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-2.5 h-2.5" />
                  <span>Restricted</span>
                </>
              )}
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-mono flex items-center gap-1.5 truncate">
            <AppWindow className="w-3 h-3 text-zinc-500 shrink-0" />
            <span className="truncate">{app.app_id}</span>
          </p>
        </div>
      </div>

      {/* Right: Permission Toggle Switch */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          id={`toggle-perm-${app.app_id}`}
          role="switch"
          aria-checked={isAllowed}
          onClick={() => onTogglePermission(app.app_id, isAllowed)}
          disabled={isUpdating}
          className={cn(
            "group/btn relative flex items-center justify-between gap-2.5 h-9 px-3 rounded-xl border transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 select-none",
            isUpdating && "opacity-60 cursor-not-allowed",
            isAllowed
              ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/25 hover:border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] focus-visible:ring-emerald-400"
              : "bg-zinc-850 border-white/[0.08] text-zinc-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-rose-400"
          )}
          title={
            isAllowed
              ? "Capture permission enabled. Click to restrict this application."
              : "Capture permission restricted. Click to allow this application."
          }
        >
          <span className="text-xs font-semibold tracking-wide hidden sm:inline-block">
            {isAllowed ? "Capture Allowed" : "Capture Blocked"}
          </span>

          {/* Toggle pill */}
          <div
            className={cn(
              "relative w-8 h-4.5 rounded-full transition-colors duration-200 p-0.5",
              isAllowed ? "bg-emerald-500" : "bg-zinc-700/80"
            )}
          >
            <div
              className={cn(
                "w-3.5 h-3.5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-out flex items-center justify-center",
                isAllowed ? "translate-x-3.5" : "translate-x-0"
              )}
            >
              {isUpdating && <Loader2 className="w-2 h-2 animate-spin text-zinc-900" />}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};
