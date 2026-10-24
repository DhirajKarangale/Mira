import { useState, type FC } from "react";
import { Copy, Check, FileText } from "lucide-react";
import type { LogEntry } from "../types";

interface LogListProps {
  logs: LogEntry[];
  loading?: boolean;
}

const MODULE_BADGE_STYLES: Record<string, string> = {
  vault: "text-violet-300 bg-violet-500/15 border-violet-500/30",
  operator: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  engine: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30",
  memory: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  client: "text-cyan-300 bg-cyan-500/15 border-cyan-500/30",
  message_broker: "text-blue-300 bg-blue-500/15 border-blue-500/30",
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const formatLogTimestamp = (raw: string | number): string => {
  if (!raw) return "";
  const rawStr = String(raw).trim();

  let day: number, month: number, year: number, hours: number, minutes: number;

  const ddmmyyyy = rawStr.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/
  );
  if (ddmmyyyy) {
    day = parseInt(ddmmyyyy[1], 10);
    month = parseInt(ddmmyyyy[2], 10) - 1;
    year = parseInt(ddmmyyyy[3], 10);
    hours = parseInt(ddmmyyyy[4], 10);
    minutes = parseInt(ddmmyyyy[5], 10);
  } else {
    const parsed = new Date(rawStr);
    if (!isNaN(parsed.getTime())) {
      day = parsed.getDate();
      month = parsed.getMonth();
      year = parsed.getFullYear();
      hours = parsed.getHours();
      minutes = parsed.getMinutes();
    } else {
      return rawStr;
    }
  }

  const monthName = MONTH_NAMES[month] || "Unknown";
  const period = hours >= 12 ? "pm" : "am";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  const formattedHours = String(hours12).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedDay = String(day).padStart(2, "0");

  return `${formattedDay} ${monthName} ${year} ${formattedHours}:${formattedMinutes} ${period}`;
};

export const LogList: FC<LogListProps> = ({ logs, loading = false }) => {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = (log: LogEntry) => {
    const timeFormatted = formatLogTimestamp(log.timestamp);
    const text = `[${timeFormatted}] [${log.module_name}] #${log.id}: ${log.data}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-400">
        <div className="w-9 h-9 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-3 shadow-[0_0_15px_rgba(6,182,212,0.3)]" />
        <p className="text-xs font-mono tracking-wider text-zinc-400">Loading logs from Vault...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-400">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-white/5 mb-3 text-zinc-500">
          <FileText className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-zinc-300">No logs found</h4>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          No logs match the current search filters and date range. Try broadening your query or selecting another date.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar font-mono text-xs select-text">
      <div className="divide-y divide-white/[0.04]">
        {logs.map((log) => {
          const modKey = log.module_name.toLowerCase().replace("-", "_");
          const badgeStyle =
            MODULE_BADGE_STYLES[modKey] ||
            "text-zinc-300 bg-zinc-800 border-zinc-700";
          const isCopied = copiedId === log.id;
          const formattedTimestamp = formatLogTimestamp(log.timestamp);

          return (
            <div
              key={log.id}
              className="group relative flex items-start gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
            >
              <span className="shrink-0 text-[11px] text-zinc-500 font-mono select-none w-10 text-right pt-0.5">
                #{log.id}
              </span>

              <span className="shrink-0 text-[11px] text-zinc-400 select-none pt-0.5 min-w-[145px]">
                {formattedTimestamp}
              </span>

              <span
                className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border select-none ${badgeStyle}`}
              >
                {log.module_name}
              </span>

              <div className="flex-1 min-w-0 text-zinc-200 break-words leading-relaxed">
                {log.data}
              </div>

              <button
                type="button"
                onClick={() => handleCopy(log)}
                title="Copy log entry"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-400 hover:text-white rounded hover:bg-white/10 shrink-0 cursor-pointer"
              >
                {isCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
