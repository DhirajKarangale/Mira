export type CaptureStatus = "Started" | "Stopped";

export interface OperatorConfigResponse {
  CAPTURE_INTERVAL_SECS?: number;
  AUTO_START?: boolean;
  IS_CAPTURING?: boolean;
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
