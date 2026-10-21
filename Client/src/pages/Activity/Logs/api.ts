import { vaultService } from "@/services";
import type { LogConfig, LogFilters, LogsResponse } from "./types";

export async function fetchLogConfig(): Promise<LogConfig> {
  return vaultService.getConfig<LogConfig>("logs");
}

export async function saveLogConfig(
  config: Partial<LogConfig>
): Promise<LogConfig> {
  return vaultService.updateLogConfig(config);
}

export async function fetchLogs(
  filters: LogFilters,
  page: number = 1,
  limit: number = 50
): Promise<LogsResponse> {
  return vaultService.getLogs(filters, page, limit);
}
