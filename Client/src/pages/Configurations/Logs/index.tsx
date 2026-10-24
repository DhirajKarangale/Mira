import { useState, useMemo, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Terminal, Sliders } from "lucide-react";
import { LogFiltersBar } from "./components/LogFiltersBar";
import { LogList } from "./components/LogList";
import { LogPagination } from "./components/LogPagination";
import { LogConfigCard } from "./components/LogConfigCard";
import { useLogsQuery } from "./queries";
import type { LogFilters } from "./types";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export const LogsPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isConfigView = location.pathname.endsWith("/config");

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [filtersDraft, setFiltersDraft] = useState<LogFilters>({
    search: "",
    startDate: getTodayString(),
    endDate: getTodayString(),
    moduleName: "all",
  });
  const [pageDraft, setPageDraft] = useState<number>(1);

  const debouncedQuery = useDebounce(
    useMemo(
      () => ({
        page: pageDraft,
        search: filtersDraft.search,
        startDate: filtersDraft.startDate,
        endDate: filtersDraft.endDate,
        moduleName: filtersDraft.moduleName,
      }),
      [pageDraft, filtersDraft]
    ),
    300
  );

  const PAGE_LIMIT = 50;

  const {
    data: logsResponse,
    isLoading,
    isFetching,
    refetch,
  } = useLogsQuery(
    {
      search: debouncedQuery.search,
      startDate: debouncedQuery.startDate,
      endDate: debouncedQuery.endDate,
      moduleName: debouncedQuery.moduleName,
    },
    debouncedQuery.page,
    PAGE_LIMIT
  );

  const logs = logsResponse?.logs ?? [];
  const total = logsResponse?.total ?? 0;
  const loading = isLoading || isFetching;

  const isFiltered = useMemo(() => {
    const today = getTodayString();
    return (
      filtersDraft.search.trim() !== "" ||
      filtersDraft.moduleName !== "all" ||
      filtersDraft.startDate !== today ||
      filtersDraft.endDate !== today
    );
  }, [filtersDraft]);

  const handleFilterChange = (partial: Partial<LogFilters>) => {
    setFiltersDraft((prev) => ({ ...prev, ...partial }));
    setPageDraft(1);
  };

  const handleResetFilters = () => {
    const today = getTodayString();
    setFiltersDraft({
      search: "",
      startDate: today,
      endDate: today,
      moduleName: "all",
    });
    setPageDraft(1);
  };

  const handlePageChange = (newPage: number) => {
    setPageDraft(newPage);
  };

  return (
    <div
      id="logs-subpage-container"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40"
    >
      <div className="flex-none px-6 py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Logs
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Vault Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Aggregated system telemetry, audit trail, module routing, and retention configurations
              </p>
            </div>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner">
            <button
              type="button"
              id="tab-btn-logs-viewer"
              onClick={() => navigate("/configurations/logs")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                !isConfigView
                  ? "bg-amber-600 text-white shadow-sm font-semibold shadow-amber-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              )}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Log Viewer</span>
              {total > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/20 text-white">
                  {total}
                </span>
              )}
            </button>

            <button
              type="button"
              id="tab-btn-logs-config"
              onClick={() => navigate("/configurations/logs/config")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                isConfigView
                  ? "bg-amber-600 text-white shadow-sm font-semibold shadow-amber-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              )}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Log Configurations</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {isConfigView ? (
            <LogConfigCard onSaved={() => refetch()} />
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl">
              <LogFiltersBar
                filters={filtersDraft}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                onRefresh={() => refetch()}
                isFiltered={isFiltered}
                loading={loading}
              />

              {loading && logs.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-1 px-4 bg-amber-950/20 border-b border-amber-500/10 text-amber-300 text-[11px] font-mono shrink-0 animate-in fade-in duration-150">
                  <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                  <span>Updating logs from Vault...</span>
                </div>
              )}

              <LogList logs={logs} loading={loading} />

              <LogPagination
                page={pageDraft}
                total={total}
                limit={PAGE_LIMIT}
                onPageChange={handlePageChange}
                loading={loading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogsPage;
