import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vaultService, type AIConfig, type AIConfigUpdateRequest } from "@/services";
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
