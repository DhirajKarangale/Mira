import { operatorApi } from "@/lib/api";
import { vaultService } from "./vault.service";
import type {
  OperatorConfigResponse,
  OperatorStatusResponse,
  AppPermission,
  RefreshAppsResponse,
  UpdateAppPermissionResponse,
} from "@/pages/Configurations/Capture/types";

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

export const operatorService = {
  async getHealth(): Promise<{ service: string; status: string }> {
    const response = await operatorApi.get<{ service: string; status: string }>("/health");
    return response.data;
  },

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

  async startCapture(): Promise<OperatorActionResponse> {
    const response = await operatorApi.post<OperatorActionResponse>("/start");
    return response.data;
  },

  async stopCapture(): Promise<OperatorActionResponse> {
    const response = await operatorApi.post<OperatorActionResponse>("/stop");
    return response.data;
  },

  async updateInterval(seconds: number): Promise<OperatorIntervalResponse> {
    const response = await operatorApi.post<OperatorIntervalResponse>("/interval", {
      capture_interval_secs: seconds,
    });
    return response.data;
  },

  async updateOperatorConfig(
    updates: Partial<OperatorConfigResponse>
  ): Promise<OperatorConfigResponse> {
    const result = await vaultService.updateOperatorConfig(updates);
    if (typeof updates.CAPTURE_INTERVAL_SECS === "number") {
      await this.updateInterval(updates.CAPTURE_INTERVAL_SECS).catch(() => {});
    }
    return result;
  },

  async deleteScreenshot(imagePath: string): Promise<void> {
    await operatorApi.post("/delete", { image_path: imagePath });
  },

  async getApps(): Promise<AppPermission[]> {
    const response = await operatorApi.get<AppPermission[]>("/apps");
    return response.data;
  },

  async refreshApps(): Promise<RefreshAppsResponse> {
    const response = await operatorApi.post<RefreshAppsResponse>("/apps/refresh");
    return response.data;
  },

  async updateAppPermission(
    appId: string,
    allowedToCapture: boolean
  ): Promise<UpdateAppPermissionResponse> {
    const response = await operatorApi.post<UpdateAppPermissionResponse>("/apps/permission", {
      app_id: appId,
      allowed_to_capture: allowedToCapture,
    });
    return response.data;
  },
};
