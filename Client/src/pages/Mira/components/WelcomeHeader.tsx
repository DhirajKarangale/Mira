import { useMemo, type FC, type ReactNode } from "react";
import { Sun, Moon, Sparkles } from "lucide-react";

interface WelcomeHeaderProps {
  userName?: string;
}

// 20 hardcoded, short, positive, cheerful welcome messages
const MORNING_MESSAGES = [
  "Good morning, {name}! Let's make today remarkably productive.",
  "Rise and shine, {name}! A fresh day of possibilities awaits you.",
  "Good morning, {name}! Ready to tackle your biggest goals today?",
  "Morning, {name}! Wishing you clarity, high energy, and great focus.",
  "Good morning, {name}! Today is a fantastic day to build something great.",
  "Bright and early, {name}! Let's get ahead of the curve today.",
  "Good morning, {name}! Take a deep breath and start strong.",
];

const AFTERNOON_MESSAGES = [
  "Good afternoon, {name}! Keep the positive momentum going strong.",
  "Afternoon, {name}! Hope your day is turning out smooth and rewarding.",
  "Good afternoon, {name}! Halfway through the day and doing fantastic.",
  "Hey {name}, good afternoon! Time to power through the rest of the day.",
  "Good afternoon, {name}! Stay hydrated, stay energized, and stay inspired.",
  "Afternoon check-in, {name}! You've got everything under control.",
];

const EVENING_MESSAGES = [
  "Good evening, {name}! Time to wrap up and celebrate today's progress.",
  "Evening, {name}! Hope you had a fulfilling and productive day.",
  "Good evening, {name}! Wind down smoothly and enjoy your evening.",
  "Hey {name}, good evening! Great job on everything you tackled today.",
  "Good evening, {name}! Reflect on your wins and recharge for tomorrow.",
];

const ANYTIME_MESSAGES = [
  "Welcome back, {name}! Always a genuine pleasure to assist you.",
  "Hello {name}! Let's turn your ideas into achievements today.",
];

export const WelcomeHeader: FC<WelcomeHeaderProps> = ({ userName }) => {
  const displayName = userName?.trim() ? userName.trim() : "there";

  const { greetingMessage, timeIcon, timeLabel } = useMemo(() => {
    const currentHour = new Date().getHours();
    let candidates: string[];
    let icon: ReactNode;
    let label: string;

    if (currentHour >= 5 && currentHour < 12) {
      candidates = [...MORNING_MESSAGES, ...ANYTIME_MESSAGES];
      icon = <Sun className="w-4 h-4 text-amber-400 animate-pulse" />;
      label = "Good Morning";
    } else if (currentHour >= 12 && currentHour < 17) {
      candidates = [...AFTERNOON_MESSAGES, ...ANYTIME_MESSAGES];
      icon = <Sun className="w-4 h-4 text-amber-300" />;
      label = "Good Afternoon";
    } else {
      candidates = [...EVENING_MESSAGES, ...ANYTIME_MESSAGES];
      icon = <Moon className="w-4 h-4 text-indigo-300" />;
      label = "Good Evening";
    }

    // Pick random message on mount
    const selectedTemplate = candidates[Math.floor(Math.random() * candidates.length)];
    const message = selectedTemplate.replace(/\{name\}/g, displayName);

    return {
      greetingMessage: message,
      timeIcon: icon,
      timeLabel: label,
    };
  }, [displayName]);

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div
      id="mira-welcome-header"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.2)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.15)] shrink-0">
          <Sparkles className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              {greetingMessage}
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Your personal AI intelligence hub • Here's your curated outlook for today.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
          {timeIcon}
          <span>{timeLabel}</span>
        </div>
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-medium bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
          {formattedDate}
        </div>
      </div>
    </div>
  );
};
