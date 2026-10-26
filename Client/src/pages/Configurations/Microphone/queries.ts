import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { operatorService } from "@/services/operator.service";
import type { MicrophoneStatusResponse } from "@/services/operator.service";
import { QUERY_KEYS } from "@/lib/queryClient";

export function useMicrophoneStatusQuery() {
  return useQuery<MicrophoneStatusResponse>({
    queryKey: QUERY_KEYS.operator.microphoneStatus,
    queryFn: () => operatorService.getMicrophoneStatus(),
    staleTime: 10 * 1000,
    refetchOnMount: true,
  });
}

export function useToggleMicrophoneMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetState: "on" | "off") => {
      return await operatorService.toggleMicrophone(targetState);
    },
    onMutate: async (targetState: "on" | "off") => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.operator.microphoneStatus });
      const previous = queryClient.getQueryData<MicrophoneStatusResponse>(
        QUERY_KEYS.operator.microphoneStatus
      );

      const isOn = targetState === "on";
      queryClient.setQueryData<MicrophoneStatusResponse>(
        QUERY_KEYS.operator.microphoneStatus,
        (old) => ({
          ...old,
          state: targetState,
          is_on: isOn,
          auto_start: old?.auto_start ?? false,
        })
      );

      return { previous };
    },
    onError: (_err, _targetState, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          QUERY_KEYS.operator.microphoneStatus,
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.microphoneStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.status });
    },
  });
}

export function useUpdateMicrophoneAutoStartMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      return await operatorService.updateMicrophoneAutoStart(enabled);
    },
    onMutate: async (enabled: boolean) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.operator.microphoneStatus });
      const previous = queryClient.getQueryData<MicrophoneStatusResponse>(
        QUERY_KEYS.operator.microphoneStatus
      );

      queryClient.setQueryData<MicrophoneStatusResponse>(
        QUERY_KEYS.operator.microphoneStatus,
        (old) => ({
          ...old,
          state: old?.state ?? "off",
          is_on: old?.is_on ?? false,
          auto_start: enabled,
          mic_auto_start: enabled,
        })
      );

      return { previous };
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          QUERY_KEYS.operator.microphoneStatus,
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.microphoneStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.status });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.config });
    },
  });
}
