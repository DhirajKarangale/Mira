import { vaultService, operatorService } from "@/services";
import type { OperatorConfigResponse, OperatorStatusResponse } from "./types";

/**
 * Fetch Operator configuration from Vault (e.g. CAPTURE_INTERVAL_SECS, AUTO_START).
 * Uses centralized vaultService (GET /config/operator).
 */
export async function fetchOperatorConfig(): Promise<OperatorConfigResponse> {
  return vaultService.getConfig<OperatorConfigResponse>("operator");
}

/**
 * Update Operator configuration in Vault (e.g. toggle AUTO_START or CAPTURE_INTERVAL_SECS).
 * Uses centralized vaultService (POST /config/operator).
 */
export async function updateOperatorConfig(
  updates: Partial<OperatorConfigResponse>
): Promise<OperatorConfigResponse> {
  const result = await vaultService.updateOperatorConfig(updates);
  if (typeof updates.CAPTURE_INTERVAL_SECS === "number") {
    operatorService.updateInterval(updates.CAPTURE_INTERVAL_SECS).catch(() => {});
  }
  return result;
}

/**
 * Synchronize live capture interval with Operator service directly.
 * Uses centralized operatorService (POST /interval).
 */
export async function syncOperatorInterval(seconds: number): Promise<void> {
  await operatorService.updateInterval(seconds);
}

/**
 * Fetch current Operator capturing status directly from Operator service.
 * Uses centralized operatorService (GET /status).
 */
export async function fetchOperatorStatus(): Promise<OperatorStatusResponse> {
  return operatorService.getStatus();
}

/**
 * Start screen capture loop in Operator service.
 * Uses centralized operatorService (POST /start).
 */
export async function startCapture(): Promise<void> {
  await operatorService.startCapture();
}

/**
 * Stop screen capture loop in Operator service.
 * Uses centralized operatorService (POST /stop).
 */
export async function stopCapture(): Promise<void> {
  await operatorService.stopCapture();
}
