import type { FC } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sparkles,
  User,
  Sliders,
  Monitor,
  History,
  Info,
  type LucideIcon,
} from "lucide-react";
import { NAV_ITEMS } from "@/types/navigation";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  User,
  Cpu: Sliders,
  Monitor,
  History,
  Info,
};

export const NavTabs: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="flex items-center gap-1 select-none"
      role="tablist"
      aria-label="Application Navigation"
      data-tauri-drag-region="false"
    >
      {NAV_ITEMS.map((item) => {
        const itemPath = `/${item.id}`;
        const isActive =
          location.pathname === itemPath ||
          location.pathname.startsWith(`${itemPath}/`);
        const Icon = ICON_MAP[item.iconName] || Sparkles;

        return (
          <button
            key={item.id}
            id={`nav-item-${item.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`page-content-${item.id}`}
            onClick={() => navigate(itemPath)}
            className={cn(
              "group relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
              isActive
                ? "text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.12)]"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent"
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 transition-colors duration-150",
                isActive
                  ? "text-cyan-400"
                  : "text-zinc-400 group-hover:text-zinc-200"
              )}
            />
            <span className="tracking-wide">{item.label}</span>

            {/* Subtle active indicator bar at the bottom */}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
