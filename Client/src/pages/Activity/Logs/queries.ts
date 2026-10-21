import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchLogConfig, saveLogConfig, fetchLogs } from "./api";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { LogConfig, LogFilters, LogsResponse } from "./types";

export function useLogConfigQuery() {
  return useQuery<LogConfig>({
    queryKey: QUERY_KEYS.logs.config,
    queryFn: fetchLogConfig,
    staleTime: 15 * 60 * 1000,
  });
}

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
