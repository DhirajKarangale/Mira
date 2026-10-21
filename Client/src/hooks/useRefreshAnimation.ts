import { useState, useCallback, useRef, useEffect } from "react";

export interface UseRefreshAnimationOptions {
  /**
   * Minimum duration in milliseconds for the rotation animation (default: 650ms).
   * Ensures the user gets satisfying visual feedback even on ultra-fast local network responses.
   */
  minDurationMs?: number;
}

/**
 * Custom hook to control refresh buttons.
 * - Triggers continuous rotation (`animate-spin`) until the refresh action finishes.
 * - Guarantees a minimum rotation duration (default: 650ms) so the icon smoothly completes at least one full spin.
 * - Prevents duplicate clicks while refreshing (`isRefreshing = true`).
 */
export function useRefreshAnimation(
  onRefresh?: () => Promise<unknown> | void,
  options: UseRefreshAnimationOptions = {}
) {
  const { minDurationMs = 650 } = options;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    const startTime = Date.now();

    try {
      await onRefresh();
    } catch (err) {
      console.error("Refresh action failed:", err);
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDurationMs - elapsed);

      if (remaining > 0) {
        setTimeout(() => {
          if (isMountedRef.current) {
            setIsRefreshing(false);
          }
        }, remaining);
      } else {
        if (isMountedRef.current) {
          setIsRefreshing(false);
        }
      }
    }
  }, [isRefreshing, onRefresh, minDurationMs]);

  return {
    isRefreshing,
    handleRefresh,
  };
}
