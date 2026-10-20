import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import { Terminal, Sliders } from "lucide-react";
import { LogFiltersBar } from "./components/LogFiltersBar";
import { LogList } from "./components/LogList";
import { LogPagination } from "./components/LogPagination";
import { LogConfigCard } from "./components/LogConfigCard";
import { fetchLogs } from "./api";
import type { LogEntry, LogFilters } from "./types";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

type LogsSubView = "logs" | "config";

export const LogsPage: FC = () => {
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [activeView, setActiveView] = useState<LogsSubView>("logs");

  // All filters (search text, module, and date range) stored in filtersDraft
  const [filtersDraft, setFiltersDraft] = useState<LogFilters>({
    search: "",
    startDate: getTodayString(),
    endDate: getTodayString(),
    moduleName: "all",
  });

  // Debounce all filter changes together (350ms)
  const debouncedFilters = useDebounce(filtersDraft, 350);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  // Request counter to cancel stale in-flight responses and prevent race conditions
  const requestIdRef = useRef<number>(0);

  const PAGE_LIMIT = 50;

  // Check if current draft filters differ from defaults (controls filter button dot immediately)
  const isFiltered = useMemo(() => {
    const today = getTodayString();
    return (
      filtersDraft.search.trim() !== "" ||
      filtersDraft.moduleName !== "all" ||
      filtersDraft.startDate !== today ||
      filtersDraft.endDate !== today
    );
  }, [filtersDraft]);

  const loadLogs = useCallback(
    async (currentPage: number, activeFilters: LogFilters) => {
      if (!activeFilters.startDate || !activeFilters.endDate) {
        return;
      }

      const currentReqId = ++requestIdRef.current;
      setLoading(true);

      try {
        const data = await fetchLogs(activeFilters, currentPage, PAGE_LIMIT);
        // Only commit if this is still the most recent request
        if (currentReqId === requestIdRef.current) {
          setLogs(data.logs);
          setTotal(data.total);
        }
      } catch (err: any) {
        if (currentReqId === requestIdRef.current) {
          console.error("[Vault] Failed to retrieve logs:", err);
          setLogs([]);
          setTotal(0);
        }
      } finally {
        if (currentReqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  // Trigger load when debounced filters or page change
  useEffect(() => {
    if (activeView === "logs") {
      loadLogs(page, debouncedFilters);
    }
  }, [activeView, page, debouncedFilters, loadLogs]);

  const handleFilterChange = (partial: Partial<LogFilters>) => {
    setFiltersDraft((prev) => ({ ...prev, ...partial }));
    setPage(1);
  };

  const handleResetFilters = () => {
    const today = getTodayString();
    const defaultFilters: LogFilters = {
      search: "",
      startDate: today,
      endDate: today,
      moduleName: "all",
    };
    setFiltersDraft(defaultFilters);
    setPage(1);
    loadLogs(1, defaultFilters);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div
      id="logs-subpage-container"
      className="flex flex-col h-full w-full overflow-hidden bg-[#080c14] select-none"
    >
      {/* Subpage Header with Navigation Tabs */}
      <div className="flex items-center justify-between h-11 px-4 border-b border-white/[0.08] bg-zinc-950/90 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-wider text-zinc-100 uppercase">
            Logs
          </span>
          <span className="text-[10px] text-zinc-400 font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
            Vault Engine
          </span>
        </div>

        {/* View Switcher: Live Logs vs Config */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-900 border border-white/10 text-xs">
          <button
            type="button"
            id="tab-btn-logs-viewer"
            onClick={() => setActiveView("logs")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-medium cursor-pointer outline-none",
              activeView === "logs"
                ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Log Viewer</span>
            {total > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/10 text-zinc-300">
                {total}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-btn-logs-config"
            onClick={() => setActiveView("config")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-medium cursor-pointer outline-none",
              activeView === "config"
                ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Log Configurations</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {activeView === "config" ? (
        <LogConfigCard onSaved={() => loadLogs(page, debouncedFilters)} />
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Top Filters Bar */}
          <LogFiltersBar
            filters={filtersDraft}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            onRefresh={() => loadLogs(page, debouncedFilters)}
            isFiltered={isFiltered}
            loading={loading}
          />

          {/* Syncing Progress Bar with Animating Circle when refreshing with existing data */}
          {loading && logs.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-1 px-4 bg-cyan-950/20 border-b border-cyan-500/10 text-cyan-300 text-[11px] font-mono shrink-0 animate-in fade-in duration-150">
              <div className="w-3 h-3 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span>Updating logs from Vault...</span>
            </div>
          )}

          {/* Scrollable Logs List (shows animating circle if empty & loading) */}
          <LogList logs={logs} loading={loading} />

          {/* Bottom Pagination Bar */}
          <LogPagination
            page={page}
            total={total}
            limit={PAGE_LIMIT}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
};

export default LogsPage;
