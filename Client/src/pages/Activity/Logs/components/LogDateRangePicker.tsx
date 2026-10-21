import { useState, useRef, useEffect, useMemo, type FC } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LogDateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onChange: (range: { startDate: string; endDate: string }) => void;
  disabled?: boolean;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const formatYYYYMMDD = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseYYYYMMDD = (str: string): Date => {
  if (!str || !str.includes("-")) return new Date();
  const parts = str.split("-");
  return new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10)
  );
};

const formatReadable = (str: string): string => {
  try {
    const d = parseYYYYMMDD(str);
    const months = [
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
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return str;
  }
};

export const LogDateRangePicker: FC<LogDateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Month navigation state
  const initialDate = useMemo(() => parseYYYYMMDD(startDate), [startDate]);
  const [currentYear, setCurrentYear] = useState<number>(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(initialDate.getMonth());

  // Interactive selection state within the calendar
  const [rangeStart, setRangeStart] = useState<string>(startDate);
  const [rangeEnd, setRangeEnd] = useState<string>(endDate);
  const [isSelectingEnd, setIsSelectingEnd] = useState<boolean>(false);

  // Synchronize when props change
  useEffect(() => {
    setRangeStart(startDate);
    setRangeEnd(endDate);
  }, [startDate, endDate]);

  // Click-outside and Escape key listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Quick Preset Actions
  const handleSelectPreset = (daysBack: number) => {
    const today = new Date();
    const endStr = formatYYYYMMDD(today);
    const startObj = new Date();
    startObj.setDate(startObj.getDate() - daysBack);
    const startStr = formatYYYYMMDD(startObj);

    setRangeStart(startStr);
    setRangeEnd(endStr);
    setIsSelectingEnd(false);
    setCurrentYear(startObj.getFullYear());
    setCurrentMonth(startObj.getMonth());
    onChange({ startDate: startStr, endDate: endStr });
    setIsOpen(false);
  };

  const handleSelectYesterday = () => {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStr = formatYYYYMMDD(yest);

    setRangeStart(yestStr);
    setRangeEnd(yestStr);
    setIsSelectingEnd(false);
    setCurrentYear(yest.getFullYear());
    setCurrentMonth(yest.getMonth());
    onChange({ startDate: yestStr, endDate: yestStr });
    setIsOpen(false);
  };

  // Day Selection Logic
  const handleDayClick = (dayStr: string) => {
    if (!isSelectingEnd) {
      // First click: sets start date and prepares for range
      setRangeStart(dayStr);
      setRangeEnd(dayStr);
      setIsSelectingEnd(true);
    } else {
      // Second click: sets end date
      let newStart = rangeStart;
      let newEnd = dayStr;
      if (newEnd < newStart) {
        newStart = dayStr;
        newEnd = rangeStart;
      }
      setRangeStart(newStart);
      setRangeEnd(newEnd);
      setIsSelectingEnd(false);
      onChange({ startDate: newStart, endDate: newEnd });
      setIsOpen(false);
    }
  };

  // Generate calendar grid days for current month
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }[] = [];

    const todayStr = formatYYYYMMDD(new Date());

    // Leading days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const d = new Date(currentYear, currentMonth - 1, dayNum);
      const str = formatYYYYMMDD(d);
      days.push({
        dateStr: str,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: str === todayStr,
      });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(currentYear, currentMonth, i);
      const str = formatYYYYMMDD(d);
      days.push({
        dateStr: str,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: str === todayStr,
      });
    }

    // Trailing days from next month to fill grid
    const totalSlots = Math.ceil(days.length / 7) * 7;
    const remaining = totalSlots - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(currentYear, currentMonth + 1, i);
      const str = formatYYYYMMDD(d);
      days.push({
        dateStr: str,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: str === todayStr,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  const todayStr = formatYYYYMMDD(new Date());
  const isTodaySelected = startDate === todayStr && endDate === todayStr;

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger Button showing selected dates (Clickable, No typing!) */}
      <button
        type="button"
        id="btn-open-calendar-popover"
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            // Center month on current start date
            const sDate = parseYYYYMMDD(startDate);
            setCurrentYear(sDate.getFullYear());
            setCurrentMonth(sDate.getMonth());
            setRangeStart(startDate);
            setRangeEnd(endDate);
            setIsSelectingEnd(false);
          }
        }}
        disabled={disabled}
        title="Click to choose date range from calendar"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border transition-all select-none outline-none",
          disabled
            ? "bg-zinc-900/50 border-white/5 text-zinc-500 cursor-not-allowed"
            : isOpen
              ? "bg-zinc-900 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.25)] cursor-pointer"
              : "bg-zinc-900/90 hover:bg-zinc-800/90 border-white/10 text-zinc-200 hover:border-cyan-500/40 cursor-pointer"
        )}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="font-mono text-xs">
          {startDate === endDate ? (
            <span>{isTodaySelected ? "Today: " : ""}{formatReadable(startDate)}</span>
          ) : (
            <span>
              {formatReadable(startDate)} — {formatReadable(endDate)}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ml-0.5",
            isOpen && "rotate-180 text-cyan-400"
          )}
        />
      </button>

      {/* Sleek Custom Dark Calendar Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-[310px] p-3.5 bg-[#0b101c]/98 backdrop-blur-2xl border border-cyan-500/30 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_20px_rgba(6,182,212,0.18)] animate-in fade-in-0 zoom-in-95 duration-150 select-none">
          {/* Quick Presets Strip */}
          <div className="flex items-center justify-between gap-1 pb-3 mb-3 border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => handleSelectPreset(0)}
              className="flex-1 py-1 px-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider text-center transition-colors bg-white/5 hover:bg-cyan-950/60 hover:text-cyan-300 text-zinc-300 cursor-pointer border border-transparent hover:border-cyan-500/30"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleSelectYesterday}
              className="flex-1 py-1 px-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider text-center transition-colors bg-white/5 hover:bg-cyan-950/60 hover:text-cyan-300 text-zinc-300 cursor-pointer border border-transparent hover:border-cyan-500/30"
            >
              Yest
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(6)}
              className="flex-1 py-1 px-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider text-center transition-colors bg-white/5 hover:bg-cyan-950/60 hover:text-cyan-300 text-zinc-300 cursor-pointer border border-transparent hover:border-cyan-500/30"
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(29)}
              className="flex-1 py-1 px-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider text-center transition-colors bg-white/5 hover:bg-cyan-950/60 hover:text-cyan-300 text-zinc-300 cursor-pointer border border-transparent hover:border-cyan-500/30"
            >
              30 Days
            </button>
          </div>

          {/* Month & Year Navigation Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-semibold text-xs text-zinc-100 tracking-wide">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAY_NAMES.map((name) => (
              <span
                key={name}
                className="text-[10px] font-mono text-zinc-500 font-semibold py-0.5"
              >
                {name}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((item) => {
              const isStart = item.dateStr === rangeStart;
              const isEnd = item.dateStr === rangeEnd;
              const inRange =
                rangeStart &&
                rangeEnd &&
                item.dateStr > rangeStart &&
                item.dateStr < rangeEnd;

              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => handleDayClick(item.dateStr)}
                  className={cn(
                    "h-8 w-full rounded-md text-xs font-mono font-medium flex items-center justify-center transition-all cursor-pointer relative",
                    !item.isCurrentMonth && "text-zinc-600 opacity-40 hover:opacity-100",
                    item.isCurrentMonth && "text-zinc-300",
                    inRange && "bg-cyan-950/50 text-cyan-200 rounded-none",
                    (isStart || isEnd) &&
                    "bg-cyan-500 text-zinc-950 font-bold shadow-[0_0_10px_rgba(6,182,212,0.4)] z-10",
                    isStart && rangeEnd > rangeStart && "rounded-r-none",
                    isEnd && rangeEnd > rangeStart && "rounded-l-none",
                    !isStart && !isEnd && !inRange && "hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span>{item.dayNumber}</span>
                  {item.isToday && !isStart && !isEnd && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-cyan-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Instructions & Range Confirmation */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-zinc-400">
            <span className="font-mono text-[10px] text-zinc-400 truncate">
              {isSelectingEnd
                ? "Click end date to finish..."
                : `${formatReadable(rangeStart)} — ${formatReadable(rangeEnd)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
