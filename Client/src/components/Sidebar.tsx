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
  name: string;
  icon: ComponentType<{ className?: string }> | ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export interface SidebarProps {
  /** Array of sidebar items */
  items: readonly SidebarItem[] | SidebarItem[];
  /** Currently active item key */
  activeKey?: string;
  /** Callback invoked with item key when clicked */
  onSelect?: (key: string) => void;
  /** Controlled collapse state (for large screen in-flow mode) */
  isCollapsed?: boolean;
  /** Initial collapse state when uncontrolled */
  defaultCollapsed?: boolean;
  /** Callback fired when collapse state is toggled in large screen mode */
  onToggleCollapse?: (collapsed: boolean) => void;
  /** Whether the sidebar operates as an overlay (small screens). If undefined, auto-detects via overlayBreakpoint */
  isOverlay?: boolean;
  /** In overlay mode, whether the drawer is currently open */
  isOverlayOpen?: boolean;
  /** Callback fired when overlay drawer is requested to close (backdrop click, close button, or item click) */
  onCloseOverlay?: () => void;
  /** CSS media query breakpoint to auto-detect small screens when isOverlay is not specified (default: "(max-width: 768px)") */
  overlayBreakpoint?: string;
  /** Optional title shown in the sidebar header when expanded */
  title?: string;
  /** Optional custom header node */
  header?: ReactNode;
  /** Optional custom footer node */
  footer?: ReactNode;
  /** Additional CSS class names */
  className?: string;
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
  header,
  footer,
  className,
}) => {
  // Auto-detect small screen if isOverlay is not explicitly controlled
  const isSmallScreenAuto = useMediaQuery(overlayBreakpoint);
  const isOverlayMode =
    controlledIsOverlay !== undefined ? controlledIsOverlay : isSmallScreenAuto;

  // Uncontrolled state fallbacks
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
    // On small screens / overlay mode, clicking an item automatically closes the overlay
    if (isOverlayMode) {
      handleCloseOverlay();
    }
  };

  // Close overlay on Escape key press
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

  // -------------------------------------------------------------
  // SMALL SCREENS: OVERLAY MODE
  // -------------------------------------------------------------
  if (isOverlayMode) {
    return (
      <>
        {/* Semi-transparent Backdrop Overlay */}
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

        {/* Overlay Drawer */}
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
          {/* Overlay Header */}
          <div className="flex items-center justify-between h-12 px-3 border-b border-white/[0.06] overflow-hidden">
            {header ? (
              header
            ) : (
              <>
                <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase truncate">
                  {title || "Navigation"}
                </span>
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

          {/* Navigation Items List */}
          <nav
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

          {/* Overlay Footer */}
          {footer && (
            <div className="p-2 border-t border-white/[0.06] overflow-hidden">
              {footer}
            </div>
          )}
        </aside>
      </>
    );
  }

  // -------------------------------------------------------------
  // LARGE SCREENS: IN-FLOW LAYOUT MODE
  // -------------------------------------------------------------
  return (
    <aside
      aria-label="Sidebar navigation"
      className={cn(
        "relative flex flex-col h-full bg-zinc-950/80 backdrop-blur-md border-r border-white/[0.08] text-zinc-300 transition-[width] duration-300 ease-in-out select-none z-20 shrink-0",
        isCollapsed ? "w-16" : "w-60",
        className
      )}
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between h-12 px-3 border-b border-white/[0.06] overflow-hidden">
        {header ? (
          header
        ) : (
          <>
            {!isCollapsed && (
              <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase truncate">
                {title || "Navigation"}
              </span>
            )}
            <button
              type="button"
              id="sidebar-toggle-button"
              onClick={handleToggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
                isCollapsed && "mx-auto"
              )}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </>
        )}
      </div>

      {/* Navigation Items List */}
      <nav
        className="flex-1 py-2 px-2 space-y-1 overflow-y-auto no-scrollbar"
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
              title={isCollapsed ? item.name : undefined}
              onClick={() => handleItemClick(item.key, item.disabled)}
              className={cn(
                "group relative flex items-center w-full rounded-md text-xs font-medium transition-all duration-150 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed",
                isCollapsed
                  ? "justify-center h-10 px-0"
                  : "justify-start h-9 px-3 gap-3",
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

              {!isCollapsed && (
                <span className="truncate tracking-wide">{item.name}</span>
              )}

              {!isCollapsed && item.badge !== undefined && (
                <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 text-zinc-300 border border-white/5">
                  {item.badge}
                </span>
              )}

              {isActive && (
                <span
                  className={cn(
                    "absolute bg-cyan-400 rounded-full",
                    isCollapsed
                      ? "left-0 top-2 bottom-2 w-[3px]"
                      : "left-0 top-1.5 bottom-1.5 w-[3px]"
                  )}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Optional Sidebar Footer */}
      {footer && (
        <div className="p-2 border-t border-white/[0.06] overflow-hidden">
          {footer}
        </div>
      )}
    </aside>
  );
};
