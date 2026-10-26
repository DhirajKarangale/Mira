import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dailySuggestionsService,
  type DailySuggestionsPageResponse,
  type DailySuggestionsRecord,
  type WeatherData,
  type NewsArticle,
} from "@/services/dailySuggestions.service";
import { useUserDetailsQuery } from "../User/queries";
import type { UserDetails } from "../User/types";
import { QUERY_KEYS } from "@/lib/queryClient";

export const DAILY_SUGGESTIONS_QUERY_KEY = QUERY_KEYS.dailySuggestions.pageData;

export function checkIsLocationConfigured(details?: UserDetails | null): boolean {
  if (!details) return false;
  const hasCity = Boolean(details.city && details.city.trim().length > 0);
  const hasCoordinates =
    details.latitude != null &&
    details.longitude != null &&
    !Number.isNaN(Number(details.latitude)) &&
    !Number.isNaN(Number(details.longitude));

  return hasCity || hasCoordinates;
}

function safeParseArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function safeParseObject<T>(val: unknown): T | null {
  if (!val) return null;
  if (typeof val === "object" && !Array.isArray(val)) return val as T;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    } catch {
      return null;
    }
  }
  return null;
}

export function useMiraData() {
  const queryClient = useQueryClient();
  const { data: userDetails, isLoading: isUserLoading } = useUserDetailsQuery();

  const isLocationConfigured = useMemo(
    () => checkIsLocationConfigured(userDetails),
    [userDetails]
  );

  const [refreshingSection, setRefreshingSection] = useState<Record<string, boolean>>({
    weather: false,
    news: false,
    suggestions: false,
  });

  const {
    data: pageData,
    isLoading: isPageLoading,
    isError,
    error,
    refetch,
  } = useQuery<DailySuggestionsPageResponse>({
    queryKey: DAILY_SUGGESTIONS_QUERY_KEY,
    queryFn: () => dailySuggestionsService.getPageData(),
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
  });

  const today: DailySuggestionsRecord = useMemo(() => {
    const raw = pageData?.today;
    if (!raw) {
      return {
        id: null,
        suggestions: [],
        completed: [],
        weather: null,
        news: [],
      };
    }
    return {
      ...raw,
      suggestions: safeParseArray<string>(raw.suggestions),
      news: safeParseArray<NewsArticle>(raw.news),
      weather: safeParseObject<WeatherData>(raw.weather),
      completed: Array.isArray(raw.completed)
        ? raw.completed
        : typeof raw.completed === "string"
        ? (raw.completed as string).split(",").map(Number).filter((n) => !isNaN(n))
        : [],
    };
  }, [pageData]);

  const previous: DailySuggestionsRecord = useMemo(() => {
    const raw = pageData?.previous;
    if (!raw) {
      return {
        id: null,
        suggestions: [],
        completed: [],
        weather: null,
        news: [],
      };
    }
    return {
      ...raw,
      suggestions: safeParseArray<string>(raw.suggestions),
      news: safeParseArray<NewsArticle>(raw.news),
      weather: safeParseObject<WeatherData>(raw.weather),
      completed: Array.isArray(raw.completed)
        ? raw.completed
        : typeof raw.completed === "string"
        ? (raw.completed as string).split(",").map(Number).filter((n) => !isNaN(n))
        : [],
    };
  }, [pageData]);

  // Local optimistic completed indices
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);

  useEffect(() => {
    if (today?.completed) {
      setCompletedIndices(today.completed);
    }
  }, [today?.completed]);

  // Real-time WebSocket event listener
  useEffect(() => {
    const handleWsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const payload = customEvent.detail;
      if (!payload) return;

      const section = payload.section;
      const data = payload.data || {};

      if (data.status === "refreshing") {
        setRefreshingSection((prev) => ({
          ...prev,
          [section]: true,
          ...(section === "all" ? { weather: true, news: true, suggestions: true } : {}),
        }));
        return;
      }

      setRefreshingSection((prev) => ({
        ...prev,
        [section]: false,
        ...(section === "all" ? { weather: false, news: false, suggestions: false } : {}),
      }));

      queryClient.setQueryData<DailySuggestionsPageResponse>(
        DAILY_SUGGESTIONS_QUERY_KEY,
        (old) => {
          if (!old) return old;

          const updatedToday = { ...old.today };

          if ((section === "weather" || section === "all") && data.weather) {
            updatedToday.weather = safeParseObject<WeatherData>(data.weather);
            updatedToday.date_weather = data.date_weather;
          }
          if ((section === "news" || section === "all") && data.news) {
            updatedToday.news = safeParseArray<NewsArticle>(data.news);
            updatedToday.date_news = data.date_news;
          }
          if ((section === "suggestions" || section === "all") && data.suggestions) {
            updatedToday.suggestions = safeParseArray<string>(data.suggestions);
            updatedToday.date_suggestions = data.date_suggestions;
            updatedToday.completed = [];
            setCompletedIndices([]);
          }
          if (section === "completion" && data.completed !== undefined) {
            const compList = Array.isArray(data.completed) ? (data.completed as number[]) : [];
            updatedToday.completed = compList;
            setCompletedIndices(compList);
          }

          return {
            ...old,
            today: updatedToday,
          };
        }
      );
    };

    window.addEventListener("mira:daily_suggestions_update", handleWsUpdate);
    return () => {
      window.removeEventListener("mira:daily_suggestions_update", handleWsUpdate);
    };
  }, [queryClient]);

  // Toggle completion handler with optimistic update
  const toggleSuggestionCompletion = useCallback(
    async (index: number) => {
      const currentSet = new Set(completedIndices);
      const isCurrentlyCompleted = currentSet.has(index);
      const nextState = !isCurrentlyCompleted;

      // Optimistic update
      if (nextState) {
        currentSet.add(index);
      } else {
        currentSet.delete(index);
      }
      const updatedList = Array.from(currentSet).sort((a, b) => a - b);
      setCompletedIndices(updatedList);

      try {
        const res = await dailySuggestionsService.completeSuggestion(
          index,
          nextState,
          today.id
        );
        if (res && res.completed) {
          setCompletedIndices(res.completed);
          queryClient.setQueryData<DailySuggestionsPageResponse>(
            DAILY_SUGGESTIONS_QUERY_KEY,
            (old) => {
              if (!old) return old;
              return {
                ...old,
                today: {
                  ...old.today,
                  completed: res.completed,
                },
              };
            }
          );
        }
      } catch (err) {
        console.error("Failed to persist suggestion completion:", err);
        // Rollback
        if (isCurrentlyCompleted) {
          currentSet.add(index);
        } else {
          currentSet.delete(index);
        }
        setCompletedIndices(Array.from(currentSet).sort((a, b) => a - b));
      }
    },
    [completedIndices, today.id, queryClient]
  );

  // Manual refresh trigger
  const handleRefresh = useCallback(
    async (section: "weather" | "news" | "suggestions" | "all" = "all") => {
      setRefreshingSection((prev) => ({
        ...prev,
        [section]: true,
        ...(section === "all" ? { weather: true, news: true, suggestions: true } : {}),
      }));

      try {
        await dailySuggestionsService.triggerRefresh(section);
        await refetch();
      } catch (err) {
        console.error(`Error refreshing ${section}:`, err);
      } finally {
        setRefreshingSection((prev) => ({
          ...prev,
          [section]: false,
          ...(section === "all" ? { weather: false, news: false, suggestions: false } : {}),
        }));
      }
    },
    [refetch]
  );

  // Proactively auto-refresh on mount if today's sections are empty
  const hasTriggeredInitialRefresh = useRef(false);

  useEffect(() => {
    if (!isPageLoading && pageData && !hasTriggeredInitialRefresh.current) {
      const hasSuggestions = today.suggestions && today.suggestions.length > 0;
      const hasNews = today.news && today.news.length > 0;
      const hasWeather = today.weather && (today.weather.current || today.weather.suggestion);

      if (!hasSuggestions || (isLocationConfigured && (!hasNews || !hasWeather))) {
        hasTriggeredInitialRefresh.current = true;
        if (isLocationConfigured) {
          handleRefresh("all");
        } else if (!hasSuggestions) {
          handleRefresh("suggestions");
        }
      }
    }
  }, [isPageLoading, pageData, today, isLocationConfigured, handleRefresh]);

  // Seamlessly update page when location is saved or updated in Me tab without requiring a manual refresh
  const prevLocationConfiguredRef = useRef<boolean | null>(null);
  const prevLocationKeyRef = useRef<string>("");

  useEffect(() => {
    if (isUserLoading) return;

    const locKey = `${userDetails?.city || ""}_${userDetails?.country || ""}_${userDetails?.latitude ?? ""}_${userDetails?.longitude ?? ""}`;

    if (prevLocationConfiguredRef.current !== null) {
      const becameConfigured = !prevLocationConfiguredRef.current && isLocationConfigured;
      const locationChanged =
        isLocationConfigured &&
        prevLocationKeyRef.current !== "" &&
        prevLocationKeyRef.current !== locKey;

      if (becameConfigured || locationChanged) {
        handleRefresh("all");
      }
    }

    prevLocationConfiguredRef.current = isLocationConfigured;
    prevLocationKeyRef.current = locKey;
  }, [isUserLoading, isLocationConfigured, userDetails, handleRefresh]);

  return {
    userDetails,
    isUserLoading,
    isLocationConfigured,
    today,
    previous,
    completedIndices,
    toggleSuggestionCompletion,
    refreshingSection,
    handleRefresh,
    isPageLoading,
    isError,
    error,
    refetch,
  };
}
