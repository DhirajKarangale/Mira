import { vaultService, brokerService } from "@/services";
import type { RedisConfig, ConsumerGroup, CleanResult, FormatResult } from "./types";

/**
 * Fetch Redis and Message Broker configurations from Vault.
 * Uses centralized vaultService (GET /config/message_broker).
 */
export async function fetchRedisConfig(): Promise<RedisConfig> {
  return vaultService.getConfig<RedisConfig>("message_broker");
}

/**
 * Update Redis configurations in Vault.
 * Uses centralized vaultService (POST /config/message_broker).
 */
export async function updateRedisConfig(
  updates: Partial<RedisConfig>
): Promise<RedisConfig> {
  return vaultService.updateMessageBrokerConfig(updates);
}

/**
 * Retrieve all Redis consumer groups with active and pending message counts from Message Broker.
 * Uses centralized brokerService (GET /redis/consumer-groups).
 */
export async function fetchConsumerGroups(): Promise<ConsumerGroup[]> {
  return brokerService.getConsumerGroups();
}

/**
 * Delete a selected Redis consumer group from its stream.
 * Uses centralized brokerService (DELETE /redis/consumer-groups/{group_name}).
 */
export async function deleteConsumerGroup(
  groupName: string,
  streamName?: string
): Promise<{ message: string; group_name: string; stream_name?: string }> {
  return brokerService.deleteConsumerGroup(groupName, streamName);
}

/**
 * Clean pending or unprocessed messages for a specific consumer group or all consumer groups.
 * Uses centralized brokerService (POST /redis/clean).
 */
export async function cleanPendingMessages(
  groupName?: string,
  streamName?: string
): Promise<CleanResult> {
  return brokerService.cleanPendingMessages(groupName, streamName);
}

/**
 * Format Redis: Clear all streams and related data.
 * Uses centralized brokerService (POST /redis/format).
 */
export async function formatRedis(): Promise<FormatResult> {
  return brokerService.formatRedis();
}
