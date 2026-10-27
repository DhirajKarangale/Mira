import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { operatorService } from "@/services/operator.service";
import type { MicrophoneStatusResponse } from "@/services/operator.service";
import {
  vaultService,
  type VoiceModel,
  type VoiceModelUpdateRequest,
  type VoiceConfig,
  type VoiceConfigUpdateRequest,
} from "@/services";
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

export function useVoiceProvidersQuery() {
  return useQuery<string[]>({
    queryKey: QUERY_KEYS.voice.providers,
    queryFn: () => vaultService.getVoiceProviders(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useVoiceModelsQuery() {
  return useQuery<VoiceModel[]>({
    queryKey: QUERY_KEYS.voice.models,
    queryFn: () => vaultService.getAllVoiceModels(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useVoiceModelQuery(provider: string) {
  return useQuery<VoiceModel>({
    queryKey: QUERY_KEYS.voice.model(provider),
    queryFn: () => vaultService.getVoiceModel(provider),
    enabled: Boolean(provider && provider.trim()),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateVoiceModelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      provider,
      updates,
    }: {
      provider: string;
      updates: VoiceModelUpdateRequest;
    }): Promise<VoiceModel> => {
      return await vaultService.updateVoiceModel(provider, updates);
    },
    onSuccess: (updatedModel, variables) => {
      const providerKey = variables.provider.toLowerCase();
      queryClient.setQueryData(QUERY_KEYS.voice.model(providerKey), updatedModel);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice.models });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice.model(providerKey) });
    },
  });
}

export function useDeleteVoiceModelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: string) => {
      return await vaultService.deleteVoiceModel(provider);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice.all });
    },
  });
}

export function useVoiceConfigQuery() {
  return useQuery<VoiceConfig>({
    queryKey: QUERY_KEYS.voice.config,
    queryFn: () => vaultService.getVoiceConfig(),
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });
}

export function useUpdateVoiceConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: VoiceConfigUpdateRequest): Promise<VoiceConfig> => {
      return await vaultService.updateVoiceConfig(updates);
    },
    onMutate: async (updates: VoiceConfigUpdateRequest) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.voice.config });
      const previous = queryClient.getQueryData<VoiceConfig>(QUERY_KEYS.voice.config);

      queryClient.setQueryData<VoiceConfig>(QUERY_KEYS.voice.config, (old) => {
        const nextMaster = updates.voice_enable_master !== undefined ? updates.voice_enable_master : (old?.voice_enable_master ?? false);
        const nextWhileTyping = !nextMaster ? false : (updates.voice_enable_while_typing !== undefined ? updates.voice_enable_while_typing : (old?.voice_enable_while_typing ?? false));
        return {
          mic_auto_start: updates.mic_auto_start !== undefined ? updates.mic_auto_start : (old?.mic_auto_start ?? false),
          voice_enable_master: nextMaster,
          voice_enable_while_typing: nextWhileTyping,
        };
      });

      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.voice.config, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice.config });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.microphoneStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.config });
    },
  });
}


