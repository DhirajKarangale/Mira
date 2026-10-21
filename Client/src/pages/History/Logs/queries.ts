import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchLogConfig, saveLogConfig, fetchLogs } from "./api";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { LogConfig, LogFilters, LogsResponse } from "./types";

/**
 * Query hook for log configuration (show/store flags, log levels, max entries) from Vault.
 * Stale time: 5 minutes.
 */
export function useLogConfigQuery() {
  return useQuery<LogConfig>({
    queryKey: QUERY_KEYS.logs.config,
    queryFn: fetchLogConfig,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Mutation hook for saving log configurations to Vault.
 */
export function useSaveLogConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<LogConfig>) => saveLogConfig(config),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.logs.config, updated);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.logs.config });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.logs.all });
    },
  });
}

/**
 * Query hook for paginated and filtered application logs from Vault.
 * Uses keepPreviousData for butter-smooth pagination transitions without loading flash.
 * Cached for 15 minutes. Dedicated refresh button in LogFiltersBar handles on-demand reload.
 */
export function useLogsQuery(filters: LogFilters, page: number = 1, limit: number = 50) {
  const isEnabled = Boolean(filters.startDate && filters.endDate);

  return useQuery<LogsResponse>({
    queryKey: QUERY_KEYS.logs.list(
      {
        search: filters.search?.trim() || "",
        startDate: filters.startDate,
        endDate: filters.endDate,
        moduleName: filters.moduleName || "all",
      },
      page,
      limit
    ),
    queryFn: () => fetchLogs(filters, page, limit),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    staleTime: 15 * 60 * 1000,
  });
}
