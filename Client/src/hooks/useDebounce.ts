import { useState, useEffect } from "react";

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
