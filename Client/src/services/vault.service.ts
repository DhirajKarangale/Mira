import { vaultApi } from "@/lib/api";
import type { UserDetails, UserFormState } from "@/pages/User/types";
import type { OperatorConfigResponse } from "@/pages/Activity/CapturedData/types";
import type { RedisConfig } from "@/pages/Activity/Redis/types";
import type { LogConfig, LogEntry, LogFilters, LogsResponse } from "@/pages/Activity/Logs/types";

export interface VaultHealth {
  service: string;
  status: string;
}

export interface AIConfig {
  id?: number;
  llm_provider: string;
  total_keys: number;
  current_key: number;
  keys: string[];
}

export interface AIConfigUpdateRequest {
  llm_provider?: string;
  keys?: string[];
  add_keys?: string[];
  remove_keys?: string[];
  add_key?: string;
  remove_key?: string;
  current_key?: number;
  total_keys?: number;
}

export const vaultService = {
  async getHealth(): Promise<VaultHealth> {
    const response = await vaultApi.get<VaultHealth>("/health");
    return response.data;
  },

  async getUserDetails(): Promise<UserDetails> {
    const response = await vaultApi.get<UserDetails>("/user");
    return response.data;
  },

  async saveUserDetails(data: Partial<UserFormState>): Promise<UserDetails> {
    const response = await vaultApi.post<UserDetails>("/user", data);
    return response.data;
  },

  async getConfig<T>(key: string): Promise<T> {
    const response = await vaultApi.get<T>(`/config/${encodeURIComponent(key)}`);
    return response.data;
  },

  async updateOperatorConfig(
    updates: Partial<OperatorConfigResponse>
  ): Promise<OperatorConfigResponse> {
    const response = await vaultApi.post<OperatorConfigResponse>("/config/operator", updates);
    return response.data;
  },

  async updateMessageBrokerConfig(
    updates: Partial<RedisConfig>
  ): Promise<RedisConfig> {
    const response = await vaultApi.post<RedisConfig>("/config/message_broker", updates);
    return response.data;
  },

  async updateLogConfig(
    updates: Partial<LogConfig>
  ): Promise<LogConfig> {
    const response = await vaultApi.post<LogConfig>("/config/logs", updates);
    return response.data;
  },

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

  async getDetectedOs(): Promise<string> {
    const response = await vaultApi.get<string>("/os");
    return response.data;
  },

  async triggerRetentionCleanup(): Promise<{
    deleted_expired_count: number;
    deleted_invalid_count: number;
    retained_count: number;
  }> {
    const response = await vaultApi.post("/retention/cleanup");
    return response.data;
  },

  async getAIProviders(): Promise<string[]> {
    const response = await vaultApi.get<string[]>("/ai/providers");
    return response.data;
  },

  async getAllAIConfigs(): Promise<AIConfig[]> {
    const response = await vaultApi.get<AIConfig[]>("/ai/configs");
    return response.data;
  },

  async getAIConfig(provider: string): Promise<AIConfig> {
    const response = await vaultApi.get<AIConfig>(`/ai/configs/${encodeURIComponent(provider)}`);
    return response.data;
  },

  async updateAIConfig(
    provider: string,
    updates: AIConfigUpdateRequest
  ): Promise<AIConfig> {
    const response = await vaultApi.post<AIConfig>(
      `/ai/configs/${encodeURIComponent(provider)}`,
      updates
    );
    return response.data;
  },

  async createAIConfig(data: AIConfigUpdateRequest): Promise<AIConfig> {
    const response = await vaultApi.post<AIConfig>("/ai/configs", data);
    return response.data;
  },

  async deleteAIConfig(provider: string): Promise<{ status: string; message: string }> {
    const response = await vaultApi.delete<{ status: string; message: string }>(
      `/ai/configs/${encodeURIComponent(provider)}`
    );
    return response.data;
  },
};
