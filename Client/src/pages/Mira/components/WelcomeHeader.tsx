import { useMemo, type FC, type ReactNode } from "react";
import { Sun, Moon, Sparkles } from "lucide-react";

interface WelcomeHeaderProps {
  userName?: string;
}

// Cheerful, funny, lightly roast-like, short, positive welcome messages
const MORNING_MESSAGES = [
  "Good morning, {name}! Look who decided to grace the world with their presence.",
  "Morning, {name}! The coffee is hot and waiting for your brain to catch up.",
  "Rise and shine, {name}! Let's pretend we're fully awake and get things done.",
  "Good morning, {name}! Your to-do list missed you, even if you didn't miss it.",
  "Morning, {name}! Another day, another chance to conquer the world (or just close 20 tabs).",
  "Wake up, {name}! The bugs aren't going to fix themselves, unfortunately.",
  "Bright and early, {name}! Step away from the snooze button and let's make things happen.",
];

const AFTERNOON_MESSAGES = [
  "Good afternoon, {name}! Still surviving on caffeine, optimism, and sheer willpower?",
  "Afternoon, {name}! Time to defeat the post-lunch slump before it defeats you.",
  "Hey {name}, good afternoon! You've made it this far without breaking production — keep it up.",
  "Good afternoon, {name}! Remember to blink and drink actual water between genius moments.",
  "Afternoon check-in, {name}! Half the day is gone, but your brilliance is just getting started.",
  "Hey {name}! 3 PM energy check: still fully functional, or just nodding in agreement?",
  "Good afternoon, {name}! Keep pushing — that commit isn't going to push itself.",
];

const EVENING_MESSAGES = [
  "Good evening, {name}! Time to close those 47 open browser tabs and declare victory.",
  "Evening, {name}! You actually survived today's chaos — honestly, color me impressed.",
  "Good evening, {name}! Step away from the keyboard before you rewrite the architecture at 9 PM.",
  "Hey {name}, good evening! Great job today; now please let your brain cool down.",
  "Good evening, {name}! You earned your downtime — go enjoy it without overthinking your code.",
  "Evening, {name}! Another day conquered. Time to rest up before tomorrow's plot twists.",
];

const ANYTIME_MESSAGES = [
  "Welcome back, {name}! I was wondering when you'd show up to make things happen.",
  "Hey {name}! Back for more code chaos? Let's handle it like pros.",
  "Look who's back! Ready to be productive, {name}, or just seeing if everything's still standing?",
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
