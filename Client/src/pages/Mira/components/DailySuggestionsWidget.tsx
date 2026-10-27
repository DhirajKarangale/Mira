import { useMemo, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  RotateCw,
  Loader2,
  ListTodo,
  Sparkles,
  KeyRound,
  ArrowRight,
} from "lucide-react";

interface DailySuggestionsWidgetProps {
  suggestions: string[];
  previousSuggestions?: string[];
  completedIndices: number[];
  onToggleComplete: (index: number) => void;
  isRefreshing: boolean;
  isLoading?: boolean;
  onRefresh: () => void;
  hasLlmKeys?: boolean;
}

function isDummySuggestion(text: string): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.trim().toLowerCase();
  return (
    t === "" ||
    t === "task a" ||
    t === "task b" ||
    t === "task c" ||
    /^task\s+[a-z0-9]$/i.test(t) ||
    t === "dummy" ||
    t.startsWith("dummy ") ||
    t === "sample task"
  );
}

export const DailySuggestionsWidget: FC<DailySuggestionsWidgetProps> = ({
  suggestions,
  completedIndices,
  onToggleComplete,
  isRefreshing,
  isLoading = false,
  onRefresh,
  hasLlmKeys = true,
}) => {
  const navigate = useNavigate();
  const cleanToday = useMemo(
    () => (suggestions || []).filter((s) => !isDummySuggestion(s)),
    [suggestions]
  );

  const activeSuggestions = cleanToday;
  const isBusy = isRefreshing || isLoading;

  const completedSet = useMemo(() => new Set(completedIndices), [completedIndices]);
  const totalCount = activeSuggestions.length;
  const completedCount = useMemo(() => {
    return activeSuggestions.filter((_, idx) => completedSet.has(idx)).length;
  }, [activeSuggestions, completedSet]);

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      id="mira-daily-suggestions-widget"
      className="flex flex-col h-full p-4 rounded-2xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-cyan-500/20"
    >
      {/* Top Header */}
      <div className="flex flex-col gap-2 pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ListTodo className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Daily Suggestions</span>
                {totalCount > 0 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-cyan-300 border border-zinc-700/60 font-medium">
                    {completedCount} of {totalCount} completed
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!hasLlmKeys && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
                <KeyRound className="w-3 h-3 text-amber-400" />
                <span>LLM Key Required</span>
              </span>
            )}
            {isBusy && hasLlmKeys && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                <span>Fetching Suggestions...</span>
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isBusy || !hasLlmKeys}
              title={
                !hasLlmKeys
                  ? "LLM API key required to generate daily suggestions"
                  : "Refresh Daily Suggestions"
              }
              className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isBusy && hasLlmKeys ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {hasLlmKeys && totalCount > 0 && (
          <div className="flex items-center gap-2.5 mt-1">
            <div className="flex-1 h-2 rounded-full bg-zinc-800 border border-white/[0.06] overflow-hidden p-[1px]">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-medium text-cyan-300 w-9 text-right shrink-0">
              {progressPercent}%
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {!hasLlmKeys ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center gap-3 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-100">
              LLM API Key Required
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              You don't have any LLM API keys configured. MIRA cannot generate daily suggestions without an active LLM provider. Please add your LLM keys first.
            </p>
          </div>
          <button
            type="button"
            id="btn-add-llm-keys-suggestions"
            onClick={() => navigate("/configurations/ai-config")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20 transition-all duration-200 active:scale-95 cursor-pointer mt-1"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Add LLM Keys in AI Config</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : isBusy && totalCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center gap-3 animate-in fade-in duration-300">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-100">
              Loading Daily Suggestions...
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              Fetching today's recommendations and analyzing your recent workspace activity.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-mono mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Connecting to MIRA Engine...</span>
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.15)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-100">
              No Daily Suggestions Yet
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              MIRA analyzes your recent workspace activity, tasks, and routine to generate personalized daily focus recommendations.
            </p>
          </div>
          <button
            type="button"
            id="btn-generate-daily-suggestions"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 active:scale-95 cursor-pointer mt-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate Today's Suggestions</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto mira-scrollbar pr-1.5">
          {activeSuggestions.map((text, idx) => {
            const isCompleted = completedSet.has(idx);

            return (
              <div
                key={idx}
                onClick={() => onToggleComplete(idx)}
                className={`group flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none shrink-0 ${
                  isCompleted
                    ? "bg-zinc-900/30 border-emerald-500/20 text-zinc-400"
                    : "bg-zinc-800/30 border-white/[0.05] hover:border-cyan-500/30 hover:bg-zinc-800/60 text-zinc-200"
                }`}
              >
                {/* Custom Checkbox */}
                <button
                  type="button"
                  aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
                  className="shrink-0 mt-0.5 text-zinc-400 group-hover:text-cyan-400 transition-colors"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                  )}
                </button>

                {/* Suggestion Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs sm:text-sm leading-relaxed transition-all duration-200 ${
                      isCompleted ? "line-through text-zinc-500" : "text-zinc-200"
                    }`}
                  >
                    {text}
                  </p>
                </div>

                {isCompleted && (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 self-center">
                    Done
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
