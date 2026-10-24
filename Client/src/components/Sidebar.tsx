import {
  useState,
  useEffect,
  type FC,
  type ComponentType,
  type ReactNode,
  isValidElement,
} from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  key: string;
  name: string | ReactNode;
  icon: ComponentType<{ className?: string }> | ReactNode;
  badge?: string | number;
  disabled?: boolean;
}


export interface SidebarProps {
  items: readonly SidebarItem[] | SidebarItem[];
  activeKey?: string;
  onSelect?: (key: string) => void;
  isCollapsed?: boolean;
  defaultCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  isOverlay?: boolean;
  isOverlayOpen?: boolean;
  onCloseOverlay?: () => void;
  overlayBreakpoint?: string;
  title?: string;
  icon?: ComponentType<{ className?: string }> | ReactNode;
  iconBadgeClassName?: string;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  onScroll?: (e: React.UIEvent<HTMLElement>) => void;
}

export const Sidebar: FC<SidebarProps> = ({
  items,
  activeKey,
  onSelect,
  isCollapsed: controlledCollapsed,
  defaultCollapsed = false,
  onToggleCollapse,
  isOverlay: controlledIsOverlay,
  isOverlayOpen: controlledIsOverlayOpen,
  onCloseOverlay,
  overlayBreakpoint = "(max-width: 768px)",
  title,
  icon,
  iconBadgeClassName,
  header,
  footer,
  className,
  onScroll,
}) => {
  const isSmallScreenAuto = useMediaQuery(overlayBreakpoint);
  const isOverlayMode =
    controlledIsOverlay !== undefined ? controlledIsOverlay : isSmallScreenAuto;

  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const [internalOverlayOpen, setInternalOverlayOpen] = useState(false);

  const isCollapsed =
    controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const isOverlayOpen =
    controlledIsOverlayOpen !== undefined
      ? controlledIsOverlayOpen
      : internalOverlayOpen;

  const handleToggleCollapse = () => {
    const nextState = !isCollapsed;
    if (controlledCollapsed === undefined) {
      setInternalCollapsed(nextState);
    }
    onToggleCollapse?.(nextState);
  };

  const handleCloseOverlay = () => {
    if (controlledIsOverlayOpen === undefined) {
      setInternalOverlayOpen(false);
    }
    onCloseOverlay?.();
  };

  const handleItemClick = (key: string, disabled?: boolean) => {
    if (disabled) return;
    onSelect?.(key);
    if (isOverlayMode) {
      handleCloseOverlay();
    }
  };

  useEffect(() => {
    if (!isOverlayMode || !isOverlayOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseOverlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOverlayMode, isOverlayOpen]);

  const renderIcon = (icon: ComponentType<{ className?: string }> | ReactNode) => {
    if (isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
      const IconComponent = icon as ComponentType<{ className?: string }>;
      return <IconComponent className="h-4 w-4 shrink-0 transition-colors" />;
    }
    return null;
  };

  const renderHeaderIcon = (headerIcon: ComponentType<{ className?: string }> | ReactNode) => {
    if (isValidElement(headerIcon)) {
      return headerIcon;
    }
    if (typeof headerIcon === "function" || (typeof headerIcon === "object" && headerIcon !== null)) {
      const IconComponent = headerIcon as ComponentType<{ className?: string }>;
      return <IconComponent className="h-3.5 w-3.5 shrink-0" />;
    }
    return null;
  };

  if (isOverlayMode) {
    return (
      <>
        <div
          role="presentation"
          aria-hidden="true"
          onClick={handleCloseOverlay}
          className={cn(
            "fixed inset-0 top-10 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out cursor-pointer",
            isOverlayOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          )}
        />

        <aside
          aria-label="Sidebar navigation drawer"
          aria-hidden={!isOverlayOpen}
          className={cn(
            "fixed top-10 bottom-0 left-0 z-50 w-64 max-w-[80vw] bg-zinc-950/95 backdrop-blur-md border-r border-white/[0.08] text-zinc-300 shadow-2xl transition-transform duration-300 ease-in-out select-none flex flex-col",
            isOverlayOpen
              ? "translate-x-0 pointer-events-auto"
              : "-translate-x-full pointer-events-none",
            className
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between px-3 border-b border-white/[0.06]",
              header ? "min-h-12 py-2" : "h-12 overflow-hidden"
            )}
          >
            {header ? (
              header
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  {icon && (
                    <div
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0",
                        iconBadgeClassName
                      )}
                    >
                      {renderHeaderIcon(icon)}
                    </div>
                  )}
                  <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase truncate">
                    {title || "Navigation"}
                  </span>
                </div>
                <button
                  type="button"
                  id="sidebar-overlay-close-button"
                  onClick={handleCloseOverlay}
                  title="Close sidebar"
                  aria-label="Close sidebar"
                  className="flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          <nav
            onScroll={onScroll}
            className="flex-1 py-2 px-2 space-y-1 overflow-y-auto no-scrollbar"
            role="menu"
          >
            {items.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  id={`sidebar-overlay-item-${item.key}`}
                  role="menuitem"
                  aria-current={isActive ? "page" : undefined}
                  disabled={item.disabled}
                  onClick={() => handleItemClick(item.key, item.disabled)}
                  className={cn(
                    "group relative flex items-center justify-start h-9 w-full px-3 gap-3 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed",
                    isActive
                      ? "bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.12)] font-semibold"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "transition-colors",
                      isActive
                        ? "text-cyan-400"
                        : "text-zinc-400 group-hover:text-zinc-200"
                    )}
                  >
                    {renderIcon(item.icon)}
                  </span>

                  <span className="truncate tracking-wide">{item.name}</span>

                  {item.badge !== undefined && (
                    <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 text-zinc-300 border border-white/5">
                      {item.badge}
                    </span>
                  )}

                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-cyan-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {footer && (
            <div className="p-2 border-t border-white/[0.06] overflow-hidden">
              {footer}
            </div>
          )}
        </aside>
      </>
    );
  }

  return (
    <aside
      aria-label="Sidebar navigation"
      className={cn(
        "relative flex flex-col h-full bg-zinc-950/80 backdrop-blur-md border-r border-white/[0.08] text-zinc-300 transition-[width] duration-300 ease-in-out will-change-[width] select-none z-20 shrink-0 overflow-hidden",
        isCollapsed ? "w-16" : "w-64",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b border-white/[0.06] transition-[height,padding] duration-300 ease-in-out overflow-hidden shrink-0",
          header
            ? (isCollapsed ? "h-14 px-2" : "h-[88px] px-3 py-2.5")
            : "h-14 px-3"
        )}
      >
        {header ? (
          header
        ) : (
          <div className="relative w-full h-full flex items-center overflow-hidden">
            {/* When collapsed: strictly ONE button centered */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-200",
                isCollapsed
                  ? "opacity-100 pointer-events-auto scale-100"
                  : "opacity-0 pointer-events-none scale-90"
              )}
            >
              <button
                type="button"
                id="sidebar-toggle-expand-button"
                onClick={handleToggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>

            {/* When open: Full header controls */}
            <div
              className={cn(
                "w-[232px] flex items-center justify-between transition-all duration-200 shrink-0",
                !isCollapsed
                  ? "opacity-100 pointer-events-auto translate-x-0"
                  : "opacity-0 pointer-events-none -translate-x-2"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {icon && (
                  <div
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0",
                      iconBadgeClassName
                    )}
                  >
                    {renderHeaderIcon(icon)}
                  </div>
                )}
                <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase truncate">
                  {title || "Navigation"}
                </span>
              </div>
              <button
                type="button"
                id="sidebar-toggle-button"
                onClick={handleToggleCollapse}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 shrink-0"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <nav
        onScroll={onScroll}
        className="flex-1 py-2 px-2 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar"
        role="menu"
      >
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              id={`sidebar-item-${item.key}`}
              role="menuitem"
              aria-current={isActive ? "page" : undefined}
              disabled={item.disabled}
              title={isCollapsed && typeof item.name === "string" ? item.name : undefined}
              onClick={() => handleItemClick(item.key, item.disabled)}
              className={cn(
                "group relative flex items-center w-full rounded-md text-xs font-medium cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed h-9 px-2 overflow-hidden transition-colors duration-150",
                isActive
                  ? "bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.12)] font-semibold"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent"
              )}
            >
              <span
                className={cn(
                  "shrink-0 flex items-center justify-center w-8 h-8 rounded transition-colors",
                  isActive
                    ? "text-cyan-400"
                    : "text-zinc-400 group-hover:text-zinc-200"
                )}
              >
                {renderIcon(item.icon)}
              </span>

              <div
                className={cn(
                  "flex items-center flex-1 min-w-0 transition-opacity duration-200 ml-2 overflow-hidden",
                  isCollapsed
                    ? "opacity-0 pointer-events-none"
                    : "opacity-100"
                )}
              >
                <span className="truncate tracking-wide text-left flex-1 whitespace-nowrap">
                  {item.name}
                </span>

                {item.badge !== undefined && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 text-zinc-300 border border-white/5 shrink-0 whitespace-nowrap">
                    {item.badge}
                  </span>
                )}
              </div>

              {isActive && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-cyan-400 rounded-full"
                />
              )}
            </button>
          );
        })}
      </nav>

      {footer && (
        <div className="p-2 border-t border-white/[0.06] overflow-hidden whitespace-nowrap shrink-0">
          <div
            className={cn(
              "transition-opacity duration-200",
              isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
          >
            {footer}
          </div>
        </div>
      )}
    </aside>
  );
};

