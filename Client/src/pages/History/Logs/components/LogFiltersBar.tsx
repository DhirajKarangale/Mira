import { useState, useRef, useEffect, type FC } from "react";
import {
  Search,
  Filter,
  X,
  RotateCw,
  ChevronDown,
  Check,
  Monitor,
  Cpu,
  Database,
  Sparkles,
  Radio,
  Layers,
} from "lucide-react";
import type { LogFilters } from "../types";
import { LogDateRangePicker } from "./LogDateRangePicker";
import { cn } from "@/lib/utils";

interface LogFiltersBarProps {
  filters: LogFilters;
  onFilterChange: (filters: Partial<LogFilters>) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  isFiltered: boolean;
  loading?: boolean;
}

const MODULE_OPTIONS = [
  {
    value: "all",
    label: "All Modules",
    icon: Layers,
    color: "text-zinc-300",
    badgeBg: "bg-zinc-800",
    description: "View logs aggregated across all system modules",
  },
  {
    value: "operator",
    label: "Operator",
    icon: Monitor,
    color: "text-emerald-400",
    badgeBg: "bg-emerald-500/10 border-emerald-500/20",
    description: "Rust Core process and system automation",
  },
  {
    value: "engine",
    label: "Engine",
    icon: Cpu,
    color: "text-indigo-400",
    badgeBg: "bg-indigo-500/10 border-indigo-500/20",
    description: "Core execution and AI pipeline processing",
  },
  {
    value: "memory",
    label: "Memory",
    icon: Database,
    color: "text-amber-400",
    badgeBg: "bg-amber-500/10 border-amber-500/20",
    description: "Long-term and working memory storage",
  },
  {
    value: "client",
    label: "Client",
    icon: Sparkles,
    color: "text-cyan-400",
    badgeBg: "bg-cyan-500/10 border-cyan-500/20",
    description: "Desktop UI, Tauri shell, and user interactions",
  },
  {
    value: "message_broker",
    label: "Message Broker",
    icon: Radio,
    color: "text-blue-400",
    badgeBg: "bg-blue-500/10 border-blue-500/20",
    description: "Internal pub/sub event bus and messaging",
  },
];

export const LogFiltersBar: FC<LogFiltersBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  onRefresh,
  isFiltered,
  loading = false,
}) => {
  const [isModuleOpen, setIsModuleOpen] = useState(false);
  const moduleDropdownRef = useRef<HTMLDivElement>(null);

  // Close module dropdown on outside click or on Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        moduleDropdownRef.current &&
        !moduleDropdownRef.current.contains(event.target as Node)
      ) {
        setIsModuleOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModuleOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSelectModule = (val: string) => {
    onFilterChange({ moduleName: val });
    setIsModuleOpen(false);
  };

  const handleDateRangeChange = (range: { startDate: string; endDate: string }) => {
    onFilterChange({ startDate: range.startDate, endDate: range.endDate });
  };

  const currentModule =
    MODULE_OPTIONS.find((m) => m.value === filters.moduleName) ||
    MODULE_OPTIONS[0];
  const CurrentModuleIcon = currentModule.icon;

  return (
    <div className="relative z-30 flex flex-col gap-2 p-3 sm:p-4 bg-zinc-950/80 border-b border-white/[0.08] backdrop-blur-md shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 1. Text Search (Debounced, without 'debounced' in placeholder) */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            id="filter-log-search"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Search log content..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-zinc-900/90 border border-white/10 rounded-md text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ search: "" })}
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Custom Sleek Calendar Range Picker (No text editing, 100% point-and-click) */}
        <LogDateRangePicker
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={handleDateRangeChange}
          disabled={loading}
        />

        {/* 3. Custom Sleek Module Select Dropdown */}
        <div className="relative" ref={moduleDropdownRef}>
          <button
            type="button"
            id="filter-log-module-button"
            onClick={() => setIsModuleOpen((prev) => !prev)}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all outline-none border select-none",
              loading
                ? "bg-zinc-900/50 border-white/5 text-zinc-500 cursor-not-allowed"
                : isModuleOpen
                ? "bg-zinc-800 text-white border-cyan-500/50 ring-1 ring-cyan-500/30 cursor-pointer"
                : "bg-zinc-900/90 hover:bg-zinc-800/90 text-zinc-200 border-white/10 cursor-pointer"
            )}
            title="Filter by System Module"
          >
            <div className={cn("p-0.5 rounded", currentModule.badgeBg)}>
              <CurrentModuleIcon className={cn("w-3.5 h-3.5", currentModule.color)} />
            </div>
            <span className="font-medium tracking-wide">{currentModule.label}</span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ml-1",
                isModuleOpen && "rotate-180 text-cyan-400"
              )}
            />
          </button>

          {/* Custom Dropdown Menu with Glassmorphism */}
          {isModuleOpen && (
            <div className="absolute top-full left-0 mt-2 z-50 min-w-[260px] py-1.5 bg-[#0b101b]/98 backdrop-blur-xl border border-cyan-500/30 rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_20px_rgba(6,182,212,0.18)] animate-in fade-in-0 zoom-in-95 duration-150 select-none">
              <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.08] mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                  Select Module
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {MODULE_OPTIONS.length} options
                </span>
              </div>

              <div className="space-y-0.5 px-1">
                {MODULE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = filters.moduleName === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectModule(opt.value);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectModule(opt.value);
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-2.5 py-2 rounded-md text-xs text-left transition-all cursor-pointer group",
                        isSelected
                          ? "bg-cyan-950/60 text-cyan-200 border border-cyan-500/30"
                          : "text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
                        <div
                          className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-md border shrink-0 transition-transform group-hover:scale-105",
                            opt.badgeBg
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", opt.color)} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span
                            className={cn(
                              "font-medium truncate",
                              isSelected ? "text-cyan-200 font-semibold" : "text-zinc-200"
                            )}
                          >
                            {opt.label}
                          </span>
                          <span className="text-[10px] text-zinc-500 truncate">
                            {opt.description}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2 pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 4. Filter Reset Icon Button + Refresh Action with Animating Circle */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Requirement 5: For filter reset just show filter button. When filters are selected, show one dot. On click, reset filters. */}
          <button
            type="button"
            id="btn-filter-reset"
            onClick={isFiltered ? onResetFilters : undefined}
            disabled={!isFiltered}
            title={
              isFiltered
                ? "Filters active — click to reset all filters"
                : "No filters active"
            }
            className={cn(
              "relative flex items-center justify-center w-8 h-8 rounded-md border transition-all select-none outline-none",
              isFiltered
                ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                : "bg-zinc-900/50 border-white/5 text-zinc-500 cursor-not-allowed opacity-50"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            {isFiltered && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />
            )}
          </button>

          {/* Requirement 6: Refresh Action showing Animating Circle for loading */}
          <button
            type="button"
            id="btn-refresh-logs"
            onClick={!loading ? onRefresh : undefined}
            disabled={loading}
            title={loading ? "Loading logs..." : "Refresh logs from Vault"}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md border border-white/10 transition-all select-none outline-none",
              loading
                ? "bg-zinc-900 text-cyan-400 cursor-not-allowed border-cyan-500/30"
                : "bg-zinc-900/90 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-white/20 cursor-pointer"
            )}
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            ) : (
              <RotateCw className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
