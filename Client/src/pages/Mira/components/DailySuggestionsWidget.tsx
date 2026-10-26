import { useMemo, type FC } from "react";
import {
  CheckCircle2,
  Circle,
  RotateCw,
  Loader2,
  AlertCircle,
  ListTodo,
} from "lucide-react";

interface DailySuggestionsWidgetProps {
  suggestions: string[];
  previousSuggestions: string[];
  completedIndices: number[];
  onToggleComplete: (index: number) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const DailySuggestionsWidget: FC<DailySuggestionsWidgetProps> = ({
  suggestions,
  previousSuggestions,
  completedIndices,
  onToggleComplete,
  isRefreshing,
  onRefresh,
}) => {
  const hasCurrentData = Boolean(suggestions && suggestions.length > 0);
  const hasPreviousData = Boolean(previousSuggestions && previousSuggestions.length > 0);

  const activeSuggestions = hasCurrentData ? suggestions : (isRefreshing && hasPreviousData ? previousSuggestions : []);
  const isDisplayingOutdated = !hasCurrentData && isRefreshing && hasPreviousData;

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
            {isDisplayingOutdated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Previous Suggestions
              </span>
            )}
            {isRefreshing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh Daily Suggestions"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-400 w-8 text-right">
              {progressPercent}%
            </span>
          </div>
        )}
      </div>

      {/* Suggestions List */}
      {totalCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-zinc-400 gap-2">
          {isRefreshing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs font-medium text-zinc-300">Formulating today's suggestions...</p>
              <p className="text-[11px] text-zinc-500 max-w-sm">
                Evaluating your past 2 days of work and personal priorities to generate practical recommendations.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-zinc-500" />
              <p className="text-xs font-medium text-zinc-300">No suggestions generated yet</p>
              <p className="text-[11px] text-zinc-500 max-w-sm">
                Click refresh to analyze your current tasks and generate personalized suggestions for today.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1">
          {activeSuggestions.map((text, idx) => {
            const isCompleted = completedSet.has(idx);

            return (
              <div
                key={idx}
                onClick={() => onToggleComplete(idx)}
                className={`group flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
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
