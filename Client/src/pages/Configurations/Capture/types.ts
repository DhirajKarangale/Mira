export type CaptureStatus = "Started" | "Stopped";

export interface OperatorConfigResponse {
  CAPTURE_INTERVAL_SECS?: number;
  AUTO_START?: boolean;
  KNOWLEDGE_BASE_RETENTION_PERIOD?: string;
  knowledge_base_retention_period?: string;
}

export const KB_RETENTION_OPTIONS = [
  { label: "Never auto delete", value: "Never auto delete", description: "Retain all memories indefinitely" },
  { label: "5 years", value: "5 years", description: "Auto-purge Knowledge Bases older than 5 years" },
  { label: "3 years", value: "3 years", description: "Auto-purge Knowledge Bases older than 3 years" },
  { label: "1 year", value: "1 year", description: "Auto-purge Knowledge Bases older than 1 year" },
  { label: "9 months", value: "9 months", description: "Auto-purge Knowledge Bases older than 9 months" },
  { label: "6 months", value: "6 months", description: "Auto-purge Knowledge Bases older than 6 months" },
  { label: "3 months", value: "3 months", description: "Auto-purge Knowledge Bases older than 3 months" },
] as const;

export type KBRetentionPeriod = typeof KB_RETENTION_OPTIONS[number]["value"];


export interface OperatorStatusResponse {
  status: string;
  is_running: boolean;
  is_capturing?: boolean;
  auto_start?: boolean;
  capture_interval_secs?: number;
}

export interface StoredDataRange {
  startDate: string;
  endDate: string;
  totalDays: number;
  hasData: boolean;
}

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
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

