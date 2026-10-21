import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchOperatorConfig,
  updateOperatorConfig,
  fetchOperatorStatus,
  syncOperatorInterval,
  startCapture,
  stopCapture,
} from "./api";
import { QUERY_KEYS } from "@/lib/queryClient";
import type { OperatorConfigResponse, OperatorStatusResponse, CaptureStatus } from "./types";

/**
 * Query hook for Operator configuration stored in Vault.
 * Stale time: 1 minute.
 */
export function useOperatorConfigQuery() {
  return useQuery<OperatorConfigResponse>({
    queryKey: QUERY_KEYS.operator.config,
    queryFn: fetchOperatorConfig,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Operator capturing status query.
 * Cached for 15 minutes; manual button and mutations handle state changes with zero unnecessary network traffic.
 */
export function useOperatorStatusQuery() {
  return useQuery<OperatorStatusResponse>({
    queryKey: QUERY_KEYS.operator.status,
    queryFn: fetchOperatorStatus,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Mutation hook for updating Operator config in Vault (AUTO_START, CAPTURE_INTERVAL_SECS).
 */
export function useUpdateOperatorConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<OperatorConfigResponse>) => updateOperatorConfig(updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.operator.config, updated);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.config });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.status });
    },
  });
}

/**
 * Mutation hook for toggling Operator capturing (Started <-> Stopped).
 * Applies optimistic update on status for instant zero-latency UI feedback,
 * then reconciles with Operator's actual status.
 */
export function useToggleCaptureMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetStatus: CaptureStatus) => {
      if (targetStatus === "Started") {
        return await startCapture();
      }
      return await stopCapture();
    },
    onMutate: async (targetStatus: CaptureStatus) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.operator.status });
      const previous = queryClient.getQueryData<OperatorStatusResponse>(QUERY_KEYS.operator.status);

      const isCapturing = targetStatus === "Started";
      queryClient.setQueryData<OperatorStatusResponse>(QUERY_KEYS.operator.status, (old) => ({
        ...old,
        status: isCapturing ? "started" : "stopped",
        is_running: isCapturing,
        is_capturing: isCapturing,
      }));

      return { previous };
    },
    onError: (_err, _targetStatus, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.operator.status, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.status });
    },
  });
}

/**
 * Mutation hook for updating live capture interval in Operator.
 */
export function useSyncIntervalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seconds: number) => syncOperatorInterval(seconds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.status });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.config });
    },
  });
}
