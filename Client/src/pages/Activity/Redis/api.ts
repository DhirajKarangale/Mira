import { vaultService, brokerService } from "@/services";
import type { RedisConfig, ConsumerGroup, CleanResult, FormatResult } from "./types";

export async function fetchRedisConfig(): Promise<RedisConfig> {
  return vaultService.getConfig<RedisConfig>("message_broker");
}

export async function updateRedisConfig(
  updates: Partial<RedisConfig>
): Promise<RedisConfig> {
  return vaultService.updateMessageBrokerConfig(updates);
}

export async function fetchConsumerGroups(): Promise<ConsumerGroup[]> {
  return brokerService.getConsumerGroups();
}

export async function deleteConsumerGroup(
  groupName: string,
  streamName?: string
): Promise<{ message: string; group_name: string; stream_name?: string }> {
  return brokerService.deleteConsumerGroup(groupName, streamName);
}

export async function cleanPendingMessages(
  groupName?: string,
  streamName?: string
): Promise<CleanResult> {
  return brokerService.cleanPendingMessages(groupName, streamName);
}

export async function formatRedis(): Promise<FormatResult> {
  return brokerService.formatRedis();
}
