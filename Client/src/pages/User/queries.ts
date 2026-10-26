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

      // Invalidate daily suggestions and trigger background refresh when location is configured
      // so the /mira page updates with fresh weather and news without requiring a manual refresh
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dailySuggestions.pageData });
      const hasLocation = Boolean(
        (savedDetails.city && savedDetails.city.trim()) ||
        (savedDetails.latitude != null && savedDetails.longitude != null)
      );
      if (hasLocation) {
        dailySuggestionsService.triggerRefresh("all").catch((err) => {
          console.debug("Background daily suggestions refresh failed:", err);
        });
      }
    },
  });
}
