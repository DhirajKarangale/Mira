import { useState, useEffect, type FC, type ChangeEvent } from "react";
import {
  Cpu,
  Sparkles,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  Minus,
  Plus,
} from "lucide-react";
import type { EngineWorkersConfig, EngineWorkersUpdateRequest } from "@/services";
import { cn } from "@/lib/utils";

interface EngineWorkersCardProps {
  config: EngineWorkersConfig | null | undefined;
  isLoading?: boolean;
  onSave: (updates: EngineWorkersUpdateRequest) => Promise<void>;
  disabled?: boolean;
}

export const EngineWorkersCard: FC<EngineWorkersCardProps> = ({
  config,
  isLoading = false,
  onSave,
  disabled = false,
}) => {
  const [embeddingWorkers, setEmbeddingWorkers] = useState<string>("1");
  const [llmWorkers, setLlmWorkers] = useState<string>("1");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setEmbeddingWorkers(String(config.embedding_workers ?? 1));
      setLlmWorkers(String(config.llm_workers ?? 1));
      setValidationError(null);
    }
  }, [config]);

  const persistedEmb = config?.embedding_workers ?? 1;
  const persistedLlm = config?.llm_workers ?? 1;

  const currentEmbNum = parseInt(embeddingWorkers, 10);
  const currentLlmNum = parseInt(llmWorkers, 10);

  const hasChanges =
    !isNaN(currentEmbNum) &&
    !isNaN(currentLlmNum) &&
    (currentEmbNum !== persistedEmb || currentLlmNum !== persistedLlm);

  const validateWorkerValue = (valStr: string, fieldName: string): number | null => {
    const trimmed = valStr.trim();
    if (!trimmed) {
      setValidationError(`${fieldName} cannot be empty.`);
      return null;
    }
    const num = Number(trimmed);
    if (!Number.isInteger(num)) {
      setValidationError(`${fieldName} must be an integer.`);
      return null;
    }
    if (num < 1 || num > 50) {
      setValidationError(`${fieldName} must be between 1 and 50 inclusive.`);
      return null;
    }
    return num;
  };

  const handleSave = async () => {
    setValidationError(null);

    const embNum = validateWorkerValue(embeddingWorkers, "Embedding workers");
    if (embNum === null) return;

    const llmNum = validateWorkerValue(llmWorkers, "LLM workers");
    if (llmNum === null) return;

    try {
      setIsSaving(true);
      await onSave({
        embedding_workers: embNum,
        llm_workers: llmNum,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail?.message ||
        err?.message ||
        "Failed to update worker configuration in Vault.";
      setValidationError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEmbeddingWorkers(String(persistedEmb));
    setLlmWorkers(String(persistedLlm));
    setValidationError(null);
  };

  const adjustValue = (
    setter: (val: string) => void,
    currentStr: string,
    delta: number
  ) => {
    const parsed = parseInt(currentStr, 10);
    const base = isNaN(parsed) ? 1 : parsed;
    const next = Math.max(1, Math.min(50, base + delta));
    setter(String(next));
    setValidationError(null);
  };

  const presets = [1, 2, 4, 8, 16];

  return (
    <div
      id="card-engine-workers"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden transition-all"
    >
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Engine Worker Concurrency
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                1 – 50 Workers
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Tune parallel execution limits for vector embedding generation and LLM inference tasks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {justSaved && !isSaving && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Workers Synced</span>
            </span>
          )}

          {hasChanges && !isSaving && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Unsaved Changes
            </span>
          )}
        </div>
      </div>

      {validationError && (
        <div className="mx-6 mt-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 font-mono flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          id="panel-embedding-workers"
          className="relative rounded-xl border border-white/[0.08] bg-zinc-950/50 p-5 backdrop-blur-md flex flex-col justify-between gap-4 transition-all hover:border-white/15"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                  Embedding Workers
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10">
                Min: 1 · Max: 50
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Concurrent background processes generating vector embeddings from OCR text and screen captures for Qdrant index.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-decrement-embedding"
                disabled={disabled || isSaving || currentEmbNum <= 1}
                onClick={() => adjustValue(setEmbeddingWorkers, embeddingWorkers, -1)}
                title="Decrease embedding workers"
                className="w-10 h-10 rounded-xl border border-white/10 bg-zinc-900/90 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="relative flex-1">
                <input
                  type="number"
                  id="input-embedding-workers"
                  min={1}
                  max={50}
                  step={1}
                  disabled={disabled || isSaving || isLoading}
                  value={embeddingWorkers}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setEmbeddingWorkers(e.target.value);
                    setValidationError(null);
                  }}
                  className="w-full text-center font-mono font-bold text-base sm:text-lg bg-zinc-900/90 border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-2 text-white placeholder-zinc-600 focus:outline-none transition-all"
                />
              </div>

              <button
                type="button"
                id="btn-increment-embedding"
                disabled={disabled || isSaving || currentEmbNum >= 50}
                onClick={() => adjustValue(setEmbeddingWorkers, embeddingWorkers, 1)}
                title="Increase embedding workers"
                className="w-10 h-10 rounded-xl border border-white/10 bg-zinc-900/90 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-zinc-500 font-mono mr-1">Presets:</span>
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  id={`preset-embedding-${preset}`}
                  onClick={() => {
                    setEmbeddingWorkers(String(preset));
                    setValidationError(null);
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer border",
                    currentEmbNum === preset
                      ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 font-bold"
                      : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                  )}
                >
                  {preset} {preset === 1 ? "(Default)" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          id="panel-llm-workers"
          className="relative rounded-xl border border-white/[0.08] bg-zinc-950/50 p-5 backdrop-blur-md flex flex-col justify-between gap-4 transition-all hover:border-white/15"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                  LLM Workers
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10">
                Min: 1 · Max: 50
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Concurrent worker threads executing LangChain/LangGraph agent reasoning pipelines, tool queries, and prompt synthesis.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-decrement-llm"
                disabled={disabled || isSaving || currentLlmNum <= 1}
                onClick={() => adjustValue(setLlmWorkers, llmWorkers, -1)}
                title="Decrease LLM workers"
                className="w-10 h-10 rounded-xl border border-white/10 bg-zinc-900/90 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="relative flex-1">
                <input
                  type="number"
                  id="input-llm-workers"
                  min={1}
                  max={50}
                  step={1}
                  disabled={disabled || isSaving || isLoading}
                  value={llmWorkers}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setLlmWorkers(e.target.value);
                    setValidationError(null);
                  }}
                  className="w-full text-center font-mono font-bold text-base sm:text-lg bg-zinc-900/90 border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-2 text-white placeholder-zinc-600 focus:outline-none transition-all"
                />
              </div>

              <button
                type="button"
                id="btn-increment-llm"
                disabled={disabled || isSaving || currentLlmNum >= 50}
                onClick={() => adjustValue(setLlmWorkers, llmWorkers, 1)}
                title="Increase LLM workers"
                className="w-10 h-10 rounded-xl border border-white/10 bg-zinc-900/90 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-zinc-500 font-mono mr-1">Presets:</span>
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  id={`preset-llm-${preset}`}
                  onClick={() => {
                    setLlmWorkers(String(preset));
                    setValidationError(null);
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer border",
                    currentLlmNum === preset
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-bold"
                      : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                  )}
                >
                  {preset} {preset === 1 ? "(Default)" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-zinc-950/60 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-zinc-400 font-mono">
          <span>Active in Vault: </span>
          <span className="text-white font-semibold">{persistedEmb} Embedding</span>
          <span className="text-zinc-500"> / </span>
          <span className="text-white font-semibold">{persistedLlm} LLM</span>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {hasChanges && (
            <button
              type="button"
              id="btn-reset-engine-workers"
              onClick={handleReset}
              disabled={isSaving || disabled}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-white text-xs font-medium transition-all cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            id="btn-save-engine-workers"
            onClick={handleSave}
            disabled={isSaving || disabled || !hasChanges}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 shadow-sm shadow-cyan-950/60 border border-cyan-400/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving to Vault...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Worker Settings</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
