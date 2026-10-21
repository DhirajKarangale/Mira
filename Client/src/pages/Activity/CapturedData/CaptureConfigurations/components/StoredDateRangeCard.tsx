import type { FC } from "react";
import {
  CalendarDays,
  Clock,
  ArrowRight,
  Trash2,
  ShieldCheck,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import type { StoredDataRange } from "../../types";

interface StoredDateRangeCardProps {
  dataRange: StoredDataRange;
  onRequestDeleteAll: () => void;
  deletedSuccess: boolean;
}

export const StoredDateRangeCard: FC<StoredDateRangeCardProps> = ({
  dataRange,
  onRequestDeleteAll,
  deletedSuccess,
}) => {
  const formatReadableDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    try {
      const parts = dateStr.split("-");
      if (parts.length !== 3) return dateStr;
      const d = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10)
      );
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

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      <div className="absolute top-0 right-10 w-72 h-72 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Stored Captured Data
            </h2>
            <p className="text-xs text-zinc-400">
              Temporal coverage of local encrypted screen capture records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Local Storage Only</span>
          </span>

          {dataRange.hasData && (
            <button
              type="button"
              id="btn-delete-all-captured-data"
              onClick={onRequestDeleteAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/35 shadow-[0_0_15px_rgba(244,63,94,0.15)] transition-all duration-200 cursor-pointer active:scale-95"
              title="Delete all stored captured data"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Delete Captured Data</span>
            </button>
          )}
        </div>
      </div>

      {dataRange.hasData ? (
        <div className="space-y-4">
          <div className="p-6 sm:p-7 rounded-2xl bg-zinc-950/70 border border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-6 shadow-inner">
            <div className="flex-1 text-center md:text-left space-y-1">
              <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block">
                From Date (Earliest Capture)
              </span>
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                {dataRange.startDate}
              </div>
              <p className="text-xs text-cyan-300 font-medium">
                {formatReadableDate(dataRange.startDate)}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-2 shrink-0">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-mono font-bold text-cyan-300 bg-cyan-500/15 px-4 py-1.5 rounded-full border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] mb-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>{dataRange.totalDays} Days Coverage</span>
              </div>
              <div className="flex items-center text-zinc-600 gap-1.5">
                <div className="w-16 sm:w-24 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-cyan-500" />
                <ArrowRight className="w-4 h-4 text-cyan-400" />
              </div>
            </div>

            <div className="flex-1 text-center md:text-right space-y-1">
              <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block">
                To Date (Latest Capture)
              </span>
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                {dataRange.endDate}
              </div>
              <p className="text-xs text-cyan-300 font-medium">
                {formatReadableDate(dataRange.endDate)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs text-zinc-400">
            <HardDrive className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>
              All {dataRange.totalDays} days of visual records are stored in AES-256 encrypted local files and never transmitted to the cloud.
            </span>
          </div>
        </div>
      ) : deletedSuccess ? (
        <div className="p-8 sm:p-10 rounded-2xl bg-zinc-950/40 border border-emerald-500/20 text-center space-y-2 animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center mx-auto mb-2 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">
            Data Deleted Successfully
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            All stored captured data has been permanently cleared from your local storage.
          </p>
        </div>
      ) : (
        <div className="p-8 sm:p-10 rounded-2xl bg-zinc-950/40 border border-white/[0.06] text-center space-y-2">
          <CalendarDays className="w-10 h-10 text-zinc-600 mx-auto mb-1" />
          <h3 className="text-sm font-semibold text-white">
            No Captured Data Stored
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            There is currently no screen capture data stored on this device.
          </p>
        </div>
      )}
    </div>
  );
};
