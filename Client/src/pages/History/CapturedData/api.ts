import { vaultApi, operatorApi } from "@/lib/api";
import type { OperatorConfigResponse, OperatorStatusResponse } from "./types";

/**
 * Fetch Operator configuration from Vault (e.g. CAPTURE_INTERVAL_SECS, AUTO_START).
 */
export async function fetchOperatorConfig(): Promise<OperatorConfigResponse> {
  const response = await vaultApi.get<OperatorConfigResponse>("/config/operator");
  return response.data;
}

/**
 * Update Operator configuration in Vault (e.g. toggle AUTO_START).
 */
export async function updateOperatorConfig(
  updates: Partial<OperatorConfigResponse>
): Promise<OperatorConfigResponse> {
  const response = await vaultApi.post<OperatorConfigResponse>("/config/operator", updates);
  return response.data;
}

const STATUS_STORAGE_KEY = "mira_capture_status";

/**
 * Fetch current Operator capturing status.
 * Tries Operator service first, then Vault /operator/status and /config/operator,
 * with localStorage as an instantaneous fallback.
 */
export async function fetchOperatorStatus(): Promise<OperatorStatusResponse> {
  const localSaved = typeof window !== "undefined" ? localStorage.getItem(STATUS_STORAGE_KEY) : null;
  const localIsRunning = localSaved === "Started";

  // 1. Try Operator service directly (/status)
  try {
    const response = await operatorApi.get<OperatorStatusResponse>("/status");
    if (response.data && typeof response.data.is_running === "boolean") {
      // Sync localStorage with live operator state
      if (typeof window !== "undefined") {
        localStorage.setItem(STATUS_STORAGE_KEY, response.data.is_running ? "Started" : "Stopped");
      }
      return response.data;
    }
  } catch {
    // Operator might be running an older build or offline, continue to Vault
  }

  // 2. Query Vault /operator/status
  try {
    const vaultStatusRes = await vaultApi.get<OperatorStatusResponse>("/operator/status");
    if (vaultStatusRes.data && typeof vaultStatusRes.data.is_capturing === "boolean") {
      const isCapturing = vaultStatusRes.data.is_capturing;
      if (typeof window !== "undefined") {
        localStorage.setItem(STATUS_STORAGE_KEY, isCapturing ? "Started" : "Stopped");
      }
      return {
        status: isCapturing ? "started" : "stopped",
        is_running: isCapturing,
        is_capturing: isCapturing,
        auto_start: vaultStatusRes.data.auto_start,
        capture_interval_secs: vaultStatusRes.data.capture_interval_secs || 10,
      };
    }
  } catch {
    // Fall back to /config/operator
  }

  // 3. Query Vault /config/operator
  try {
    const vaultConfig = await fetchOperatorConfig();
    if (typeof vaultConfig.IS_CAPTURING === "boolean") {
      const isCapturing = vaultConfig.IS_CAPTURING;
      if (typeof window !== "undefined") {
        localStorage.setItem(STATUS_STORAGE_KEY, isCapturing ? "Started" : "Stopped");
      }
      return {
        status: isCapturing ? "started" : "stopped",
        is_running: isCapturing,
        is_capturing: isCapturing,
        auto_start: vaultConfig.AUTO_START,
        capture_interval_secs: vaultConfig.CAPTURE_INTERVAL_SECS || 10,
      };
    }
  } catch {
    // Vault offline or unreachable
  }

  // 4. Return local cached status
  return {
    status: localIsRunning ? "started" : "stopped",
    is_running: localIsRunning,
    is_capturing: localIsRunning,
    auto_start: false,
    capture_interval_secs: 10,
  };
}

/**
 * Persist capturing status to Vault, localStorage, and dispatch start/stop to Operator.
 */
export async function persistOperatorStatus(isCapturing: boolean): Promise<void> {
  const statusStr = isCapturing ? "Started" : "Stopped";

  // 1. Immediately store in localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem(STATUS_STORAGE_KEY, statusStr);
  }

  // 2. Persist to Vault /operator/status
  try {
    await vaultApi.post("/operator/status", {
      is_capturing: isCapturing,
      status: statusStr,
    });
  } catch {
    // Also try /config/operator
    try {
      await vaultApi.post("/config/operator", {
        IS_CAPTURING: isCapturing,
      });
    } catch (vaultErr) {
      console.warn("Could not persist capturing status to Vault:", vaultErr);
    }
  }

  // 3. Signal Operator service to start or stop capture loop
  try {
    if (isCapturing) {
      await operatorApi.get("/start");
    } else {
      await operatorApi.get("/stop");
    }
  } catch (opErr) {
    console.warn("Could not signal Operator service:", opErr);
  }
}

/**
 * Start screen capture loop in Operator service.
 */
export async function startCapture(): Promise<void> {
  return persistOperatorStatus(true);
}

/**
 * Stop screen capture loop in Operator service.
 */
export async function stopCapture(): Promise<void> {
  return persistOperatorStatus(false);
}
