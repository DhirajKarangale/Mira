import { useEffect, useState, type MouseEvent } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import {
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  checkIsMaximized,
} from "@/lib/window";
import { Button } from "@/components/ui/button";

export const WindowControls = () => {
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const syncMaximizedState = async () => {
      const maximized = await checkIsMaximized();
      if (mounted) {
        setIsMaximized(maximized);
      }
    };

    syncMaximizedState();

    const handleResize = () => {
      syncMaximizedState();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      mounted = false;
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleMinimize = async (e: MouseEvent) => {
    e.stopPropagation();
    await minimizeWindow();
  };

  const handleToggleMaximize = async (e: MouseEvent) => {
    e.stopPropagation();
    const newStatus = await toggleMaximizeWindow();
    setIsMaximized(newStatus);
  };

  const handleClose = async (e: MouseEvent) => {
    e.stopPropagation();
    await closeWindow();
  };

  return (
    <div
      className="flex items-center h-full select-none"
      data-tauri-drag-region="false"
      aria-label="Window controls"
    >
      <Button
        id="btn-window-minimize"
        variant="windowControl"
        size="icon"
        onClick={handleMinimize}
        title="Minimize"
        aria-label="Minimize Window"
        className="h-9 w-11 transition-colors duration-150 hover:bg-white/10 text-zinc-400 hover:text-zinc-100"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>

      <Button
        id="btn-window-maximize"
        variant="windowControl"
        size="icon"
        onClick={handleToggleMaximize}
        title={isMaximized ? "Restore Down" : "Maximize"}
        aria-label={isMaximized ? "Restore Down" : "Maximize Window"}
        className="h-9 w-11 transition-colors duration-150 hover:bg-white/10 text-zinc-400 hover:text-zinc-100"
      >
        {isMaximized ? (
          <Copy className="h-3 w-3 rotate-90" />
        ) : (
          <Square className="h-3 w-3" />
        )}
      </Button>

      <Button
        id="btn-window-close"
        variant="windowClose"
        size="icon"
        onClick={handleClose}
        title="Close"
        aria-label="Close Window"
        className="h-9 w-11 transition-colors duration-150 hover:bg-red-600 hover:text-white text-zinc-400"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
