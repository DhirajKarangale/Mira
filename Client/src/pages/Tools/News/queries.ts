import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  vaultService,
  type GNewsConfig,
  type GNewsConfigUpdateRequest,
} from "@/services";

export const GNEWS_QUERY_KEY = ["vault", "gnews", "config"] as const;
export const USER_DETAILS_KEY = ["vault", "user"] as const;

export function useGNewsConfigQuery() {
  return useQuery<GNewsConfig>({
    queryKey: GNEWS_QUERY_KEY,
    queryFn: () => vaultService.getGNewsConfig(),
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 10000,
    retry: 2,
  });
}

export function useUserDetailsQuery() {
  return useQuery({
    queryKey: USER_DETAILS_KEY,
    queryFn: () => vaultService.getUserDetails(),
    staleTime: 1000 * 60,
  });
}

export function useUpdateGNewsConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation<GNewsConfig, Error, GNewsConfigUpdateRequest>({
    mutationFn: async (updates: GNewsConfigUpdateRequest) => {
      return await vaultService.updateGNewsConfig(updates);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(GNEWS_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: GNEWS_QUERY_KEY });
    },
  });
}

export function useDeleteGNewsConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ status: string; message: string }, Error, void>({
    mutationFn: async () => {
      return await vaultService.deleteGNewsConfig();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GNEWS_QUERY_KEY });
    },
  });
}
