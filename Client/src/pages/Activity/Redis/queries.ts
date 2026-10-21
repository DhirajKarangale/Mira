import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchRedisConfig,
  updateRedisConfig,
  fetchConsumerGroups,
  deleteConsumerGroup,
  cleanPendingMessages,
  formatRedis,
} from "./api";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { RedisConfig, ConsumerGroup } from "./types";

/**
 * Query hook for Redis server configurations stored in Vault.
 * Stale time: 5 minutes.
 */
export function useRedisConfigQuery() {
  return useQuery<RedisConfig>({
    queryKey: QUERY_KEYS.redis.config,
    queryFn: fetchRedisConfig,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Query hook for Redis consumer groups and stream counts from Message Broker.
 * Cached for 15 minutes. Manual refresh button in ConsumerGroupsCard and mutations handle updates.
 */
export function useConsumerGroupsQuery() {
  return useQuery<ConsumerGroup[]>({
    queryKey: QUERY_KEYS.redis.consumerGroups,
    queryFn: fetchConsumerGroups,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Mutation hook for updating Redis configuration in Vault.
 */
export function useUpdateRedisConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<RedisConfig>) => updateRedisConfig(updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.redis.config, updated);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.config });
    },
  });
}

/**
 * Mutation hook for deleting a Redis consumer group from a stream.
 */
export function useDeleteConsumerGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupName, streamName }: { groupName: string; streamName?: string }) =>
      deleteConsumerGroup(groupName, streamName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}

/**
 * Mutation hook for cleaning pending messages across streams or groups.
 */
export function useCleanPendingMessagesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupName, streamName }: { groupName?: string; streamName?: string } = {}) =>
      cleanPendingMessages(groupName, streamName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}

/**
 * Mutation hook for formatting / flushing Redis stream data.
 */
export function useFormatRedisMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => formatRedis(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}
