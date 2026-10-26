import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vaultService } from "@/services";
import { dailySuggestionsService } from "@/services/dailySuggestions.service";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { UserDetails, UserFormState } from "./types";

export function useUserDetailsQuery() {
  return useQuery<UserDetails>({
    queryKey: QUERY_KEYS.user.details,
    queryFn: () => vaultService.getUserDetails(),
    staleTime: 15 * 60 * 1000,
  });
}

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

      // Invalidate daily suggestions and trigger background refresh with updated location
      // so the form closes immediately without blocking on weather/news/suggestions APIs
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dailySuggestions.pageData });

      const hasLocation = Boolean(
        (savedDetails.city && savedDetails.city.trim()) ||
        (savedDetails.latitude != null && savedDetails.longitude != null)
      );
      if (hasLocation) {
        Promise.all([
          dailySuggestionsService.triggerRefresh("weather"),
          dailySuggestionsService.triggerRefresh("news"),
        ])
          .catch((err) => {
            console.debug("Background weather/news refresh failed:", err);
          })
          .finally(() => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dailySuggestions.pageData });
            queryClient.refetchQueries({ queryKey: QUERY_KEYS.dailySuggestions.pageData });
          });
      }
    },
  });
}
