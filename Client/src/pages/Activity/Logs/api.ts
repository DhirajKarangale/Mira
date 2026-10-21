import { vaultService } from "@/services";
import type { LogConfig, LogFilters, LogsResponse } from "./types";

/**
 * Fetch all log configurations from Vault.
 * Uses centralized vaultService (GET /config/logs).
 */
export async function fetchLogConfig(): Promise<LogConfig> {
  return vaultService.getConfig<LogConfig>("logs");
}

/**
 * Save / update log configurations in Vault.
 * Uses centralized vaultService (POST /config/logs).
 */
export async function saveLogConfig(
  config: Partial<LogConfig>
): Promise<LogConfig> {
  return vaultService.updateLogConfig(config);
}

/**
 * Fetch logs matching the specified filters and pagination from Vault.
 * Uses centralized vaultService (GET /logs).
 */
export async function fetchLogs(
  filters: LogFilters,
  page: number = 1,
  limit: number = 50
): Promise<LogsResponse> {
  return vaultService.getLogs(filters, page, limit);
}
