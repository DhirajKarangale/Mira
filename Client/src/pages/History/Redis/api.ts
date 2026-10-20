import { vaultApi, messageBrokerApi } from "@/lib/api";
import type { RedisConfig, ConsumerGroup, CleanResult, FormatResult } from "./types";

/**
 * Fetch Redis and Message Broker configurations from Vault.
 */
export async function fetchRedisConfig(): Promise<RedisConfig> {
  const response = await vaultApi.get<RedisConfig>("/config/redis");
  return response.data;
}

/**
 * Update Redis configurations in Vault.
 */
export async function updateRedisConfig(
  updates: Partial<RedisConfig>
): Promise<RedisConfig> {
  const response = await vaultApi.post<RedisConfig>("/config/redis", updates);
  return response.data;
}

/**
 * Retrieve all Redis consumer groups with active and pending message counts from Message Broker.
 */
export async function fetchConsumerGroups(): Promise<ConsumerGroup[]> {
  const response = await messageBrokerApi.get<ConsumerGroup[]>("/redis/consumer-groups");
  return response.data;
}

/**
 * Delete a selected Redis consumer group from its stream.
 */
export async function deleteConsumerGroup(
  groupName: string,
  streamName?: string
): Promise<{ message: string; group_name: string; stream_name?: string }> {
  const response = await messageBrokerApi.delete("/redis/consumer-groups", {
    params: {
      group_name: groupName,
      ...(streamName ? { stream_name: streamName } : {}),
    },
  });
  return response.data;
}

/**
 * Clean pending or unprocessed messages for a specific consumer group or all consumer groups.
 */
export async function cleanPendingMessages(
  groupName?: string,
  streamName?: string
): Promise<CleanResult> {
  const response = await messageBrokerApi.post<CleanResult>("/redis/clean", {
    group_name: groupName || null,
    stream_name: streamName || null,
  });
  return response.data;
}

/**
 * Format Redis: Clear all streams and related data.
 */
export async function formatRedis(): Promise<FormatResult> {
  const response = await messageBrokerApi.post<FormatResult>("/redis/format");
  return response.data;
}
