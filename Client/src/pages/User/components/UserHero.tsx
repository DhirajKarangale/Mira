import type { FC } from "react";
import { User, ShieldCheck, Database, RefreshCw, Eye, Edit3, PlusCircle } from "lucide-react";
import type { UserPageMode } from "../types";

interface UserHeroProps {
  mode: UserPageMode;
  loading: boolean;
  onRefresh: () => void;
  hasDetails: boolean;
}

export const UserHero: FC<UserHeroProps> = ({
  mode,
  loading,
  onRefresh,
  hasDetails,
}) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-blue-950/20 via-zinc-900/60 to-purple-950/20 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {/* Decorative gradient glow elements */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.2)] shrink-0">
            <User className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                User Details Management
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-500/10 text-blue-300">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Vault Encrypted
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06]">
                <Database className="w-3 h-3 text-zinc-400" />
                table: user_details
              </span>
              {/* Mode indicator badge */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-white/[0.08]">
                {mode === "edit" ? (
                  <>
                    <Edit3 className="w-3 h-3 text-amber-400" />
                    <span>Edit Mode</span>
                  </>
                ) : mode === "add" ? (
                  <>
                    <PlusCircle className="w-3 h-3 text-emerald-400" />
                    <span>Setup Mode</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3 text-blue-400" />
                    <span>{hasDetails ? "Profile Active" : "No Profile"}</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Store, view, and update your personal identity, contact information, and regional coordinates.
              All attributes are securely encrypted and synchronized via MIRA Vault.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
          <button
            type="button"
            id="refresh-user-details-btn"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/[0.08] text-zinc-300 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm active:scale-95"
            title="Reload user details from Vault"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
            <span>Sync with Vault</span>
          </button>
        </div>
      </div>
    </div>
  );
};
