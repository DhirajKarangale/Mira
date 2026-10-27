import { useState, useEffect, type FC } from "react";
import {
  useMicrophoneStatusQuery,
  useToggleMicrophoneMutation,
  useUpdateMicrophoneAutoStartMutation,
} from "./queries";
import { MicrophoneStatusHeader } from "./components/MicrophoneStatusHeader";
import { MicrophonePrivacyCard } from "./components/MicrophonePrivacyCard";
import { MicrophoneDeviceCard } from "./components/MicrophoneDeviceCard";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { toast } from "@/components";

export const MicrophonePage: FC = () => {
  const {
    data: micStatus,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useMicrophoneStatusQuery();

  const toggleMicMutation = useToggleMicrophoneMutation();
  const updateAutoStartMutation = useUpdateMicrophoneAutoStartMutation();
  const { isMicOn: isOn, toggleListening } = useSpeechRecognition(true);

  const [autoStart, setAutoStart] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mira_mic_auto_start");
      if (stored !== null) return stored === "true";
    }
    return Boolean(micStatus?.auto_start || micStatus?.mic_auto_start);
  });

  useEffect(() => {
    if (micStatus?.auto_start !== undefined || micStatus?.mic_auto_start !== undefined) {
      const serverVal = Boolean(micStatus.auto_start || micStatus.mic_auto_start);
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("mira_mic_auto_start");
        if (stored !== null) {
          setAutoStart(stored === "true");
          return;
        }
      }
      setAutoStart(serverVal);
    }
  }, [micStatus]);

  const handleToggleStatus = () => {
    toggleListening();
    toast.success(
      !isOn
        ? "Microphone turned on. Wake word listening active ('Mira')."
        : "Microphone turned off. Voice input paused.",
      { title: "Microphone Control" }
    );
  };

  const handleToggleAutoStart = async () => {
    const nextVal = !autoStart;
    setAutoStart(nextVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("mira_mic_auto_start", String(nextVal));
      window.dispatchEvent(
        new CustomEvent("mira-auto-start-change", { detail: { autoStart: nextVal } })
      );
    }
    try {
      await updateAutoStartMutation.mutateAsync(nextVal);
      toast.success(
        nextVal
          ? "Microphone Auto-Start enabled (activates on startup)."
          : "Microphone Auto-Start disabled.",
        { title: "Auto-Start Setting" }
      );
    } catch {
      toast.success(
        nextVal
          ? "Microphone Auto-Start enabled locally."
          : "Microphone Auto-Start disabled locally.",
        { title: "Auto-Start Setting" }
      );
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

        <MicrophonePrivacyCard />
      </div>
    </div>
  );
};
