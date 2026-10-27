import { useMemo, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Mic,
  AudioLines,
  RefreshCw,
} from "lucide-react";
import {
  useMicrophoneStatusQuery,
  useToggleMicrophoneMutation,
  useUpdateMicrophoneAutoStartMutation,
  useVoiceModelsQuery,
  useUpdateVoiceModelMutation,
  useVoiceConfigQuery,
  useUpdateVoiceConfigMutation,
  useUpdateVoiceCurrentKeyMutation,
} from "./queries";
import { MicrophoneStatusHeader } from "./components/MicrophoneStatusHeader";
import { VoiceControlConfigCard } from "./components/VoiceControlConfigCard";
import { MicrophonePrivacyCard } from "./components/MicrophonePrivacyCard";
import { MicrophoneDeviceCard } from "./components/MicrophoneDeviceCard";
import { ElevenLabsTabContent } from "./components/ElevenLabsTabContent";
import type { VoiceConfigUpdateRequest } from "@/services";
import { toast } from "@/components";
import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/store/useVoiceStore";

export const MicrophonePage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    data: micStatus,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useMicrophoneStatusQuery();

  const {
    data: voiceConfig,
    isFetching: isVoiceConfigFetching,
    refetch: refetchVoiceConfig,
  } = useVoiceConfigQuery();

  const {
    data: voiceModels = [],
    isFetching: isVoiceModelsFetching,
    refetch: refetchVoiceModels,
  } = useVoiceModelsQuery();

  const toggleMicMutation = useToggleMicrophoneMutation();
  const updateAutoStartMutation = useUpdateMicrophoneAutoStartMutation();
  const updateVoiceModelMutation = useUpdateVoiceModelMutation();
  const updateVoiceConfigMutation = useUpdateVoiceConfigMutation();
  const updateVoiceCurrentKeyMutation = useUpdateVoiceCurrentKeyMutation();

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const currentSubTab = (pathSegments[2] || "microphone").toLowerCase();
  const isElevenLabsActive = currentSubTab === "elevenlabs";
  const isMicrophoneActive = !isElevenLabsActive;

  const isOn = useMemo(() => {
    if (!micStatus) return false;
    return Boolean(
      micStatus.is_on ||
      (typeof micStatus.state === "string" && micStatus.state.toLowerCase() === "on")
    );
  }, [micStatus]);

  const autoStart = Boolean(
    voiceConfig?.mic_auto_start ?? (micStatus?.auto_start || micStatus?.mic_auto_start)
  );

  const elevenLabsModel = useMemo(() => {
    return voiceModels.find((m) => m?.provider?.toLowerCase() === "elevenlabs") || null;
  }, [voiceModels]);

  const elevenLabsKeysCount = elevenLabsModel?.keys?.length ?? 0;

  const handleToggleStatus = async () => {
    if (toggleMicMutation.isPending) return;
    const nextState = isOn ? "off" : "on";
    try {
      await toggleMicMutation.mutateAsync(nextState);
      useVoiceStore.setState({ isMicOn: nextState === "on" });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to toggle microphone state.";
      toast.error(msg, { title: "Microphone Error" });
    }
  };

  const handleToggleAutoStart = async () => {
    if (updateAutoStartMutation.isPending || updateVoiceConfigMutation.isPending) return;
    const nextVal = !autoStart;
    try {
      await Promise.all([
        updateAutoStartMutation.mutateAsync(nextVal),
        updateVoiceConfigMutation.mutateAsync({ mic_auto_start: nextVal }),
      ]);
      useVoiceStore.setState({ micAutoStart: nextVal });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update microphone auto-start.";
      toast.error(msg, { title: "Configuration Error" });
    }
  };

  const handleUpdateVoiceConfig = async (updates: VoiceConfigUpdateRequest) => {
    try {
      await updateVoiceConfigMutation.mutateAsync(updates);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update voice configuration.";
      toast.error(msg, { title: "Voice Configuration Error" });
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([refetchStatus(), refetchVoiceModels(), refetchVoiceConfig()]);
    toast.info("Synchronized microphone status, voice settings, and credentials from Vault.", {
      title: "System Synchronization",
    });
  };

  const handleScrollToAdd = () => {
    const element = document.getElementById("card-add-key-elevenlabs");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = document.getElementById("input-new-elevenlabs-api-key");
      if (input) input.focus();
    }
  };

  const handleAddKey = async (newKey: string, makeActive: boolean) => {
    const currentKeys = elevenLabsModel?.keys ? [...elevenLabsModel.keys] : [];
    const updatedKeys = [...currentKeys, newKey];
    const currentKeyIndex = elevenLabsModel?.current_key ?? 0;
    const newActiveIndex = makeActive ? updatedKeys.length - 1 : currentKeyIndex;

    await updateVoiceModelMutation.mutateAsync({
      provider: "elevenlabs",
      updates: {
        keys: updatedKeys,
        current_key: newActiveIndex,
      },
    });
    useVoiceStore.getState().setKeys(updatedKeys, newActiveIndex);

    toast.success("New ElevenLabs API key successfully encrypted and stored in Vault.", {
      title: "Voice Model Config",
    });
  };

  const handleSetAsActive = async (index: number) => {
    if (!elevenLabsModel) return;
    const currentKeys = elevenLabsModel.keys || [];
    if (index < 0 || index >= currentKeys.length) return;

    try {
      await updateVoiceCurrentKeyMutation.mutateAsync({
        currentKey: index,
        provider: "elevenlabs",
      });
      useVoiceStore.getState().setKeys(currentKeys, index);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to set active ElevenLabs key.";
      toast.error(msg, { title: "Voice Model Config Error" });
    }
  };

  const handleUpdateKey = async (index: number, updatedKeyValue: string) => {
    if (!elevenLabsModel) return;
    const currentKeys = [...(elevenLabsModel.keys || [])];
    if (index < 0 || index >= currentKeys.length) return;

    currentKeys[index] = updatedKeyValue;

    await updateVoiceModelMutation.mutateAsync({
      provider: "elevenlabs",
      updates: {
        keys: currentKeys,
        current_key: elevenLabsModel.current_key ?? 0,
      },
    });

    toast.success(`Key #${index + 1} updated and encrypted in Vault.`, {
      title: "Voice Model Config",
    });
  };

  const handleRemoveKey = async (index: number) => {
    if (!elevenLabsModel) return;
    const currentKeys = [...(elevenLabsModel.keys || [])];
    if (index < 0 || index >= currentKeys.length) return;

    currentKeys.splice(index, 1);
    let nextActiveIndex = elevenLabsModel.current_key ?? 0;
    if (nextActiveIndex >= currentKeys.length) {
      nextActiveIndex = Math.max(0, currentKeys.length - 1);
    }

    await updateVoiceModelMutation.mutateAsync({
      provider: "elevenlabs",
      updates: {
        keys: currentKeys,
        current_key: nextActiveIndex,
      },
    });
    useVoiceStore.getState().setKeys(currentKeys, nextActiveIndex);

    toast.success("ElevenLabs API key removed from Vault.", {
      title: "Voice Model Config",
    });
  };

  return (
    <div
      id="subpage-microphone-configurations"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40 text-zinc-100"
    >
      {/* Top Header Bar with Sub-Tabs */}
      <div className="flex-none px-3.5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)] shrink-0">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Voice & Mic
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Vault & Operator
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Hardware speech capture, wake-word activation, voice output controls, and ElevenLabs API keys
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 max-w-full">
            {/* Top Sub-Tabs Bar: Microphone & ElevenLabs */}
            <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner max-w-full overflow-x-auto no-scrollbar">
              {/* Microphone Tab */}
              <button
                type="button"
                id="tab-btn-microphone"
                onClick={() => navigate("/configurations/voice")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  isMicrophoneActive
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm font-semibold shadow-violet-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Config</span>
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                    isMicrophoneActive
                      ? "bg-white/20 text-white font-bold"
                      : "bg-white/[0.06] text-zinc-400"
                  )}
                >
                  {isOn ? "ON" : "OFF"}
                </span>
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* ElevenLabs Tab */}
              <button
                type="button"
                id="tab-btn-elevenlabs"
                onClick={() => navigate("/configurations/voice/elevenlabs")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  isElevenLabsActive
                    ? "bg-sky-600 text-white shadow-sm font-semibold shadow-sky-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <AudioLines className="w-3.5 h-3.5" />
                <span>ElevenLabs</span>
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                    isElevenLabsActive
                      ? "bg-white/20 text-white font-bold"
                      : "bg-white/[0.06] text-zinc-400"
                  )}
                >
                  {elevenLabsKeysCount}
                </span>
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              id="btn-refresh-mic-and-voice"
              onClick={handleRefreshAll}
              disabled={statusFetching || isVoiceModelsFetching || isVoiceConfigFetching}
              title="Refresh status & keys from Vault"
              className="p-2 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw
                className={cn(
                  "w-4 h-4",
                  (statusFetching || isVoiceModelsFetching || isVoiceConfigFetching) &&
                  "animate-spin text-cyan-400"
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <div
        id="microphone-subpage-viewport"
        className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 sm:py-6"
      >
        <div className="max-w-7xl mx-auto space-y-6">
          {isElevenLabsActive ? (
            <ElevenLabsTabContent
              model={elevenLabsModel}
              onScrollToAdd={handleScrollToAdd}
              onSetAsActive={handleSetAsActive}
              onUpdateKey={handleUpdateKey}
              onRemoveKey={handleRemoveKey}
              onAddKey={handleAddKey}
              isUpdating={updateVoiceModelMutation.isPending}
            />
          ) : (
            <>
              {/* Hardware State & Auto-Start Header */}
              <MicrophoneStatusHeader
                isOn={isOn}
                stateLoading={toggleMicMutation.isPending}
                autoStart={autoStart}
                autoStartLoading={updateAutoStartMutation.isPending || updateVoiceConfigMutation.isPending}
                onToggleStatus={handleToggleStatus}
                onToggleAutoStart={handleToggleAutoStart}
                onRefresh={() => refetchStatus()}
                refreshing={statusFetching}
              />

              {/* Master Voice Control & Voice While Typing Configuration */}
              <VoiceControlConfigCard
                voiceConfig={voiceConfig}
                onUpdateVoiceConfig={handleUpdateVoiceConfig}
                isUpdating={updateVoiceConfigMutation.isPending}
              />

              {/* Hardware & Stream Metrics */}
              <MicrophoneDeviceCard isOn={isOn} autoStart={autoStart} />

              {/* Privacy and Local Processing Assurance */}
              <MicrophonePrivacyCard />
            </>
          )}

          <div className="pt-4 pb-2 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
            <span>MIRA Vault Engine</span>
            <span>•</span>
            <span>Speech Recognition & ElevenLabs Voice Synthesis</span>
            <span>•</span>
            <span>AES-256 Vault Encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MicrophonePage;
