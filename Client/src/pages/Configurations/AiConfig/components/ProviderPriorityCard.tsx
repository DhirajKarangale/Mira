import { useState, useEffect, type FC, type DragEvent } from "react";
import {
  ListOrdered,
  GripVertical,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Loader2,
  Zap,
  Sparkles,
  Cpu,
} from "lucide-react";
import { getProviderMeta } from "../types";
import type { AIConfig } from "@/services";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

interface ProviderPriorityCardProps {
  providers: string[];
  priorities: string[];
  configsMap: Record<string, AIConfig>;
  onSavePriorities: (newPriorities: string[]) => Promise<void>;
  onSelectProvider: (provider: string) => void;
  activeProvider?: string;
  disabled?: boolean;
}

export const ProviderPriorityCard: FC<ProviderPriorityCardProps> = ({
  providers,
  priorities,
  configsMap,
  onSavePriorities,
  onSelectProvider,
  activeProvider = "",
  disabled = false,
}) => {
  const [orderedProviders, setOrderedProviders] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const canonicalMap = new Map(providers.map((p) => [p.toLowerCase(), p]));
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const p of priorities) {
      const lower = p.toLowerCase();
      if (canonicalMap.has(lower) && !seen.has(lower)) {
        merged.push(canonicalMap.get(lower)!);
        seen.add(lower);
      }
    }

    for (const p of providers) {
      const lower = p.toLowerCase();
      if (!seen.has(lower)) {
        merged.push(p);
        seen.add(lower);
      }
    }

    setOrderedProviders(merged);
  }, [priorities, providers]);

  const getProviderIcon = (providerName: string) => {
    const lower = providerName.toLowerCase();
    if (lower === "groq") return Zap;
    if (lower === "gemini") return Sparkles;
    return Cpu;
  };

  const executeReorder = async (newOrder: string[]) => {
    const currentSet = new Set(providers.map((p) => p.toLowerCase()));
    const newSet = new Set(newOrder.map((p) => p.toLowerCase()));

    if (
      newOrder.length !== providers.length ||
      newSet.size !== currentSet.size ||
      [...currentSet].some((p) => !newSet.has(p))
    ) {
      toast.warning("Reordering must preserve all configured providers without addition or removal.", {
        title: "Priority Ordering",
      });
      return;
    }

    setOrderedProviders(newOrder);

    try {
      setIsSaving(true);
      await onSavePriorities(newOrder);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || "Failed to update priorities.";
      toast.error(msg, { title: "Priority Update Error" });
    } finally {
      setIsSaving(false);
    }
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= orderedProviders.length || fromIndex === toIndex) {
      return;
    }
    const updated = [...orderedProviders];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    executeReorder(updated);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (disabled || isSaving) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = (_e: DragEvent<HTMLDivElement>, index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    moveItem(draggedIndex, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      id="card-provider-priority"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden transition-all"
    >
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white tracking-tight">
                LLM Provider Priority & Failover Sequence
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                Drag to Reorder
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Drag items or use arrow controls to define automated provider execution order and fallback failover
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {isSaving && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving Order...</span>
            </span>
          )}

          {justSaved && !isSaving && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Priority Synced</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-3">
        <div className="space-y-2.5">
          {orderedProviders.map((provider, index) => {
            const meta = getProviderMeta(provider);
            const Icon = getProviderIcon(provider);
            const config = configsMap[provider.toLowerCase()];
            const keyCount = config?.total_keys ?? config?.keys?.length ?? 0;
            const isSelected = Boolean(activeProvider && activeProvider.toLowerCase() === provider.toLowerCase());
            const isDragging = draggedIndex === index;
            const isOver = dragOverIndex === index;

            const isPrimary = index === 0;
            const isSecondary = index === 1;

            return (
              <div
                key={provider}
                draggable={!disabled && !isSaving}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={(e) => handleDragLeave(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all duration-150 backdrop-blur-md select-none",
                  isDragging
                    ? "opacity-40 border-dashed border-cyan-400 bg-zinc-900/80 scale-[0.99]"
                    : isOver
                    ? "border-cyan-400 bg-cyan-950/30 scale-[1.01] shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                    : isSelected
                    ? "border-white/20 bg-zinc-950/70 shadow-md"
                    : "border-white/[0.08] bg-zinc-950/40 hover:border-white/15 hover:bg-zinc-950/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    title="Drag to change priority sequence"
                    className="p-1 rounded text-zinc-500 hover:text-zinc-200 cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>

                  <div
                    className={cn(
                      "flex items-center justify-center min-w-8 h-8 px-2 rounded-lg text-xs font-mono font-bold shrink-0 border",
                      isPrimary
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                        : isSecondary
                        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                        : "bg-white/[0.04] text-zinc-400 border-white/10"
                    )}
                  >
                    #{index + 1}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-lg text-zinc-300 border border-white/10",
                        isPrimary ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" : "bg-white/[0.03]"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                          {meta.name}
                        </span>

                        {isPrimary && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Primary Execution
                          </span>
                        )}

                        {isSecondary && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                            Secondary Fallback
                          </span>
                        )}

                        {index > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-white/[0.04] border border-white/10">
                            Fallback #{index + 1}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {keyCount} {keyCount === 1 ? "key configured" : "keys configured"}
                        {keyCount === 0 && (
                          <span className="text-amber-400 ml-1.5">(No active key)</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <div className="flex items-center rounded-lg border border-white/10 bg-zinc-900/80 p-0.5 shadow-inner">
                    <button
                      type="button"
                      disabled={disabled || isSaving || index === 0}
                      onClick={() => moveItem(index, index - 1)}
                      title="Move higher in priority"
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={disabled || isSaving || index === orderedProviders.length - 1}
                      onClick={() => moveItem(index, index + 1)}
                      title="Move lower in priority"
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectProvider(provider)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border",
                      isSelected
                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-semibold shadow-sm"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                    )}
                  >
                    <span>{isSelected ? "Managing Keys" : "Configure Keys"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-zinc-500 pt-1 font-mono">
          Tip: You can drag and drop any provider card, or click the up/down arrows to reorder. The updated priority sequence is instantly synchronized and saved in Vault.
        </p>
      </div>
    </div>
  );
};
