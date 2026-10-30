import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { operatorService } from "@/services/operator.service";
import type { MicrophoneStatusResponse } from "@/services/operator.service";
import {
  vaultService,
  type VoiceModel,
  type VoiceModelUpdateRequest,
  type VoiceConfig,
  type VoiceConfigUpdateRequest,
  type VoiceKeysResponse,
} from "@/services";
import { QUERY_KEYS } from "@/lib/queryClient";
import { useVoiceStore } from "@/store/useVoiceStore";

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
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
}

export function useVoiceModelsQuery() {
  return useQuery<VoiceModel[]>({
    queryKey: QUERY_KEYS.voice.models,
    queryFn: () => vaultService.getAllVoiceModels(),
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });
}

export function useVoiceModelQuery(provider: string) {
  return useQuery<VoiceModel>({
    queryKey: QUERY_KEYS.voice.model(provider),
    queryFn: () => vaultService.getVoiceModel(provider),
    enabled: Boolean(provider && provider.trim()),
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
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
    queryFn: async () => {
      const cfg = await vaultService.getVoiceConfig();
      useVoiceStore.setState({
        voiceEnableMaster: cfg.voice_enable_master,
        voiceEnableWhileTyping: cfg.voice_enable_while_typing,
        voiceModelId: cfg.voice_model_id ?? "",
        micAutoStart: cfg.mic_auto_start,
      });
      return cfg;
    },
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

      const nextMaster =
        updates.voice_enable_master !== undefined
          ? updates.voice_enable_master
          : (previous?.voice_enable_master ?? false);
      const nextWhileTyping = !nextMaster
        ? false
        : updates.voice_enable_while_typing !== undefined
        ? updates.voice_enable_while_typing
        : (previous?.voice_enable_while_typing ?? false);
      const nextModelId =
        updates.voice_model_id !== undefined
          ? updates.voice_model_id
          : (previous?.voice_model_id ?? "");

      queryClient.setQueryData<VoiceConfig>(QUERY_KEYS.voice.config, (old) => {
        return {
          mic_auto_start:
            updates.mic_auto_start !== undefined
              ? updates.mic_auto_start
              : (old?.mic_auto_start ?? false),
          voice_enable_master: nextMaster,
          voice_enable_while_typing: nextWhileTyping,
          voice_model_id: nextModelId,
        };
      });

      // Synchronously update runtime useVoiceStore
      useVoiceStore.setState((s) => ({
        voiceEnableMaster: nextMaster,
        voiceEnableWhileTyping: nextWhileTyping,
        voiceModelId: nextModelId,
        micAutoStart:
          updates.mic_auto_start !== undefined ? updates.mic_auto_start : s.micAutoStart,
      }));

      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.voice.config, updated);
      useVoiceStore.setState({
        voiceEnableMaster: updated.voice_enable_master,
        voiceEnableWhileTyping: updated.voice_enable_while_typing,
        voiceModelId: updated.voice_model_id ?? "",
        micAutoStart: updated.mic_auto_start,
      });
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.voice.config, context.previous);
        useVoiceStore.setState({
          voiceEnableMaster: context.previous.voice_enable_master,
          voiceEnableWhileTyping: context.previous.voice_enable_while_typing,
          voiceModelId: context.previous.voice_model_id ?? "",
          micAutoStart: context.previous.mic_auto_start,
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice.config });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.microphoneStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.operator.config });
    },
  });
}

export function useVoiceKeysQuery(provider = "elevenlabs") {
  return useQuery<VoiceKeysResponse>({
    queryKey: [...QUERY_KEYS.voice.all, "keys", provider],
    queryFn: async () => {
      const res = await vaultService.getVoiceKeys(provider);
      if (res?.keys) {
        useVoiceStore.getState().setKeys(res.keys, res.current_key);
      }
      return res;
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateVoiceCurrentKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      currentKey,
      provider = "elevenlabs",
    }: {
      currentKey: number;
      provider?: string;
    }): Promise<VoiceKeysResponse> => {
      return await vaultService.updateVoiceCurrentKey(currentKey, provider);
    },
    onSuccess: (data, variables) => {
      const providerKey = (variables.provider || "elevenlabs").toLowerCase();
      queryClient.setQueryData([...QUERY_KEYS.voice.all, "keys", providerKey], data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice.all });
      if (data?.keys) {
        useVoiceStore.getState().setKeys(data.keys, data.current_key);
      }
    },
  });
}


