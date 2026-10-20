import type { FC } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogPaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  loading?: boolean;
}

export const LogPagination: FC<LogPaginationProps> = ({
  page,
  total,
  limit,
  onPageChange,
  loading = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  // Build max 5 visible page numbers dynamically centered on current page
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    if (totalPages <= maxButtons) {
      for (let p = 1; p <= totalPages; p++) {
        pages.push(p);
      }
      return pages;
    }

    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 bg-zinc-950/90 border-t border-white/[0.08] backdrop-blur-md text-xs text-zinc-400 select-none shrink-0">
      {/* Summary item counts & Total Pages display */}
      <div className="flex items-center gap-1.5 font-mono text-[11px] flex-wrap">
        <span>Showing</span>
        <span className="font-semibold text-zinc-200">
          {startItem}-{endItem}
        </span>
        <span>of</span>
        <span className="font-semibold text-zinc-200">{total}</span>
        <span>logs</span>
        <span className="text-zinc-600 mx-0.5">•</span>

        <span>Page</span>
        <span className="font-semibold text-cyan-300">{page}</span>
        <span>of</span>
        <span className="font-semibold text-zinc-200">{totalPages}</span>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={!canPrev || loading}
          title="First page"
          className="h-7 w-7 p-0 text-xs cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>

        {/* Previous Page */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev || loading}
          title="Previous page"
          className="h-7 px-2 text-xs gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Prev</span>
        </Button>

        {/* Dynamic Page Number Buttons (Max 5) */}
        <div className="flex items-center gap-1 mx-1">
          {pageNumbers.map((p) => {
            const isCurrent = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                disabled={loading}
                className={cn(
                  "h-7 min-w-[28px] px-1.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                  isCurrent
                    ? "bg-cyan-600 text-white font-bold shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-white/5"
                )}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext || loading}
          title="Next page"
          className="h-7 px-2 text-xs gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <span className="hidden xs:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>

        {/* Last Page */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={!canNext || loading}
          title="Last page"
          className="h-7 w-7 p-0 text-xs cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
