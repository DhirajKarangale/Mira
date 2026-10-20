import { useState, useEffect } from "react";

/**
 * Custom hook to detect media query matches with SSR/browser safety.
 *
 * @param query CSS media query string (e.g. "(max-width: 768px)")
 * @returns boolean indicating whether media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQueryList = window.matchMedia(query);
    const updateMatch = (e: MediaQueryListEvent | MediaQueryList) => {
      setMatches(e.matches);
    };

    updateMatch(mediaQueryList);

    const listener = (event: MediaQueryListEvent) => {
      updateMatch(event);
    };

    mediaQueryList.addEventListener("change", listener);
    return () => {
      mediaQueryList.removeEventListener("change", listener);
    };
  }, [query]);

  return matches;
}
