import { useState, useEffect, useRef, type FC, type ChangeEvent, type KeyboardEvent } from "react";
import {
  Timer,
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Zap,
  Activity,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

interface CaptureIntervalCardProps {
  intervalSecs: number;
  onUpdateInterval: (newInterval: number) => Promise<void>;
  isCapturing: boolean;
}

interface PresetOption {
  label: string;
  secs: number;
  sublabel: string;
}

export const MIN_INTERVAL_SECS = 1;
export const MAX_INTERVAL_SECS = 3600;

const PRESET_OPTIONS: PresetOption[] = [
  { label: "5s", secs: 5, sublabel: "High Freq" },
  { label: "10s", secs: 10, sublabel: "Default" },
  { label: "30s", secs: 30, sublabel: "Standard" },
  { label: "60s", secs: 60, sublabel: "1 Minute" },
  { label: "300s", secs: 300, sublabel: "5 Minutes" },
  { label: "1800s", secs: 1800, sublabel: "30 Minutes" },
  { label: "3600s", secs: 3600, sublabel: "1 Hour (Max)" },
];

export const CaptureIntervalCard: FC<CaptureIntervalCardProps> = ({
  intervalSecs,
  onUpdateInterval,
  isCapturing,
}) => {
  const [draft, setDraft] = useState<number>(intervalSecs || 10);
  const [inputVal, setInputVal] = useState<string>(String(intervalSecs || 10));
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (intervalSecs && intervalSecs >= MIN_INTERVAL_SECS) {
      const valid = Math.min(MAX_INTERVAL_SECS, Math.max(MIN_INTERVAL_SECS, intervalSecs));
      setDraft(valid);
      setInputVal(String(valid));
    }
  }, [intervalSecs]);

  const hasChanges = draft !== intervalSecs;

  const handleApplyPreset = (secs: number) => {
    const clamped = Math.min(MAX_INTERVAL_SECS, Math.max(MIN_INTERVAL_SECS, secs));
    setDraft(clamped);
    setInputVal(String(clamped));
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");

    if (raw === "") {
      setInputVal(String(MIN_INTERVAL_SECS));
      setDraft(MIN_INTERVAL_SECS);
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
      return;
    }

    const val = parseInt(raw, 10);
    if (isNaN(val) || val < MIN_INTERVAL_SECS) {
      setInputVal(String(MIN_INTERVAL_SECS));
      setDraft(MIN_INTERVAL_SECS);
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
      return;
    }

    if (val > MAX_INTERVAL_SECS) {
      setInputVal(String(MAX_INTERVAL_SECS));
      setDraft(MAX_INTERVAL_SECS);
      return;
    }

    setInputVal(String(val));
    setDraft(val);
  };

  const handleInputBlur = () => {
    if (!inputVal || inputVal.trim() === "") {
      const fallback = Math.min(
        MAX_INTERVAL_SECS,
        Math.max(MIN_INTERVAL_SECS, intervalSecs || 10)
      );
      setDraft(fallback);
      setInputVal(String(fallback));
      return;
    }
    const val = parseInt(inputVal, 10);
    const clamped = Math.min(
      MAX_INTERVAL_SECS,
      Math.max(MIN_INTERVAL_SECS, isNaN(val) ? 10 : val)
    );
    setDraft(clamped);
    setInputVal(String(clamped));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleStep(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      handleStep(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleStep = (delta: number) => {
    const next = Math.min(MAX_INTERVAL_SECS, Math.max(MIN_INTERVAL_SECS, draft + delta));
    setDraft(next);
    setInputVal(String(next));
  };

  const handleReset = () => {
    const fallback = Math.min(
      MAX_INTERVAL_SECS,
      Math.max(MIN_INTERVAL_SECS, intervalSecs || 10)
    );
    setDraft(fallback);
    setInputVal(String(fallback));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (draft < MIN_INTERVAL_SECS || draft > MAX_INTERVAL_SECS) {
      toast.warning(
        `Capture interval must be between ${MIN_INTERVAL_SECS} and ${MAX_INTERVAL_SECS} seconds (up to 1 hour).`,
        { title: "Invalid Interval" }
      );
      return;
    }
    setSaving(true);
    try {
      await onUpdateInterval(draft);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to update capture interval:", err);
      const msg =
        err?.response?.data?.detail?.message ||
        "Failed to update CAPTURE_INTERVAL_SECS in Vault.";
      toast.error(msg, { title: "Interval Update Error" });
    } finally {
      setSaving(false);
    }
  };

  const capturesPerMin = (60 / Math.max(1, draft)).toFixed(1);
  const capturesPerHour = Math.round(3600 / Math.max(1, draft)).toLocaleString();
  const capturesPerDay = Math.round(86400 / Math.max(1, draft)).toLocaleString();

  return (
    <div
      id="card-capture-interval"
      className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6"
    >
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-cyan-500/5 rounded-full blur-[90px] pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Capture Interval
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Vault: CAPTURE_INTERVAL_SECS</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Frequency of automated background silent screenshot captures
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {saveSuccess ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)] animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Saved in Vault</span>
            </span>
          ) : hasChanges ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Unsaved changes</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06]">
              <span>Synchronized ({intervalSecs}s)</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Quick Presets</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              Click to select frequency
            </span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = draft === opt.secs;
              return (
                <button
                  key={opt.secs}
                  type="button"
                  onClick={() => handleApplyPreset(opt.secs)}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border text-center transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 select-none",
                    isSelected
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.18)]"
                      : "bg-zinc-850/60 border-white/[0.06] text-zinc-400 hover:border-white/[0.15] hover:bg-zinc-800/80 hover:text-zinc-200"
                  )}
                >
                  <span className="text-sm font-bold font-mono tracking-tight">
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5">
                    {opt.sublabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label
                htmlFor="input-custom-interval"
                className="text-xs font-semibold text-zinc-200"
              >
                Custom Interval Value (1 - 3600s)
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                every {draft}s {draft >= 60 ? `(${(draft / 60).toFixed(1)}m)` : ""}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Set any custom duration between 1 second and 3600 seconds (up to 1 hour).
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              id="btn-interval-minus"
              onClick={() => handleStep(-1)}
              disabled={draft <= MIN_INTERVAL_SECS}
              className="w-10 h-10 rounded-xl bg-zinc-800/90 border border-white/[0.08] hover:border-white/[0.2] hover:bg-zinc-700/80 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-sm"
              title="Decrease by 1s"
            >
              <Minus className="w-4 h-4" />
            </button>

            <div className="relative w-36">
              <input
                ref={inputRef}
                id="input-custom-interval"
                type="text"
                inputMode="numeric"
                value={inputVal}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onFocus={(e) => e.target.select()}
                onKeyDown={handleKeyDown}
                className="w-full h-10 rounded-xl bg-zinc-950/80 border border-white/[0.12] focus:border-cyan-400 px-3.5 pr-10 text-center text-sm font-bold font-mono text-white outline-none focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
                placeholder="10"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500 pointer-events-none">
                sec
              </span>
            </div>

            <button
              type="button"
              id="btn-interval-plus"
              onClick={() => handleStep(1)}
              disabled={draft >= MAX_INTERVAL_SECS}
              className="w-10 h-10 rounded-xl bg-zinc-800/90 border border-white/[0.08] hover:border-white/[0.2] hover:bg-zinc-700/80 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-sm"
              title="Increase by 1s"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-zinc-400 font-medium">Capture Rate</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                ~{capturesPerMin}{" "}
                <span className="text-[10px] text-zinc-500 font-normal">/ min</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <Timer className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-zinc-400 font-medium">Hourly Volume</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                ~{capturesPerHour}{" "}
                <span className="text-[10px] text-zinc-500 font-normal">shots / hr</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-zinc-400 font-medium">Daily Volume</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                ~{capturesPerDay}{" "}
                <span className="text-[10px] text-zinc-500 font-normal">shots / day</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-950/50 border border-white/[0.05] text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                isCapturing ? "bg-emerald-400 animate-ping" : "bg-zinc-500"
              )}
            />
            <span className="text-zinc-300">
              {isCapturing ? (
                <>
                  <strong className="text-emerald-300">Capturing is Live:</strong>{" "}
                  Operator loop updates immediately on the next tick cycle.
                </>
              ) : (
                <>
                  <strong className="text-zinc-400">Capturing is Stopped:</strong>{" "}
                  This interval will take effect when capturing starts.
                </>
              )}
            </span>
          </div>

          <span className="text-[10px] font-mono text-zinc-500 shrink-0 hidden sm:inline">
            Active: {intervalSecs}s | Draft: {draft}s
          </span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            id="btn-reset-interval"
            onClick={handleReset}
            disabled={!hasChanges || saving}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all select-none outline-none",
              hasChanges && !saving
                ? "border-white/[0.08] bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white cursor-pointer active:scale-95"
                : "border-white/[0.04] bg-zinc-800/40 text-zinc-500 opacity-40 cursor-not-allowed"
            )}
            title={hasChanges ? "Reset back to current Vault value" : "No changes to reset"}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            id="btn-save-interval"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer select-none active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
              hasChanges
                ? "bg-gradient-to-r from-cyan-500 via-cyan-600 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_28px_rgba(6,182,212,0.45)] border border-cyan-400/40"
                : "bg-zinc-800/60 border border-white/[0.06] text-zinc-500 opacity-60 cursor-not-allowed"
            )}
            title={hasChanges ? "Save changes to Vault" : "No changes to save"}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-white" />
                <span>Saving to Vault...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Save to Vault</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

