import { useState, useEffect } from "react";

/**
 * Custom hook to debounce fast-changing values (primitives or objects).
 *
 * @param value The value to debounce
 * @param delayMs Delay in milliseconds (default: 350ms)
 * @returns Debounced value
 */
export function useDebounce<T>(value: T, delayMs: number = 350): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const serialized =
    typeof value === "object" && value !== null ? JSON.stringify(value) : value;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [serialized, delayMs]);

  return debouncedValue;
}
