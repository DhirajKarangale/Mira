export interface RedisConfig {
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_DB: number;
  REDIS_PASSWORD: string | null;
  REDIS_PROTOCOL: number;
  REDIS_DECODE_RESPONSES: boolean;
  SERVER_HOST: string;
  SERVER_RELOAD: boolean;
}

export interface ConsumerGroup {
  group_name: string;
  stream_name: string;
  consumer_key: string;
  consumers_count: number;
  pending_messages_count: number;
  active_messages_count: number;
  total_messages_count: number;
  last_delivered_id: string;
  status: "active" | "idle" | "group_missing";
  is_registered: boolean;
  stream_exists: boolean;
}

export interface CleanResult {
  message: string;
  cleaned_count?: number;
  cleaned_groups?: number;
  group_name?: string;
  stream_name?: string;
}

export interface FormatResult {
  message: string;
  status: string;
  initialized_groups?: number;
}
