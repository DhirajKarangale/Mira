import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vaultService } from "@/services";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { UserDetails, UserFormState } from "./types";

/**
 * Fetch and cache user details from Vault.
 * Stale time: 15 minutes.
 */
export function useUserDetailsQuery() {
  return useQuery<UserDetails>({
    queryKey: QUERY_KEYS.user.details,
    queryFn: () => vaultService.getUserDetails(),
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Mutation hook for saving user details in Vault.
 * Single, centralized API invocation via POST /user.
 * Optimistically updates the cache and ensures synchronization with Vault.
 */
export function useSaveUserDetailsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: UserFormState | { isAdd?: boolean; data: UserFormState }
    ): Promise<UserDetails> => {
      const data = "data" in payload && payload.data ? payload.data : (payload as UserFormState);
      return await vaultService.saveUserDetails(data);
    },
    onSuccess: (savedDetails) => {
      queryClient.setQueryData(QUERY_KEYS.user.details, savedDetails);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.user.details });
    },
  });
}
