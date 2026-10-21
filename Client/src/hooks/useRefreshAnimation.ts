import { useState, useCallback, useRef, useEffect } from "react";

export interface UseRefreshAnimationOptions {
  minDurationMs?: number;
}

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
