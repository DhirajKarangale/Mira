import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  vaultService,
  type AIConfig,
  type AIConfigUpdateRequest,
  type EngineWorkersConfig,
  type EngineWorkersUpdateRequest,
} from "@/services";
import { QUERY_KEYS } from "@/lib/queryClient";

export function useAIProvidersQuery() {
  return useQuery<string[]>({
    queryKey: QUERY_KEYS.ai.providers,
    queryFn: () => vaultService.getAIProviders(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAIConfigsQuery() {
  return useQuery<AIConfig[]>({
    queryKey: QUERY_KEYS.ai.configs,
    queryFn: () => vaultService.getAllAIConfigs(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAIConfigQuery(provider: string) {
  return useQuery<AIConfig>({
    queryKey: QUERY_KEYS.ai.config(provider),
    queryFn: () => vaultService.getAIConfig(provider),
    enabled: Boolean(provider && provider.trim()),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAIConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      provider,
      updates,
    }: {
      provider: string;
      updates: AIConfigUpdateRequest;
    }): Promise<AIConfig> => {
      return await vaultService.updateAIConfig(provider, updates);
    },
    onSuccess: (updatedConfig, variables) => {
      const providerKey = variables.provider.toLowerCase();
      queryClient.setQueryData(QUERY_KEYS.ai.config(providerKey), updatedConfig);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.configs });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.config(providerKey) });
    },
  });
}

export function useCreateAIConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AIConfigUpdateRequest): Promise<AIConfig> => {
      return await vaultService.createAIConfig(data);
    },
    onSuccess: (createdConfig) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.providers });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.configs });
      queryClient.setQueryData(
        QUERY_KEYS.ai.config(createdConfig.llm_provider.toLowerCase()),
        createdConfig
      );
    },
  });
}

export function useDeleteAIConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: string) => {
      return await vaultService.deleteAIConfig(provider);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.all });
    },
  });
}

export function useAIPrioritiesQuery() {
  return useQuery<string[]>({
    queryKey: QUERY_KEYS.ai.priorities,
    queryFn: () => vaultService.getAIPriorities(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAIPrioritiesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (priorities: string[]): Promise<string[]> => {
      return await vaultService.updateAIPriorities(priorities);
    },
    onSuccess: (updatedPriorities) => {
      queryClient.setQueryData(QUERY_KEYS.ai.priorities, updatedPriorities);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.priorities });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ai.providers });
    },
  });
}

export function useEngineWorkersQuery() {
  return useQuery<EngineWorkersConfig>({
    queryKey: QUERY_KEYS.engine.workers,
    queryFn: () => vaultService.getEngineWorkers(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateEngineWorkersMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: EngineWorkersUpdateRequest): Promise<EngineWorkersConfig> => {
      return await vaultService.updateEngineWorkers(updates);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.engine.workers, updated);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.engine.workers });
    },
  });
}

