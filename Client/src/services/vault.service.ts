import { vaultApi } from "@/lib/api";
import type { UserDetails, UserFormState } from "@/pages/User/types";
import type { OperatorConfigResponse } from "@/pages/Activity/CapturedData/types";
import type { RedisConfig } from "@/pages/Activity/Redis/types";
import type { LogConfig, LogEntry, LogFilters, LogsResponse } from "@/pages/Activity/Logs/types";

/**
 * Centralized Vault API Service
 * Single source of truth for all communications with MIRA Vault (http://127.0.0.1:8001).
 */
export const vaultService = {
  // -------------------------------------------------------------
  // User Profile Endpoints
  // -------------------------------------------------------------

  /**
   * Fetch user details from Vault.
   * Canonical: GET /user
   */
  async getUserDetails(): Promise<UserDetails> {
    const response = await vaultApi.get<UserDetails>("/user");
    return response.data;
  },

  /**
   * Save or update user profile in Vault.
   * Canonical: POST /user
   */
  async saveUserDetails(data: Partial<UserFormState>): Promise<UserDetails> {
    const response = await vaultApi.post<UserDetails>("/user", data);
    return response.data;
  },

  // -------------------------------------------------------------
  // System Configurations Endpoints
  // -------------------------------------------------------------

  /**
   * Retrieve any module configuration by key from encrypted SQL storage.
   * Canonical: GET /config/{key}
   */
  async getConfig<T>(key: string): Promise<T> {
    const response = await vaultApi.get<T>(`/config/${encodeURIComponent(key)}`);
    return response.data;
  },

  /**
   * Update Operator configurations in Vault.
   * Canonical: POST /config/operator
   */
  async updateOperatorConfig(
    updates: Partial<OperatorConfigResponse>
  ): Promise<OperatorConfigResponse> {
    const response = await vaultApi.post<OperatorConfigResponse>("/config/operator", updates);
    return response.data;
  },

  /**
   * Update Message Broker (Redis) configurations in Vault.
   * Canonical: POST /config/message_broker
   */
  async updateMessageBrokerConfig(
    updates: Partial<RedisConfig>
  ): Promise<RedisConfig> {
    const response = await vaultApi.post<RedisConfig>("/config/message_broker", updates);
    return response.data;
  },

  /**
   * Update Log retention and module stream settings in Vault.
   * Canonical: POST /config/logs
   */
  async updateLogConfig(
    updates: Partial<LogConfig>
  ): Promise<LogConfig> {
    const response = await vaultApi.post<LogConfig>("/config/logs", updates);
    return response.data;
  },

  // -------------------------------------------------------------
  // Encrypted System Logs Endpoints
  // -------------------------------------------------------------

  /**
   * Fetch logs matching query filters and pagination.
   * Canonical: GET /logs
   */
  async getLogs(
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

      const total = rawTotal ? parseInt(String(rawTotal), 10) : response.data.length;

      return {
        logs: response.data,
        total: isNaN(total) ? response.data.length : total,
        page,
        limit,
      };
    }

    return {
      logs: [],
      total: 0,
      page: 1,
      limit: 50,
    };
  },

  /**
   * Detect OS running on host via Vault.
   * Canonical: GET /os
   */
  async getDetectedOs(): Promise<string> {
    const response = await vaultApi.get<string>("/os");
    return response.data;
  },

  /**
   * Trigger retention cleanup manually.
   * Canonical: POST /retention/cleanup
   */
  async triggerRetentionCleanup(): Promise<{
    deleted_expired_count: number;
    deleted_invalid_count: number;
    retained_count: number;
  }> {
    const response = await vaultApi.post("/retention/cleanup");
    return response.data;
  },
};
