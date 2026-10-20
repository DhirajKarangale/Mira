import { vaultApi } from "@/lib/api";
import type { LogConfig, LogEntry, LogFilters, LogsResponse } from "./types";

/**
 * Fetch all log configurations from Vault.
 */
export async function fetchLogConfig(): Promise<LogConfig> {
  const response = await vaultApi.get<LogConfig>("/config/logs");
  return response.data;
}

/**
 * Save / update log configurations in Vault via POST /config/logs.
 */
export async function saveLogConfig(
  config: Partial<LogConfig>
): Promise<LogConfig> {
  const response = await vaultApi.post<LogConfig>("/config/logs", config);
  return response.data;
}

/**
 * Fetch logs matching the specified filters and pagination from Vault.
 * Uses envelope=true to reliably retrieve total count and paged items across all browsers.
 * Returns the most recent logs first.
 */
export async function fetchLogs(
  filters: LogFilters,
  page: number = 1,
  limit: number = 50
): Promise<LogsResponse> {
  const params: Record<string, string | number | boolean> = {
    limit,
    page,
    envelope: true,
    module_name: filters.moduleName || "all",
  };

  if (filters.search && filters.search.trim()) {
    params.search = filters.search.trim();
  }

  if (filters.startDate) {
    params.start_date = filters.startDate;
  }

  if (filters.endDate) {
    params.end_date = filters.endDate;
  }

  const response = await vaultApi.get<
    | { items: LogEntry[]; total: number; page: number; limit: number }
    | LogEntry[]
  >("/logs", { params });

  if (
    response.data &&
    typeof response.data === "object" &&
    !Array.isArray(response.data) &&
    Array.isArray(response.data.items)
  ) {
    return {
      logs: response.data.items,
      total:
        typeof response.data.total === "number"
          ? response.data.total
          : response.data.items.length,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  if (Array.isArray(response.data)) {
    const rawTotal =
      (typeof (response.headers as any)?.get === "function"
        ? (response.headers as any).get("x-total-count")
        : undefined) ??
      response.headers["x-total-count"] ??
      (response.headers as any)["X-Total-Count"];

    let total = rawTotal ? parseInt(String(rawTotal), 10) : NaN;
    if (isNaN(total)) {
      // Fallback if CORS stripped header: if full page is returned, allow paging forward
      if (response.data.length === limit) {
        total = page * limit + 1;
      } else {
        total = (page - 1) * limit + response.data.length;
      }
    }

    return {
      logs: response.data,
      total,
      page,
      limit,
    };
  }

  return {
    logs: [],
    total: 0,
    page,
    limit,
  };
}
