import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vaultService, brokerService } from "@/services";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { RedisConfig, ConsumerGroup } from "./types";

export function useRedisConfigQuery() {
  return useQuery<RedisConfig>({
    queryKey: QUERY_KEYS.redis.config,
    queryFn: () => vaultService.getConfig<RedisConfig>("message_broker"),
    staleTime: 15 * 60 * 1000,
  });
}

export function useConsumerGroupsQuery() {
  return useQuery<ConsumerGroup[]>({
    queryKey: QUERY_KEYS.redis.consumerGroups,
    queryFn: () => brokerService.getConsumerGroups(),
    staleTime: 15 * 60 * 1000,
  });
}

export function useUpdateRedisConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<RedisConfig>) => vaultService.updateMessageBrokerConfig(updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.redis.config, updated);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.config });
    },
  });
}

export function useDeleteConsumerGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupName, streamName }: { groupName: string; streamName?: string }) =>
      brokerService.deleteConsumerGroup(groupName, streamName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}

export function useCleanAllPelsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => brokerService.cleanAllPels(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}

export function useCleanPendingMessagesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      groupName,
      streamName,
      resetStream = false,
    }: {
      groupName?: string;
      streamName?: string;
      resetStream?: boolean;
    } = {}) => brokerService.cleanPendingMessages(groupName, streamName, resetStream),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}

export function useFormatRedisMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => brokerService.formatRedis(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.redis.consumerGroups });
    },
  });
}
