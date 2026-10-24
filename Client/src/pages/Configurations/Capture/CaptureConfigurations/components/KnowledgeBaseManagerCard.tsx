import { useState, useMemo, useRef, useEffect, type FC } from "react";
import {
  Database,
  Calendar,
  ArrowRight,
  Trash2,
  RefreshCw,
  Search,
  FilterX,
  Clock,
  HardDrive,
  Sparkles,
  AlertCircle,
  FileQuestion,
  Layers,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  useKnowledgeBasesQuery,
  useDeleteKnowledgeBaseMutation,
  useOperatorConfigQuery,
  useUpdateOperatorConfigMutation,
} from "../../queries";
import { KB_RETENTION_OPTIONS } from "../../types";
import type { KnowledgeBaseItem } from "@/services/memory.service";
import { KnowledgeBasePagination } from "./KnowledgeBasePagination";
import { DeleteKnowledgeBaseModal } from "./DeleteKnowledgeBaseModal";
import { KnowledgeBaseDateRangePicker } from "./KnowledgeBaseDateRangePicker";
import { toast } from "@/components";
import { cn } from "@/lib/utils";

const formatReadableDate = (dateStr: string) => {
  if (!dateStr) return "N/A";
  try {
    // Handle both YYYY-MM-DD and DD_MM_YYYY
    let d: Date;
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else if (dateStr.includes("_")) {
      const parts = dateStr.split("_");
      d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else {
      d = new Date(dateStr);
    }

    if (isNaN(d.getTime())) return dateStr;

    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const KnowledgeBaseManagerCard: FC = () => {
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(5);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const [targetDeleteKb, setTargetDeleteKb] = useState<KnowledgeBaseItem | null>(null);

  const [isRetentionOpen, setIsRetentionOpen] = useState<boolean>(false);
  const retentionDropdownRef = useRef<HTMLDivElement>(null);

  const { data: operatorConfig, isLoading: configLoading } = useOperatorConfigQuery();
  const updateConfigMutation = useUpdateOperatorConfigMutation();

  const currentRetention = operatorConfig?.KNOWLEDGE_BASE_RETENTION_PERIOD || "Never auto delete";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        retentionDropdownRef.current &&
        !retentionDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRetentionOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsRetentionOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSelectRetention = async (period: string) => {
    setIsRetentionOpen(false);
    try {
      await updateConfigMutation.mutateAsync({
        KNOWLEDGE_BASE_RETENTION_PERIOD: period,
      });
      toast.success(
        period === "Never auto delete"
          ? "Retention policy set: Memories will never be auto-deleted."
          : `Retention policy set: Older Knowledge Bases auto-deleted after ${period}.`,
        { title: "Vault Retention Policy" }
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update retention period in Vault.";
      toast.error(msg, { title: "Configuration Error" });
    }
  };


  const queryParams = useMemo(() => {
    return {
      page,
      limit,
      start_date: startDate.trim() || undefined,
      end_date: endDate.trim() || undefined,
      search: search.trim() || undefined,
    };
  }, [page, limit, startDate, endDate, search]);

  const {
    data: kbData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useKnowledgeBasesQuery(queryParams);

  const deleteMutation = useDeleteKnowledgeBaseMutation();

  const totalKbs = kbData?.total ?? 0;
  const knowledgeBases = kbData?.knowledge_bases ?? [];

  const hasActiveFilters = Boolean(startDate || endDate || search);

  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearch("");
    setPage(1);
  };

  const handleExecuteDelete = async () => {
    if (!targetDeleteKb) return;
    try {
      await deleteMutation.mutateAsync(targetDeleteKb.name);
      toast.success(
        `Knowledge Base '${targetDeleteKb.name}' has been permanently deleted.`,
        { title: "Knowledge Base Deleted" }
      );
      setTargetDeleteKb(null);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to delete Knowledge Base.";
      toast.error(msg, { title: "Deletion Error" });
    }
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      <div className="absolute top-0 right-10 w-80 h-80 bg-cyan-500/5 rounded-full blur-[90px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Knowledge Base Management
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                <Layers className="w-3 h-3" />
                <span>{totalKbs} {totalKbs === 1 ? "Knowledge Base" : "Knowledge Bases"}</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Local Qdrant vector databases, capture intervals, semantic memories, and data retention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {/* Retention Period Dropdown */}
          <div className="relative" ref={retentionDropdownRef}>
            <button
              type="button"
              id="btn-kb-retention-dropdown"
              onClick={() => setIsRetentionOpen((prev) => !prev)}
              disabled={updateConfigMutation.isPending || configLoading}
              title="Configure automatic Knowledge Base retention period"
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer outline-none select-none",
                isRetentionOpen
                  ? "bg-zinc-900 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                  : currentRetention !== "Never auto delete"
                    ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-200 hover:border-cyan-400"
                    : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border-white/[0.08]"
              )}
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-mono text-zinc-400">Retention:</span>
              <span className="font-semibold text-zinc-100">{currentRetention}</span>
              {updateConfigMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 ml-0.5" />
              ) : (
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ml-0.5",
                    isRetentionOpen && "rotate-180 text-cyan-400"
                  )}
                />
              )}
            </button>

            {isRetentionOpen && (
              <div className="absolute top-full right-0 mt-2 z-50 w-[290px] p-2 bg-[#0b101c]/98 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_24px_rgba(6,182,212,0.2)] animate-in fade-in-0 zoom-in-95 duration-150 select-none">
                <div className="px-2.5 py-1.5 mb-1 border-b border-white/[0.08]">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                    Knowledge Base Retention
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Automatically purges expired collections on startup
                  </p>
                </div>

                <div className="space-y-0.5 max-h-[240px] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(6,182,212,0.3)_transparent]">
                  {KB_RETENTION_OPTIONS.map((opt) => {
                    const isSelected = currentRetention === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectRetention(opt.value)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer group",
                          isSelected
                            ? "bg-cyan-950/60 border border-cyan-500/30 text-cyan-200"
                            : "hover:bg-white/[0.06] text-zinc-300 hover:text-white"
                        )}
                      >
                        <div>
                          <p className="text-xs font-semibold">{opt.label}</p>
                          <p className="text-[10px] text-zinc-400 group-hover:text-zinc-300 font-mono">
                            {opt.description}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            id="btn-refresh-knowledge-bases"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Knowledge Bases list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-cyan-400")} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/[0.06] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-inner">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-kb-search"
              placeholder="Filter by name or date..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-zinc-900/90 border border-white/[0.08] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>

          {/* Date Range Filter matching Logs component */}
          <KnowledgeBaseDateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate: s, endDate: e }) => {
              setStartDate(s);
              setEndDate(e);
              setPage(1);
            }}
            disabled={isFetching}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            id="btn-clear-kb-filters"
            onClick={handleResetFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-3 py-2">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-zinc-950/60 border border-white/[0.04] space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="h-4 w-48 bg-zinc-800 rounded-lg" />
                <div className="h-4 w-24 bg-zinc-800 rounded-lg" />
              </div>
              <div className="h-10 w-full bg-zinc-900 rounded-xl" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-sm font-semibold text-white">
            Failed to Load Knowledge Bases
          </h3>
          <p className="text-xs text-rose-200/90 max-w-md mx-auto">
            {(error as Error)?.message || "Could not retrieve Knowledge Bases from the Memory service."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : knowledgeBases.length === 0 ? (
        <div className="p-10 rounded-2xl bg-zinc-950/40 border border-white/[0.06] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/[0.08] text-zinc-500 flex items-center justify-center mx-auto mb-1">
            <FileQuestion className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">
            No Knowledge Bases Found
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            {hasActiveFilters
              ? "No Knowledge Bases match the specified date range or search keyword. Try clearing or expanding your filters."
              : "No Knowledge Bases have been created yet. As screen capture data is extracted and summarized, Knowledge Bases will automatically appear here."}
          </p>
          {hasActiveFilters && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 transition-all cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Clear Date Filters</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {knowledgeBases.map((kb: KnowledgeBaseItem) => {
            const isCurrentMonth = kb.is_current_month || kb.is_active;

            return (
              <div
                key={kb.name}
                className={cn(
                  "p-5 sm:p-6 rounded-2xl border transition-all duration-200 relative overflow-hidden group shadow-md",
                  isCurrentMonth
                    ? "bg-zinc-950/80 border-cyan-500/30 hover:border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.06)]"
                    : "bg-zinc-950/60 border-white/[0.06] hover:border-white/[0.12] hover:bg-zinc-950/80"
                )}
              >
                {/* Background accent */}
                {isCurrentMonth && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                )}

                {/* Top Info Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2 font-mono text-xs sm:text-sm font-bold text-white tracking-tight">
                      <Database className={cn("w-4 h-4", isCurrentMonth ? "text-cyan-400" : "text-zinc-500")} />
                      <span>{kb.name}</span>
                    </div>

                    {isCurrentMonth && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>Active Month</span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>{kb.days_coverage} {kb.days_coverage === 1 ? "Day" : "Days"}</span>
                    </span>

                    {kb.points_count !== undefined && kb.points_count > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        <span>{kb.points_count} Points</span>
                      </span>
                    )}

                    {kb.size_bytes !== undefined && kb.size_bytes > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-white/[0.03] border border-white/[0.06]">
                        <HardDrive className="w-3 h-3 text-zinc-500" />
                        <span>{formatBytes(kb.size_bytes)}</span>
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      id={`btn-delete-kb-${kb.name}`}
                      onClick={() => setTargetDeleteKb(kb)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/25 hover:border-rose-500/40 transition-all cursor-pointer active:scale-95 shadow-sm"
                      title={`Delete Knowledge Base ${kb.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Capture Dates Timeline Banner */}
                <div className="mt-3.5 grid grid-cols-1 md:grid-cols-3 gap-3 items-center text-xs">
                  {/* Start Date */}
                  <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.04] space-y-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                      Capture Start Date
                    </span>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="font-mono font-bold text-white">
                        {kb.start_date_formatted || kb.start_date}
                      </span>
                      <span className="text-zinc-500 text-[11px] font-mono">
                        ({kb.start_date})
                      </span>
                    </div>
                    <p className="text-[11px] text-cyan-300/80 font-medium pt-0.5">
                      {formatReadableDate(kb.start_date_formatted || kb.start_date)}
                    </p>
                  </div>

                  {/* Range Connector */}
                  <div className="hidden md:flex flex-col items-center justify-center text-zinc-600">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 bg-white/[0.02] px-3 py-1 rounded-full border border-white/[0.04] mb-1">
                      <span>Date Range Coverage</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-cyan-500/40">
                      <div className="w-16 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-cyan-500" />
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                  </div>

                  {/* End Date */}
                  <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.04] space-y-0.5 md:text-right">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                      Capture End Date
                    </span>
                    <div className="flex items-center md:justify-end gap-2">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0 md:order-last" />
                      <span className="font-mono font-bold text-white">
                        {kb.end_date_formatted || kb.end_date}
                      </span>
                      <span className="text-zinc-500 text-[11px] font-mono">
                        ({kb.end_date})
                      </span>
                    </div>
                    <p className="text-[11px] text-cyan-300/80 font-medium pt-0.5">
                      {formatReadableDate(kb.end_date_formatted || kb.end_date)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div className="pt-2 rounded-2xl overflow-hidden border border-white/[0.06]">
            <KnowledgeBasePagination
              page={page}
              total={totalKbs}
              limit={limit}
              onPageChange={(newPage) => setPage(newPage)}
              loading={isFetching}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {targetDeleteKb && (
        <DeleteKnowledgeBaseModal
          isOpen={Boolean(targetDeleteKb)}
          kbName={targetDeleteKb.name}
          startDateFormatted={formatReadableDate(targetDeleteKb.start_date_formatted || targetDeleteKb.start_date)}
          endDateFormatted={formatReadableDate(targetDeleteKb.end_date_formatted || targetDeleteKb.end_date)}
          daysCoverage={targetDeleteKb.days_coverage}
          pointsCount={targetDeleteKb.points_count}
          onConfirmDelete={handleExecuteDelete}
          onClose={() => setTargetDeleteKb(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
};

export default KnowledgeBaseManagerCard;
