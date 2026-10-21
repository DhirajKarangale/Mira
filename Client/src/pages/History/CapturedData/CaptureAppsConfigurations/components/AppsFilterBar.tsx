import type { FC, ChangeEvent } from "react";
import { Search, X, ShieldCheck, ShieldAlert, Layers } from "lucide-react";
import type { AppFilterType } from "../../types";
import { cn } from "@/lib/utils";

interface AppsFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeFilter: AppFilterType;
  onFilterChange: (filter: AppFilterType) => void;
  totalCount: number;
  allowedCount: number;
  restrictedCount: number;
}

export const AppsFilterBar: FC<AppsFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  totalCount,
  allowedCount,
  restrictedCount,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-3 rounded-2xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-xl">
      {/* Search Input Box */}
      <div className="relative flex-1 min-w-[240px]">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          id="input-search-apps"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          placeholder="Search by app name or process (e.g., msedge.exe, code.exe)..."
          className="w-full h-10 pl-10 pr-9 rounded-xl bg-zinc-800/60 border border-white/[0.06] hover:border-white/[0.12] focus:border-blue-500/50 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-850/80 border border-white/[0.06] shrink-0 overflow-x-auto no-scrollbar">
        {/* All Filter */}
        <button
          type="button"
          id="btn-filter-all"
          onClick={() => onFilterChange("all")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer outline-none whitespace-nowrap",
            activeFilter === "all"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded text-[10px] font-mono",
              activeFilter === "all" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
            )}
          >
            {totalCount}
          </span>
        </button>

        {/* Allowed Filter */}
        <button
          type="button"
          id="btn-filter-allowed"
          onClick={() => onFilterChange("allowed")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer outline-none whitespace-nowrap",
            activeFilter === "allowed"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          )}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
          <span>Allowed</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded text-[10px] font-mono",
              activeFilter === "allowed" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
            )}
          >
            {allowedCount}
          </span>
        </button>

        {/* Restricted Filter */}
        <button
          type="button"
          id="btn-filter-restricted"
          onClick={() => onFilterChange("restricted")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer outline-none whitespace-nowrap",
            activeFilter === "restricted"
              ? "bg-rose-600 text-white shadow-md shadow-rose-600/30 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          )}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-300" />
          <span>Restricted</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded text-[10px] font-mono",
              activeFilter === "restricted" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
            )}
          >
            {restrictedCount}
          </span>
        </button>
      </div>
    </div>
  );
};
