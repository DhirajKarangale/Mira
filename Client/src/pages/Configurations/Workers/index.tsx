import { useEffect, useRef, type FC } from "react";
import { Sliders, RefreshCw } from "lucide-react";
import {
  useEngineWorkersQuery,
  useUpdateEngineWorkersMutation,
} from "./queries";
import { EngineWorkersCard } from "./components/EngineWorkersCard";
import type { EngineWorkersUpdateRequest } from "@/services";
import { useRefreshAnimation } from "@/hooks/useRefreshAnimation";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

export const WorkersPage: FC = () => {
  const {
    data: engineWorkers,
    isLoading: isEngineLoading,
    isFetching: isEngineFetching,
    refetch: refetchEngineWorkers,
    error: engineError,
  } = useEngineWorkersQuery();

  const updateEngineMutation = useUpdateEngineWorkersMutation();
  const lastErrorRef = useRef<string | null>(null);

  const { isRefreshing, handleRefresh: triggerRefresh } = useRefreshAnimation(
    refetchEngineWorkers,
    { minDurationMs: 650 }
  );

  const queryErrorMessage = engineError
    ? (engineError as any)?.response?.data?.detail?.message ||
      (engineError as Error)?.message ||
      "Could not connect to Vault to fetch worker configuration."
    : null;

  useEffect(() => {
    if (queryErrorMessage && queryErrorMessage !== lastErrorRef.current) {
      lastErrorRef.current = queryErrorMessage;
      toast.error(queryErrorMessage, { title: "Vault Synchronization Error" });
    }
  }, [queryErrorMessage]);

  const handleRefresh = async () => {
    await triggerRefresh();
    toast.info("Synchronized latest worker configuration from Vault.", {
      title: "Vault Status",
    });
  };

  const handleSaveEngineWorkers = async (updates: EngineWorkersUpdateRequest) => {
    await updateEngineMutation.mutateAsync(updates);
    toast.success("Engine worker concurrency updated successfully in Vault.", {
      title: "Worker Configuration",
    });
  };

  const isBusy = isEngineLoading || isEngineFetching || isRefreshing;

  return (
    <div
      id="configurations-subpage-workers"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="flex-none px-6 py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/25 text-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Workers
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  Vault Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Engine worker concurrency, background task pools, and polling intervals for inference, summarization, and vector embeddings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner">
              <div
                id="tab-indicator-workers"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white shadow-sm shadow-violet-950/60"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Worker Concurrency</span>
              </div>
            </div>

            <button
              type="button"
              id="btn-refresh-workers"
              onClick={handleRefresh}
              disabled={isBusy}
              title={isBusy ? "Refreshing workers configuration..." : "Refresh workers configuration from Vault"}
              className="p-2 rounded-xl border border-white/[0.08] bg-zinc-900/80 hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={cn("w-4 h-4", isBusy && "animate-spin text-violet-400")}
              />
            </button>
          </div>
        </div>
      </div>

      <div
        id="workers-subpage-viewport"
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="max-w-7xl mx-auto space-y-6">
          <EngineWorkersCard
            config={engineWorkers}
            isLoading={isEngineLoading && !engineWorkers}
            onSave={handleSaveEngineWorkers}
            disabled={updateEngineMutation.isPending}
          />

          <div className="pt-4 pb-2 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
            <span>MIRA Vault Engine</span>
            <span>•</span>
            <span>Worker Concurrency Manager</span>
            <span>•</span>
            <span>High-Throughput Thread Pools</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkersPage;
