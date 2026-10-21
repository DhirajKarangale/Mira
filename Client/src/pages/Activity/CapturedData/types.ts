export type CaptureStatus = "Started" | "Stopped";

export interface OperatorConfigResponse {
  CAPTURE_INTERVAL_SECS?: number;
  AUTO_START?: boolean;
}

export interface OperatorStatusResponse {
  status: string;
  is_running: boolean;
  is_capturing?: boolean;
  auto_start?: boolean;
  capture_interval_secs?: number;
}

export interface StoredDataRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  hasData: boolean;
}

export interface DateRangeFilter {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface AppPermission {
  app_name: string;
  app_id: string;
  allowed_to_capture: boolean;
}

export interface RefreshAppsResponse {
  status: string;
  message: string;
  total_apps?: number;
  total?: number;
  added?: number;
  removed?: number;
  preserved?: number;
}

export interface UpdateAppPermissionRequest {
  app_id: string;
  allowed_to_capture: boolean;
}

export interface UpdateAppPermissionResponse {
  status: string;
  message: string;
  app_id?: string;
  allowed_to_capture?: boolean;
  app?: AppPermission;
}

export type AppFilterType = "all" | "allowed" | "restricted";

