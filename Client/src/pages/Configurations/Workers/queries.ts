import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  vaultService,
  type EngineWorkersConfig,
  type EngineWorkersUpdateRequest,
} from "@/services";
import { QUERY_KEYS } from "@/lib/queryClient";

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
