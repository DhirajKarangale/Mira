export interface LogConfig {
  retention_period: number;
  show_logs_operator: boolean;
  show_logs_engine: boolean;
  show_logs_memory: boolean;
  show_logs_client: boolean;
  show_logs_message_broker: boolean;
  store_logs_operator: boolean;
  store_logs_engine: boolean;
  store_logs_memory: boolean;
  store_logs_client: boolean;
  store_logs_message_broker: boolean;
}

export interface LogEntry {
  id: number;
  module_name: string;
  timestamp: string;
  data: string;
}

export interface LogFilters {
  search: string;
  startDate: string;
  endDate: string;
  moduleName: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
}
