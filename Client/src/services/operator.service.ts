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

  async getMicrophoneStatus(): Promise<MicrophoneStatusResponse> {
    try {
      const response = await operatorApi.get<MicrophoneStatusResponse>("/microphone/status");
      return response.data;
    } catch {
      return {
        state: "off",
        is_on: false,
        auto_start: false,
        mic_auto_start: false,
      };
    }
  },

  async startMicrophone(): Promise<MicrophoneActionResponse> {
    const response = await operatorApi.post<MicrophoneActionResponse>("/microphone/start");
    return response.data;
  },

  async stopMicrophone(): Promise<MicrophoneActionResponse> {
    const response = await operatorApi.post<MicrophoneActionResponse>("/microphone/stop");
    return response.data;
  },

  async toggleMicrophone(nextState: "on" | "off"): Promise<MicrophoneActionResponse> {
    try {
      const response = await operatorApi.post<MicrophoneActionResponse>("/microphone/state", {
        state: nextState,
        is_on: nextState === "on",
      });
      return response.data;
    } catch {
      const fallbackEndpoint = nextState === "on" ? "/microphone/start" : "/microphone/stop";
      try {
        const response = await operatorApi.post<MicrophoneActionResponse>(fallbackEndpoint);
        return response.data;
      } catch {
        return {
          status: nextState === "on" ? "started" : "stopped",
          state: nextState,
          is_on: nextState === "on",
          message: `Microphone set to ${nextState}`,
        };
      }
    }
  },

  async getMicrophoneAutoStart(): Promise<MicrophoneAutoStartResponse> {
    try {
      const response = await operatorApi.get<MicrophoneAutoStartResponse>("/microphone/auto-start");
      return response.data;
    } catch {
      return { auto_start: false, mic_auto_start: false };
    }
  },

  async updateMicrophoneAutoStart(enabled: boolean): Promise<MicrophoneAutoStartResponse> {
    try {
      const response = await operatorApi.post<MicrophoneAutoStartResponse>("/microphone/auto-start", {
        auto_start: enabled,
        mic_auto_start: enabled,
      });
      // Also synchronize to Vault
      await vaultService.updateOperatorConfig({ mic_auto_start: enabled }).catch(() => {});
      return response.data;
    } catch {
      await vaultService.updateOperatorConfig({ mic_auto_start: enabled }).catch(() => {});
      return { auto_start: enabled, mic_auto_start: enabled };
    }
  },
};

export interface MicrophoneStatusResponse {
  service?: string;
  state: "on" | "off";
  is_on: boolean;
  auto_start: boolean;
  mic_auto_start?: boolean;
  message?: string;
}

export interface MicrophoneActionResponse {
  status: string;
  state: "on" | "off";
  is_on: boolean;
  message: string;
}

export interface MicrophoneAutoStartResponse {
  status?: string;
  auto_start: boolean;
  mic_auto_start?: boolean;
  message?: string;
}

