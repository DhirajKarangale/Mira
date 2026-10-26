import { useMemo, type FC } from "react";
import {
  useMicrophoneStatusQuery,
  useToggleMicrophoneMutation,
  useUpdateMicrophoneAutoStartMutation,
} from "./queries";
import { MicrophoneStatusHeader } from "./components/MicrophoneStatusHeader";
import { MicrophonePrivacyCard } from "./components/MicrophonePrivacyCard";
import { MicrophoneDeviceCard } from "./components/MicrophoneDeviceCard";
import { MicrophoneTranscriptionsCard } from "./components/MicrophoneTranscriptionsCard";
import { ElevenLabsVoiceCard } from "./components/ElevenLabsVoiceCard";
import { transcribeManager } from "@/utils/transcribe";
import { toast } from "@/components";

export const MicrophonePage: FC = () => {
  const {
    data: micStatus,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useMicrophoneStatusQuery();

  const toggleMicMutation = useToggleMicrophoneMutation();
  const updateAutoStartMutation = useUpdateMicrophoneAutoStartMutation();

  const isOn = useMemo(() => {
    if (!micStatus) return false;
    return Boolean(
      micStatus.is_on ||
      (typeof micStatus.state === "string" && micStatus.state.toLowerCase() === "on")
    );
  }, [micStatus]);

  const autoStart = Boolean(micStatus?.auto_start || micStatus?.mic_auto_start);

  const handleToggleStatus = async () => {
    if (toggleMicMutation.isPending) return;
    const nextState = isOn ? "off" : "on";
    try {
      if (nextState === "off") {
        transcribeManager.stop();
      } else {
        transcribeManager.start();
      }
      await toggleMicMutation.mutateAsync(nextState);
      toast.success(
        nextState === "on"
          ? "Microphone turned on. Wake word listening active ('Mira')."
          : "Microphone turned off. Voice input paused.",
        { title: "Microphone Control" }
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to toggle microphone state.";
      toast.error(msg, { title: "Microphone Error" });
    }
  };

  const handleToggleAutoStart = async () => {
    if (updateAutoStartMutation.isPending) return;
    const nextVal = !autoStart;
    try {
      await updateAutoStartMutation.mutateAsync(nextVal);
      toast.success(
        nextVal
          ? "Microphone Auto-Start enabled (activates on Operator boot)."
          : "Microphone Auto-Start disabled.",
        { title: "Auto-Start Setting" }
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update microphone auto-start.";
      toast.error(msg, { title: "Configuration Error" });
    }
  };

  const handleRefreshAll = async () => {
    try {
      await refetchStatus();
      window.dispatchEvent(new CustomEvent("mira:refresh-transcriptions"));
      toast.success("Microphone status & transcriptions refreshed");
    } catch {
      toast.error("Failed to refresh status");
    }
  };

  return (
    <div
      id="subpage-microphone-configurations"
      className="h-full w-full overflow-y-auto px-6 py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <MicrophoneStatusHeader
          isOn={isOn}
          stateLoading={toggleMicMutation.isPending}
          autoStart={autoStart}
          autoStartLoading={updateAutoStartMutation.isPending}
          onToggleStatus={handleToggleStatus}
          onToggleAutoStart={handleToggleAutoStart}
          onRefresh={handleRefreshAll}
          refreshing={statusFetching}
        />

        <MicrophoneDeviceCard isOn={isOn} autoStart={autoStart} />

        <MicrophoneTranscriptionsCard isOn={isOn} />

        <ElevenLabsVoiceCard />

        <MicrophonePrivacyCard />
      </div>
    </div>
  );
};

export default MicrophonePage;
