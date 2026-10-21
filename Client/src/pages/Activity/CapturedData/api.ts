import { vaultService, operatorService } from "@/services";
import type {
  OperatorConfigResponse,
  OperatorStatusResponse,
  AppPermission,
  RefreshAppsResponse,
  UpdateAppPermissionResponse,
} from "./types";

export async function fetchOperatorConfig(): Promise<OperatorConfigResponse> {
  return vaultService.getConfig<OperatorConfigResponse>("operator");
}

export async function updateOperatorConfig(
  updates: Partial<OperatorConfigResponse>
): Promise<OperatorConfigResponse> {
  const result = await vaultService.updateOperatorConfig(updates);
  if (typeof updates.CAPTURE_INTERVAL_SECS === "number") {
    operatorService.updateInterval(updates.CAPTURE_INTERVAL_SECS).catch(() => {});
  }
  return result;
}

export async function syncOperatorInterval(seconds: number): Promise<void> {
  await operatorService.updateInterval(seconds);
}

export async function fetchOperatorStatus(): Promise<OperatorStatusResponse> {
  return operatorService.getStatus();
}

export async function startCapture(): Promise<void> {
  await operatorService.startCapture();
}

export async function stopCapture(): Promise<void> {
  await operatorService.stopCapture();
}

export async function fetchAppPermissions(): Promise<AppPermission[]> {
  return operatorService.getApps();
}

export async function refreshAppPermissions(): Promise<RefreshAppsResponse> {
  return operatorService.refreshApps();
}

export async function updateAppPermission(
  appId: string,
  allowedToCapture: boolean
): Promise<UpdateAppPermissionResponse> {
  return operatorService.updateAppPermission(appId, allowedToCapture);
}
