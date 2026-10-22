import { useState, useMemo, type FC } from "react";
import {
  Layers,
  Trash2,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Flame,
  Radio,
  Clock,
  ShieldAlert,
} from "lucide-react";
import {
  useDeleteConsumerGroupMutation,
  useCleanPendingMessagesMutation,
  useFormatRedisMutation,
} from "../queries";
import { ConfirmModal } from "./ConfirmModal";
import type { ConsumerGroup, CleanResult, FormatResult } from "../types";
import { useRefreshAnimation } from "@/hooks/useRefreshAnimation";
import { cn } from "@/lib/utils";

interface ConsumerGroupsCardProps {
  groups: ConsumerGroup[];
  loading: boolean;
  onRefresh: () => Promise<unknown> | void;
}

export const ConsumerGroupsCard: FC<ConsumerGroupsCardProps> = ({
  groups,
  loading,
  onRefresh,
}) => {
  const { isRefreshing, handleRefresh } = useRefreshAnimation(onRefresh, { minDurationMs: 650 });
  const isBusy = loading || isRefreshing;
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

  const deleteMutation = useDeleteConsumerGroupMutation();
  const cleanMutation = useCleanPendingMessagesMutation();
  const formatMutation = useFormatRedisMutation();

  const actionLoading =
    deleteMutation.isPending || cleanMutation.isPending || formatMutation.isPending;

  const [deleteTarget, setDeleteTarget] = useState<ConsumerGroup | null>(null);
  const [cleanTarget, setCleanTarget] = useState<ConsumerGroup | null>(null);
  const [isCleanAllOpen, setIsCleanAllOpen] = useState(false);
  const [isFormatOpen, setIsFormatOpen] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    return groups.filter(
      (g) =>
        g.group_name.toLowerCase().includes(q) ||
        g.stream_name.toLowerCase().includes(q) ||
        g.consumer_key.toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  const totalPending = useMemo(
    () => groups.reduce((acc, g) => acc + (g.pending_messages_count || 0), 0),
    [groups]
  );

  const totalActive = useMemo(
    () => groups.reduce((acc, g) => acc + (g.active_messages_count || 0), 0),
    [groups]
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedGroup(text);
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await deleteMutation.mutateAsync({
        groupName: deleteTarget.group_name,
        streamName: deleteTarget.stream_name,
      });
      showFeedback("success", res.message || `Deleted consumer group ${deleteTarget.group_name}`);
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete failed:", err);
      showFeedback(
        "error",
        err?.response?.data?.detail?.message || `Failed to delete ${deleteTarget.group_name}`
      );
    }
  };

  const handleConfirmCleanSingle = async () => {
    if (!cleanTarget) return;
    try {
      const res: CleanResult = await cleanMutation.mutateAsync({
        groupName: cleanTarget.group_name,
        streamName: cleanTarget.stream_name,
      });
      showFeedback(
        "success",
        res.message || `Cleaned pending messages for ${cleanTarget.group_name}`
      );
      setCleanTarget(null);
    } catch (err: any) {
      console.error("Clean failed:", err);
      showFeedback(
        "error",
        err?.response?.data?.detail?.message || `Failed to clean ${cleanTarget.group_name}`
      );
    }
  };

  const handleConfirmCleanAll = async () => {
    try {
      const res: CleanResult = await cleanMutation.mutateAsync({});
      showFeedback(
        "success",
        res.message || "Cleaned pending and unprocessed messages across all consumer groups."
      );
      setIsCleanAllOpen(false);
    } catch (err: any) {
      console.error("Clean all failed:", err);
      showFeedback(
        "error",
        err?.response?.data?.detail?.message || "Failed to clean all pending messages."
      );
    }
  };

  const handleConfirmFormat = async () => {
    try {
      const res: FormatResult = await formatMutation.mutateAsync();
      showFeedback(
        "success",
        res.message || "All Redis streams and related data have been cleared successfully."
      );
      setIsFormatOpen(false);
    } catch (err: any) {
      console.error("Format Redis failed:", err);
      showFeedback(
        "error",
        err?.response?.data?.detail?.message || "Failed to format Redis streams."
      );
    }
  };

  return (
    <div className="w-full space-y-5">
      {feedback && (
        <div
          className={cn(
            "flex items-center gap-3 p-3.5 rounded-xl border text-sm animate-in fade-in slide-in-from-top-1 duration-200",
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              : "bg-red-500/10 border-red-500/30 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className="flex-1 font-medium">{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 backdrop-blur-sm p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Consumer Groups</span>
            <Layers className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{groups.length}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Configured in Message Broker</div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 backdrop-blur-sm p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Messages</span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-300 tracking-tight">{totalActive}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Across all Redis stream entries</div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 backdrop-blur-sm p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Messages</span>
            <Flame className={cn("w-4 h-4", totalPending > 0 ? "text-amber-400" : "text-zinc-500")} />
          </div>
          <div
            className={cn(
              "text-2xl font-bold tracking-tight",
              totalPending > 0 ? "text-amber-400" : "text-zinc-300"
            )}
          >
            {totalPending}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">Awaiting consumer acknowledgment</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-md">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search consumer groups or streams..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-zinc-950/70 border border-white/[0.1] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <button
            type="button"
            id="btn-refresh-consumer-groups"
            onClick={handleRefresh}
            disabled={isBusy || actionLoading}
            className={cn(
              "flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium border transition-colors outline-none",
              isBusy || actionLoading
                ? "bg-white/[0.02] border-white/[0.05] text-zinc-500 cursor-not-allowed opacity-60"
                : "text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:text-white cursor-pointer"
            )}
            title={isBusy ? "Refreshing consumer groups..." : "Refresh consumer groups"}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isBusy && "animate-spin text-cyan-400")} />
            <span>{isBusy ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCleanAllOpen(true)}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-[0_0_12px_rgba(245,158,11,0.1)]"
            title="Clean pending or unprocessed messages"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Clean All Pending
          </button>

          <button
            type="button"
            onClick={() => setIsFormatOpen(true)}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-[0_0_12px_rgba(239,68,68,0.1)]"
            title="Clear all Redis streams and related data"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Format Redis
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-md overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-zinc-400 font-semibold tracking-wider uppercase text-[11px]">
                <th className="py-3 px-4">Consumer Group</th>
                <th className="py-3 px-4">Stream Name</th>
                <th className="py-3 px-3 text-center">Active Messages</th>
                <th className="py-3 px-3 text-center">Pending Messages</th>
                <th className="py-3 px-4">Last Delivered ID</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading && groups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-500" />
                    Loading consumer groups...
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    {searchQuery
                      ? "No consumer groups match your search criteria."
                      : "No Redis consumer groups found."}
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => {
                  const hasPending = (group.pending_messages_count || 0) > 0;
                  const hasActive = (group.active_messages_count || 0) > 0;

                  return (
                    <tr
                      key={`${group.stream_name}-${group.group_name}`}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100 group-hover:text-red-400 transition-colors">
                            {group.group_name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(group.group_name)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                            title="Copy group name"
                          >
                            {copiedGroup === group.group_name ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          Key: <span className="text-zinc-400">{group.consumer_key}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-zinc-300">
                          {group.stream_name}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full font-mono text-xs font-semibold",
                            hasActive
                              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                              : "bg-white/[0.04] text-zinc-500"
                          )}
                        >
                          {group.active_messages_count ?? 0}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full font-mono text-xs font-semibold",
                            hasPending
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-pulse"
                              : "bg-white/[0.04] text-zinc-500"
                          )}
                        >
                          {group.pending_messages_count ?? 0}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                        <span className="text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-600" />
                          {group.last_delivered_id || "0-0"}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCleanTarget(group)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            title="Clean pending or unprocessed messages for this group"
                          >
                            <Sparkles className="w-3 h-3" />
                            Clean
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(group)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            title="Delete this consumer group"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Consumer Group"
        description={
          <div>
            Are you sure you want to delete the consumer group{" "}
            <span className="font-mono font-semibold text-white">
              {deleteTarget?.group_name}
            </span>{" "}
            from stream{" "}
            <span className="font-mono text-zinc-300">
              {deleteTarget?.stream_name}
            </span>
            ? This will destroy the group and its pending message states.
          </div>
        }
        confirmText="Delete Group"
        variant="danger"
        isLoading={actionLoading}
      />

      <ConfirmModal
        isOpen={Boolean(cleanTarget)}
        onClose={() => setCleanTarget(null)}
        onConfirm={handleConfirmCleanSingle}
        title="Clean Pending Messages"
        description={
          <div>
            Clean and acknowledge all pending/unprocessed messages for{" "}
            <span className="font-mono font-semibold text-white">
              {cleanTarget?.group_name}
            </span>
            ? Currently{" "}
            <span className="font-semibold text-amber-300">
              {cleanTarget?.pending_messages_count || 0}
            </span>{" "}
            pending message(s) will be cleared.
          </div>
        }
        confirmText="Clean Messages"
        variant="warning"
        isLoading={actionLoading}
      />

      <ConfirmModal
        isOpen={isCleanAllOpen}
        onClose={() => setIsCleanAllOpen(false)}
        onConfirm={handleConfirmCleanAll}
        title="Clean All Consumer Groups"
        description={
          <div>
            This operation will clear and acknowledge all pending and unprocessed messages across{" "}
            <span className="font-semibold text-white">{groups.length}</span> consumer groups.
            Total pending messages:{" "}
            <span className="font-semibold text-amber-300">{totalPending}</span>.
          </div>
        }
        confirmText="Clean All"
        variant="warning"
        isLoading={actionLoading}
      />

      <ConfirmModal
        isOpen={isFormatOpen}
        onClose={() => setIsFormatOpen(false)}
        onConfirm={handleConfirmFormat}
        title="Format Redis Streams & Data"
        description={
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-400 font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>DANGER: This action cannot be undone!</span>
            </div>
            <p>
              This operation executes a complete format of Redis. It will delete all streams,
              hashes, consumer groups, and pending messages, then re-initialize empty streams for
              the configured consumer groups.
            </p>
          </div>
        }
        confirmText="Format Redis"
        variant="danger"
        requiresKeyword="FORMAT"
        isLoading={actionLoading}
      />
    </div>
  );
};
