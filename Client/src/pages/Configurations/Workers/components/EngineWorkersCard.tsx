import { useState, useEffect, type FC, type ChangeEvent } from "react";
import {
  Cpu,
  Save,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Sliders,
  Minus,
  Plus,
  Timer,
  ScanText,
  FileText,
  Clock,
  Layers,
  Database,
  MessageSquare,
} from "lucide-react";
import type { EngineWorkersConfig, EngineWorkersUpdateRequest } from "@/services";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

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
  const [chatWorkers, setChatWorkers] = useState<string>("1");
  const [screenshotExtractionWorkers, setScreenshotExtractionWorkers] = useState<string>("1");
  const [screenshotSummarizationWorkers, setScreenshotSummarizationWorkers] = useState<string>("1");
  const [embeddingVectorStoreWorkers, setEmbeddingVectorStoreWorkers] = useState<string>("1");

  const [chatWorkersPollTime, setChatWorkersPollTime] = useState<string>("1");
  const [screenshotExtractionPollTime, setScreenshotExtractionPollTime] = useState<string>("5");
  const [screenshotSummarizationPollTime, setScreenshotSummarizationPollTime] = useState<string>("5");
  const [embeddingVectorStoreWorkersPollTime, setEmbeddingVectorStoreWorkersPollTime] = useState<string>("1");

  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setChatWorkers(String(config.chat_workers ?? (config as any).llm_workers ?? 1));
      setScreenshotExtractionWorkers(String(config.screenshot_extraction_workers ?? 1));
      setScreenshotSummarizationWorkers(String(config.screenshot_summarization_workers ?? 1));
      setEmbeddingVectorStoreWorkers(String(config.embedding_vector_store_workers ?? 1));
      setChatWorkersPollTime(String(config.chat_workers_poll_time ?? 1));
      setScreenshotExtractionPollTime(String(config.screenshot_extraction_poll_time ?? 5));
      setScreenshotSummarizationPollTime(String(config.screenshot_summarization_poll_time ?? 5));
      setEmbeddingVectorStoreWorkersPollTime(String(config.embedding_vector_store_workers_poll_time ?? 1));
    }
  }, [config]);

  const persisted = {
    chat_workers: config?.chat_workers ?? (config as any)?.llm_workers ?? 1,
    screenshot_extraction_workers: config?.screenshot_extraction_workers ?? 1,
    screenshot_summarization_workers: config?.screenshot_summarization_workers ?? 1,
    embedding_vector_store_workers: config?.embedding_vector_store_workers ?? 1,
    chat_workers_poll_time: config?.chat_workers_poll_time ?? 1,
    screenshot_extraction_poll_time: config?.screenshot_extraction_poll_time ?? 5,
    screenshot_summarization_poll_time: config?.screenshot_summarization_poll_time ?? 5,
    embedding_vector_store_workers_poll_time: config?.embedding_vector_store_workers_poll_time ?? 1,
  };

  const currentValues = {
    chat_workers: parseInt(chatWorkers, 10),
    screenshot_extraction_workers: parseInt(screenshotExtractionWorkers, 10),
    screenshot_summarization_workers: parseInt(screenshotSummarizationWorkers, 10),
    embedding_vector_store_workers: parseInt(embeddingVectorStoreWorkers, 10),
    chat_workers_poll_time: parseFloat(chatWorkersPollTime),
    screenshot_extraction_poll_time: parseFloat(screenshotExtractionPollTime),
    screenshot_summarization_poll_time: parseFloat(screenshotSummarizationPollTime),
    embedding_vector_store_workers_poll_time: parseFloat(embeddingVectorStoreWorkersPollTime),
  };

  const hasChanges =
    !isNaN(currentValues.chat_workers) &&
    !isNaN(currentValues.screenshot_extraction_workers) &&
    !isNaN(currentValues.screenshot_summarization_workers) &&
    !isNaN(currentValues.embedding_vector_store_workers) &&
    !isNaN(currentValues.chat_workers_poll_time) &&
    !isNaN(currentValues.screenshot_extraction_poll_time) &&
    !isNaN(currentValues.screenshot_summarization_poll_time) &&
    !isNaN(currentValues.embedding_vector_store_workers_poll_time) &&
    (currentValues.chat_workers !== persisted.chat_workers ||
      currentValues.screenshot_extraction_workers !== persisted.screenshot_extraction_workers ||
      currentValues.screenshot_summarization_workers !== persisted.screenshot_summarization_workers ||
      currentValues.embedding_vector_store_workers !== persisted.embedding_vector_store_workers ||
      Math.abs(currentValues.chat_workers_poll_time - persisted.chat_workers_poll_time) > 0.001 ||
      Math.abs(currentValues.screenshot_extraction_poll_time - persisted.screenshot_extraction_poll_time) > 0.001 ||
      Math.abs(currentValues.screenshot_summarization_poll_time - persisted.screenshot_summarization_poll_time) > 0.001 ||
      Math.abs(currentValues.embedding_vector_store_workers_poll_time - persisted.embedding_vector_store_workers_poll_time) > 0.001);

  const validateWorkerCount = (valStr: string, fieldName: string): number | null => {
    const trimmed = valStr.trim();
    if (!trimmed) {
      toast.warning(`${fieldName} cannot be empty.`, { title: "Validation" });
      return null;
    }
    const num = Number(trimmed);
    if (!Number.isInteger(num)) {
      toast.warning(`${fieldName} must be an integer.`, { title: "Validation" });
      return null;
    }
    if (num < 1) {
      toast.warning(`${fieldName} must be an integer of at least 1.`, { title: "Validation" });
      return null;
    }
    if (num > 50) {
      toast.warning(`${fieldName} must be between 1 and 50 inclusive.`, { title: "Validation" });
      return null;
    }
    return num;
  };

  const validatePollTime = (valStr: string, fieldName: string): number | null => {
    const trimmed = valStr.trim();
    if (!trimmed) {
      toast.warning(`${fieldName} cannot be empty.`, { title: "Validation" });
      return null;
    }
    const num = Number(trimmed);
    if (isNaN(num)) {
      toast.warning(`${fieldName} must be a valid number.`, { title: "Validation" });
      return null;
    }
    if (num <= 0) {
      toast.warning(`${fieldName} must be a positive number.`, { title: "Validation" });
      return null;
    }
    if (num > 1800) {
      toast.warning(`${fieldName} must be between 1 and 1800 seconds inclusive.`, { title: "Validation" });
      return null;
    }
    return num;
  };

  const handleSave = async () => {
    const chatW = validateWorkerCount(chatWorkers, "Chat workers");
    if (chatW === null) return;

    const extW = validateWorkerCount(screenshotExtractionWorkers, "Screenshot extraction workers");
    if (extW === null) return;

    const sumW = validateWorkerCount(screenshotSummarizationWorkers, "Screenshot summarization workers");
    if (sumW === null) return;

    const vecW = validateWorkerCount(embeddingVectorStoreWorkers, "Embedding vector store workers");
    if (vecW === null) return;

    const chatPt = validatePollTime(chatWorkersPollTime, "Chat workers poll time");
    if (chatPt === null) return;

    const extPt = validatePollTime(screenshotExtractionPollTime, "Screenshot extraction poll time");
    if (extPt === null) return;

    const sumPt = validatePollTime(screenshotSummarizationPollTime, "Screenshot summarization poll time");
    if (sumPt === null) return;

    const vecPt = validatePollTime(embeddingVectorStoreWorkersPollTime, "Embedding vector store workers poll time");
    if (vecPt === null) return;

    try {
      setIsSaving(true);
      await onSave({
        chat_workers: chatW,
        chat_workers_poll_time: chatPt,
        screenshot_extraction_workers: extW,
        screenshot_summarization_workers: sumW,
        embedding_vector_store_workers: vecW,
        screenshot_extraction_poll_time: extPt,
        screenshot_summarization_poll_time: sumPt,
        embedding_vector_store_workers_poll_time: vecPt,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail?.message ||
        err?.message ||
        "Failed to update engine worker settings in Vault.";
      toast.error(msg, { title: "Vault Save Error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setChatWorkers(String(persisted.chat_workers));
    setScreenshotExtractionWorkers(String(persisted.screenshot_extraction_workers));
    setScreenshotSummarizationWorkers(String(persisted.screenshot_summarization_workers));
    setEmbeddingVectorStoreWorkers(String(persisted.embedding_vector_store_workers));
    setChatWorkersPollTime(String(persisted.chat_workers_poll_time));
    setScreenshotExtractionPollTime(String(persisted.screenshot_extraction_poll_time));
    setScreenshotSummarizationPollTime(String(persisted.screenshot_summarization_poll_time));
    setEmbeddingVectorStoreWorkersPollTime(String(persisted.embedding_vector_store_workers_poll_time));
  };

  const adjustWorker = (
    setter: (val: string) => void,
    currentStr: string,
    delta: number
  ) => {
    const parsed = parseInt(currentStr, 10);
    const base = isNaN(parsed) ? 1 : parsed;
    const next = Math.max(1, Math.min(50, base + delta));
    setter(String(next));
  };

  const adjustPollTime = (
    setter: (val: string) => void,
    currentStr: string,
    delta: number
  ) => {
    const parsed = parseFloat(currentStr);
    const base = isNaN(parsed) ? 1 : parsed;
    const next = Math.max(0.1, Math.min(1800, Math.round((base + delta) * 10) / 10));
    setter(String(next));
  };

  const pollPresets = [1, 2, 5, 10, 30];

  return (
    <div
      id="card-engine-workers"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden transition-all text-zinc-100"
    >
      {/* Compact Header Bar */}
      <div className="px-5 py-4 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Engine Workers & Polling Configuration
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                Concurrency & Intervals
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Manage worker concurrency pools (1–50) and execution poll frequencies (&gt;0s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {isLoading && !config && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-mono text-violet-300 bg-violet-500/10 border border-violet-500/20">
              <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
              <span>Syncing with Vault...</span>
            </span>
          )}

          {justSaved && !isSaving && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Synced to Vault</span>
            </span>
          )}

          {hasChanges && !isSaving && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Unsaved Changes
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* SECTION 1: Worker Pools (Concurrency: 1 - 50) */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-semibold text-zinc-200 tracking-wider font-mono uppercase">
                Worker Concurrency Pools
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/10">
              Range: 1 – 50 workers
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Tile 1: Chat Workers */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Chat Workers</h4>
                    <p className="text-[10px] text-zinc-400">LLM chat & inference</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  Engine
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                  <button
                    type="button"
                    id="btn-dec-chat-workers"
                    disabled={disabled || isSaving || currentValues.chat_workers <= 1}
                    onClick={() => adjustWorker(setChatWorkers, chatWorkers, -1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    id="input-chat-workers"
                    min={1}
                    max={50}
                    step={1}
                    disabled={disabled || isSaving || isLoading}
                    value={chatWorkers}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setChatWorkers(e.target.value);
                    }}
                    className="w-10 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    id="btn-inc-chat-workers"
                    disabled={disabled || isSaving || currentValues.chat_workers >= 50}
                    onClick={() => adjustWorker(setChatWorkers, chatWorkers, 1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">workers</span>
              </div>
            </div>

            {/* Tile 2: Screenshot Extraction (Memory) */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <ScanText className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Extraction</h4>
                    <p className="text-[10px] text-zinc-400">OCR & screenshot data</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">
                  Memory
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                  <button
                    type="button"
                    id="btn-dec-extraction-workers"
                    disabled={disabled || isSaving || currentValues.screenshot_extraction_workers <= 1}
                    onClick={() => adjustWorker(setScreenshotExtractionWorkers, screenshotExtractionWorkers, -1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    id="input-extraction-workers"
                    min={1}
                    max={50}
                    step={1}
                    disabled={disabled || isSaving || isLoading}
                    value={screenshotExtractionWorkers}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setScreenshotExtractionWorkers(e.target.value);
                    }}
                    className="w-10 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    id="btn-inc-extraction-workers"
                    disabled={disabled || isSaving || currentValues.screenshot_extraction_workers >= 50}
                    onClick={() => adjustWorker(setScreenshotExtractionWorkers, screenshotExtractionWorkers, 1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">workers</span>
              </div>
            </div>

            {/* Tile 3: Screenshot Summarization (Engine) */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Summarization</h4>
                    <p className="text-[10px] text-zinc-400">Visual data summary</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Engine
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                  <button
                    type="button"
                    id="btn-dec-summarization-workers"
                    disabled={disabled || isSaving || currentValues.screenshot_summarization_workers <= 1}
                    onClick={() => adjustWorker(setScreenshotSummarizationWorkers, screenshotSummarizationWorkers, -1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    id="input-summarization-workers"
                    min={1}
                    max={50}
                    step={1}
                    disabled={disabled || isSaving || isLoading}
                    value={screenshotSummarizationWorkers}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setScreenshotSummarizationWorkers(e.target.value);
                    }}
                    className="w-10 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    id="btn-inc-summarization-workers"
                    disabled={disabled || isSaving || currentValues.screenshot_summarization_workers >= 50}
                    onClick={() => adjustWorker(setScreenshotSummarizationWorkers, screenshotSummarizationWorkers, 1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">workers</span>
              </div>
            </div>

            {/* Tile 4: Embedding Vector Store (Engine) */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Database className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Vector Store</h4>
                    <p className="text-[10px] text-zinc-400">Embedding storage</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  Engine
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                  <button
                    type="button"
                    id="btn-dec-embedding-vector-store-workers"
                    disabled={disabled || isSaving || currentValues.embedding_vector_store_workers <= 1}
                    onClick={() => adjustWorker(setEmbeddingVectorStoreWorkers, embeddingVectorStoreWorkers, -1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    id="input-embedding-vector-store-workers"
                    min={1}
                    max={50}
                    step={1}
                    disabled={disabled || isSaving || isLoading}
                    value={embeddingVectorStoreWorkers}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setEmbeddingVectorStoreWorkers(e.target.value);
                    }}
                    className="w-10 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    id="btn-inc-embedding-vector-store-workers"
                    disabled={disabled || isSaving || currentValues.embedding_vector_store_workers >= 50}
                    onClick={() => adjustWorker(setEmbeddingVectorStoreWorkers, embeddingVectorStoreWorkers, 1)}
                    className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">workers</span>
              </div>
            </div>

          </div>
        </div>

        {/* SECTION 2: Worker Polling Intervals (Seconds) */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-zinc-200 tracking-wider font-mono uppercase">
                Worker Polling Intervals
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/10">
              Units: Seconds (&gt;0s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Poll 1: Chat Workers Poll Time */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Chat Interval</h4>
                    <p className="text-[10px] text-zinc-400">Engine chat queue poll</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  Seconds
                </span>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                    <button
                      type="button"
                      id="btn-dec-chat-poll-time"
                      disabled={disabled || isSaving || currentValues.chat_workers_poll_time <= 0.1}
                      onClick={() => adjustPollTime(setChatWorkersPollTime, chatWorkersPollTime, -1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      id="input-chat-poll-time"
                      min={0.1}
                      max={1800}
                      step={0.5}
                      disabled={disabled || isSaving || isLoading}
                      value={chatWorkersPollTime}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setChatWorkersPollTime(e.target.value);
                      }}
                      className="w-14 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      id="btn-inc-chat-poll-time"
                      disabled={disabled || isSaving || currentValues.chat_workers_poll_time >= 1800}
                      onClick={() => adjustPollTime(setChatWorkersPollTime, chatWorkersPollTime, 1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">sec</span>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {pollPresets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setChatWorkersPollTime(String(p));
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer transition-colors border",
                        currentValues.chat_workers_poll_time === p
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-bold"
                          : "bg-white/[0.03] text-zinc-400 border-white/5 hover:text-white"
                      )}
                    >
                      {p}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Poll 2: Screenshot Extraction Poll Time */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Extraction Interval</h4>
                    <p className="text-[10px] text-zinc-400">Memory queue poll</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">
                  Seconds
                </span>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                    <button
                      type="button"
                      id="btn-dec-extraction-poll-time"
                      disabled={disabled || isSaving || currentValues.screenshot_extraction_poll_time <= 1}
                      onClick={() => adjustPollTime(setScreenshotExtractionPollTime, screenshotExtractionPollTime, -1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      id="input-extraction-poll-time"
                      min={1}
                      max={1800}
                      step={0.5}
                      disabled={disabled || isSaving || isLoading}
                      value={screenshotExtractionPollTime}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setScreenshotExtractionPollTime(e.target.value);
                      }}
                      className="w-14 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      id="btn-inc-extraction-poll-time"
                      disabled={disabled || isSaving || currentValues.screenshot_extraction_poll_time >= 1800}
                      onClick={() => adjustPollTime(setScreenshotExtractionPollTime, screenshotExtractionPollTime, 1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">sec</span>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {pollPresets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setScreenshotExtractionPollTime(String(p));
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer transition-colors border",
                        currentValues.screenshot_extraction_poll_time === p
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/30 font-bold"
                          : "bg-white/[0.03] text-zinc-400 border-white/5 hover:text-white"
                      )}
                    >
                      {p}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Poll 2: Screenshot Summarization Poll Time */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Summarization Interval</h4>
                    <p className="text-[10px] text-zinc-400">Engine queue poll</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Seconds
                </span>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                    <button
                      type="button"
                      id="btn-dec-summarization-poll-time"
                      disabled={disabled || isSaving || currentValues.screenshot_summarization_poll_time <= 1}
                      onClick={() => adjustPollTime(setScreenshotSummarizationPollTime, screenshotSummarizationPollTime, -1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      id="input-summarization-poll-time"
                      min={1}
                      max={1800}
                      step={0.5}
                      disabled={disabled || isSaving || isLoading}
                      value={screenshotSummarizationPollTime}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setScreenshotSummarizationPollTime(e.target.value);
                      }}
                      className="w-14 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      id="btn-inc-summarization-poll-time"
                      disabled={disabled || isSaving || currentValues.screenshot_summarization_poll_time >= 1800}
                      onClick={() => adjustPollTime(setScreenshotSummarizationPollTime, screenshotSummarizationPollTime, 1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">sec</span>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {pollPresets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setScreenshotSummarizationPollTime(String(p));
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer transition-colors border",
                        currentValues.screenshot_summarization_poll_time === p
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold"
                          : "bg-white/[0.03] text-zinc-400 border-white/5 hover:text-white"
                      )}
                    >
                      {p}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Poll 3: Embedding Vector Store Poll Time */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 hover:border-white/15 transition-all flex flex-col justify-between gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white leading-tight">Vector Store Interval</h4>
                    <p className="text-[10px] text-zinc-400">Vector queue poll</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  Seconds
                </span>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded-lg p-0.5">
                    <button
                      type="button"
                      id="btn-dec-embedding-vector-store-poll-time"
                      disabled={disabled || isSaving || currentValues.embedding_vector_store_workers_poll_time <= 0.1}
                      onClick={() => adjustPollTime(setEmbeddingVectorStoreWorkersPollTime, embeddingVectorStoreWorkersPollTime, -1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      id="input-embedding-vector-store-poll-time"
                      min={0.1}
                      max={1800}
                      step={0.5}
                      disabled={disabled || isSaving || isLoading}
                      value={embeddingVectorStoreWorkersPollTime}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setEmbeddingVectorStoreWorkersPollTime(e.target.value);
                      }}
                      className="w-14 text-center font-mono font-bold text-xs bg-transparent text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      id="btn-inc-embedding-vector-store-poll-time"
                      disabled={disabled || isSaving || currentValues.embedding_vector_store_workers_poll_time >= 1800}
                      onClick={() => adjustPollTime(setEmbeddingVectorStoreWorkersPollTime, embeddingVectorStoreWorkersPollTime, 1)}
                      className="w-6 h-6 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">sec</span>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {pollPresets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setEmbeddingVectorStoreWorkersPollTime(String(p));
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer transition-colors border",
                        currentValues.embedding_vector_store_workers_poll_time === p
                          ? "bg-blue-500/20 text-blue-300 border-blue-500/30 font-bold"
                          : "bg-white/[0.03] text-zinc-400 border-white/5 hover:text-white"
                      )}
                    >
                      {p}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3 bg-zinc-950/60 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono flex-wrap">
          <span className="flex items-center gap-1 text-zinc-300">
            <Layers className="w-3 h-3 text-cyan-400" />
            <span>Pools:</span>
          </span>
          <span>{persisted.chat_workers} chat</span>
          <span className="text-zinc-600">/</span>
          <span>{persisted.screenshot_extraction_workers} ext</span>
          <span className="text-zinc-600">/</span>
          <span>{persisted.screenshot_summarization_workers} sum</span>
          <span className="text-zinc-600">/</span>
          <span>{persisted.embedding_vector_store_workers} vec</span>
          <span className="text-zinc-600 hidden sm:inline">|</span>
          <span className="text-zinc-400 hidden sm:inline">Poll:</span>
          <span className="hidden sm:inline">
            {persisted.chat_workers_poll_time}s / {persisted.screenshot_extraction_poll_time}s / {persisted.screenshot_summarization_poll_time}s / {persisted.embedding_vector_store_workers_poll_time}s
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {hasChanges && (
            <button
              type="button"
              id="btn-reset-engine-workers"
              onClick={handleReset}
              disabled={isSaving || disabled}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-white text-xs font-medium transition-all cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            id="btn-save-engine-workers"
            onClick={handleSave}
            disabled={isSaving || disabled || !hasChanges}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 shadow-sm shadow-cyan-950/60 border border-cyan-400/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                <span>Save Workers</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
