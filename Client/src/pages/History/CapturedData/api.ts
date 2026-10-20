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

/**
 * Fetch current Operator capturing status directly from Operator service.
 */
export async function fetchOperatorStatus(): Promise<OperatorStatusResponse> {
  try {
    const response = await operatorApi.get<OperatorStatusResponse>("/status");
    if (response.data && typeof response.data.is_running === "boolean") {
      return response.data;
    }
    return {
      status: "stopped",
      is_running: false,
      auto_start: false,
      capture_interval_secs: 10,
    };
  } catch {
    // If Operator service is offline or unreachable, capturing is stopped
    return {
      status: "stopped",
      is_running: false,
      auto_start: false,
      capture_interval_secs: 10,
    };
  }
}

/**
 * Start screen capture loop in Operator service.
 */
export async function startCapture(): Promise<void> {
  await operatorApi.get("/start");
}

/**
 * Stop screen capture loop in Operator service.
 */
export async function stopCapture(): Promise<void> {
  await operatorApi.get("/stop");
}
