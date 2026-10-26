import type { FC } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, UserX, ArrowRight, UserCheck, Loader2 } from "lucide-react";
import { useUserDetailsQuery } from "./User/queries";

export const MiraPage: FC = () => {
  const navigate = useNavigate();
  const { data: details, isLoading } = useUserDetailsQuery();

  const hasData = Boolean(
    details?.user_name?.trim() ||
    details?.email?.trim() ||
    details?.phone_number?.trim() ||
    details?.city?.trim() ||
    details?.state?.trim() ||
    details?.country?.trim() ||
    details?.address?.trim()
  );

  return (
    <div
      id="page-content-mira"
      className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden select-none"
    >
      <div className="absolute w-[450px] h-[450px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="flex flex-col items-center gap-5 text-center z-10 px-6 max-w-lg">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.15)] mb-1">
          <Sparkles className="w-8 h-8" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          MIRA
        </h1>

        {isLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono mt-2">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Checking user profile...</span>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center gap-3 p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
              <UserX className="w-4 h-4 text-amber-400 shrink-0" />
              <span>User data not found enter your details in Me tab.</span>
            </div>
            <button
              type="button"
              id="mira-go-to-me-tab-btn"
              onClick={() => navigate("/user")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 active:scale-95 cursor-pointer mt-1"
            >
              <span>Go to Me tab</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 animate-in fade-in duration-300">
            <p className="text-lg font-medium text-zinc-200">
              Welcome back, <span className="text-cyan-300 font-semibold">{details?.user_name || "User"}</span>
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Profile Active</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
