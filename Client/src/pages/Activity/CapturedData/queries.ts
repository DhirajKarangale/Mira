import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchOperatorConfig,
  updateOperatorConfig,
  fetchOperatorStatus,
  syncOperatorInterval,
  startCapture,
  stopCapture,
  fetchAppPermissions,
  refreshAppPermissions,
  updateAppPermission,
} from "./api";
import { QUERY_KEYS } from "@/lib/queryClient";
import type {
  OperatorConfigResponse,
  OperatorStatusResponse,
  CaptureStatus,
  AppPermission,
} from "./types";

export function useOperatorConfigQuery() {
  return useQuery<OperatorConfigResponse>({
    queryKey: QUERY_KEYS.operator.config,
    queryFn: fetchOperatorConfig,
    staleTime: 15 * 60 * 1000,
  });
}

export function useOperatorStatusQuery() {
  return useQuery<OperatorStatusResponse>({
    queryKey: QUERY_KEYS.operator.status,
    queryFn: fetchOperatorStatus,
    staleTime: 15 * 60 * 1000,
  });
}

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

export function useAppPermissionsQuery() {
  return useQuery<AppPermission[]>({
    queryKey: QUERY_KEYS.operator.apps,
    queryFn: fetchAppPermissions,
    staleTime: 60 * 1000,
    refetchOnMount: true,
  });
}

export function useRefreshAppPermissionsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshAppPermissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.apps });
    },
  });
}

export function useUpdateAppPermissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appId,
      allowedToCapture,
    }: {
      appId: string;
      allowedToCapture: boolean;
    }) => updateAppPermission(appId, allowedToCapture),
    onMutate: async ({ appId, allowedToCapture }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.operator.apps });
      const previous = queryClient.getQueryData<AppPermission[]>(
        QUERY_KEYS.operator.apps
      );

      queryClient.setQueryData<AppPermission[]>(
        QUERY_KEYS.operator.apps,
        (old = []) =>
          old.map((app) =>
            app.app_id.toLowerCase() === appId.toLowerCase()
              ? { ...app, allowed_to_capture: allowedToCapture }
              : app
          )
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.operator.apps, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.apps });
    },
  });
}
