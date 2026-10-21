import { operatorApi, vaultApi } from "@/lib/api";
import type {
  OperatorStatusResponse,
  AppPermission,
  RefreshAppsResponse,
  UpdateAppPermissionResponse,
} from "@/pages/History/CapturedData/types";

export interface OperatorIntervalResponse {
  capture_interval_secs: number;
  status: string;
  message?: string;
}

export interface OperatorActionResponse {
  status: string;
  message: string;
  capture_interval_secs?: number;
}

/**
 * Centralized Operator API Service
 * Single source of truth for all communications with the Rust Operator service (http://127.0.0.1:8002).
 */
export const operatorService = {
  /**
   * Fetch current live status of the screen capture engine.
   * Canonical: GET /status
   */
  async getStatus(): Promise<OperatorStatusResponse> {
    try {
      const response = await operatorApi.get<OperatorStatusResponse>("/status");
      const data = response.data;
      const isCapturing = Boolean(
        data.is_running ||
        data.is_capturing ||
        (typeof data.status === "string" && data.status.toLowerCase() === "started")
      );
      return {
        ...data,
        is_running: isCapturing,
        is_capturing: isCapturing,
        status: isCapturing ? "started" : "stopped",
      };
    } catch {
      return {
        status: "stopped",
        is_running: false,
        is_capturing: false,
        auto_start: false,
        capture_interval_secs: 10,
      };
    }
  },

  /**
   * Start automated background screen capture loop.
   * Canonical: POST /start
   */
  async startCapture(): Promise<OperatorActionResponse> {
    const response = await operatorApi.post<OperatorActionResponse>("/start");
    return response.data;
  },

  /**
   * Stop automated background screen capture loop.
   * Canonical: POST /stop
   */
  async stopCapture(): Promise<OperatorActionResponse> {
    const response = await operatorApi.post<OperatorActionResponse>("/stop");
    return response.data;
  },

  /**
   * Get current capture interval setting directly from Operator runtime.
   * Canonical: GET /interval
   */
  async getInterval(): Promise<OperatorIntervalResponse> {
    const response = await operatorApi.get<OperatorIntervalResponse>("/interval");
    return response.data;
  },

  /**
   * Update capture interval setting in Operator runtime.
   * Canonical: POST /interval
   */
  async updateInterval(seconds: number): Promise<OperatorIntervalResponse> {
    const response = await operatorApi.post<OperatorIntervalResponse>("/interval", {
      capture_interval_secs: seconds,
    });
    return response.data;
  },

  /**
   * Delete an archived local screenshot file.
   * Canonical: POST /delete
   */
  async deleteScreenshot(imagePath: string): Promise<void> {
    await operatorApi.post("/delete", { image_path: imagePath });
  },

  /**
   * Fetch all system applications and their capture permission status.
   * Canonical: GET /apps (Operator primary, Vault fallback)
   */
  async getApps(): Promise<AppPermission[]> {
    try {
      const response = await operatorApi.get<AppPermission[]>("/apps");
      return response.data;
    } catch {
      const vaultResponse = await vaultApi.get<AppPermission[]>("/apps");
      return vaultResponse.data;
    }
  },

  /**
   * Trigger discovery of installed applications and synchronize with Vault.
   * Canonical: POST /apps/refresh
   */
  async refreshApps(): Promise<RefreshAppsResponse> {
    try {
      const response = await operatorApi.post<RefreshAppsResponse>("/apps/refresh");
      return response.data;
    } catch {
      const vaultResponse = await vaultApi.post<RefreshAppsResponse>("/apps/refresh", []);
      return vaultResponse.data;
    }
  },

  /**
   * Update an application's allowed_to_capture permission status.
   * Canonical: POST /apps/permission
   */
  async updateAppPermission(
    appId: string,
    allowedToCapture: boolean
  ): Promise<UpdateAppPermissionResponse> {
    try {
      const response = await operatorApi.post<UpdateAppPermissionResponse>("/apps/permission", {
        app_id: appId,
        allowed_to_capture: allowedToCapture,
      });
      return response.data;
    } catch {
      const vaultResponse = await vaultApi.post<UpdateAppPermissionResponse>("/apps/permission", {
        app_id: appId,
        allowed_to_capture: allowedToCapture,
      });
      return vaultResponse.data;
    }
  },
};
