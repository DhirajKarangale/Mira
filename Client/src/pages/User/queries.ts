import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUserDetails, addUserDetails, updateUserDetails } from "./api";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { UserDetails, UserFormState } from "./types";

/**
 * Fetch and cache user details from Vault.
 * Stale time: 5 minutes. Retained in cache for 10 minutes.
 */
export function useUserDetailsQuery() {
  return useQuery<UserDetails>({
    queryKey: QUERY_KEYS.user.details,
    queryFn: fetchUserDetails,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Mutation hook for creating or updating user details in Vault.
 * Optimistically updates the cache and ensures synchronization with Vault.
 */
export function useSaveUserDetailsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      isAdd,
      data,
    }: {
      isAdd: boolean;
      data: UserFormState;
    }): Promise<UserDetails> => {
      if (isAdd) {
        return await addUserDetails(data);
      }
      return await updateUserDetails(data);
    },
    onSuccess: (savedDetails) => {
      queryClient.setQueryData(QUERY_KEYS.user.details, savedDetails);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.user.details });
    },
  });
}
