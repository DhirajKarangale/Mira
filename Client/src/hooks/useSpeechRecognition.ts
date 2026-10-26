import { useEffect, useState, useCallback, useRef } from "react";
import { transcribeManager, type TranscribeRecord } from "@/utils/transcribe";
import { useMicrophoneStatusQuery, useToggleMicrophoneMutation } from "@/pages/Configurations/Microphone/queries";

export function useSpeechRecognition(autoSyncWithOperator: boolean = true) {
  const { data: micStatus } = useMicrophoneStatusQuery();
  const toggleMicMutation = useToggleMicrophoneMutation();

  const isOperatorMicOn = Boolean(
    micStatus?.is_on ||
    (typeof micStatus?.state === "string" && micStatus.state.toLowerCase() === "on")
  );

  const [isListening, setIsListening] = useState<boolean>(transcribeManager.getIsListening());
  const [latestTranscript, setLatestTranscript] = useState<TranscribeRecord | null>(null);

  // Active mic status: true if speech recognition manager is active or operator reports ON
  const isMicOn = isListening || isOperatorMicOn;

  // Sync with transcribeManager state changes
  useEffect(() => {
    const handleStateChange = (e: any) => {
      setIsListening(Boolean(e.detail?.isListening));
    };

    const handleTranscription = (record: TranscribeRecord) => {
      setLatestTranscript(record);
    };

    const unsubscribe = transcribeManager.onTranscription(handleTranscription);
    window.addEventListener("mira-mic-state-change", handleStateChange);

    return () => {
      unsubscribe();
      window.removeEventListener("mira-mic-state-change", handleStateChange);
    };
  }, []);

  // When autoSyncWithOperator is true, start transcribeManager if operator transitions to on (e.g. startup auto_start)
  const prevOperatorMicOnRef = useRef<boolean>(isOperatorMicOn);
  useEffect(() => {
    if (!autoSyncWithOperator) return;

    if (!prevOperatorMicOnRef.current && isOperatorMicOn && !transcribeManager.getIsListening()) {
      transcribeManager.start();
    }
    prevOperatorMicOnRef.current = isOperatorMicOn;
  }, [isOperatorMicOn, autoSyncWithOperator]);

  const startListening = useCallback(() => {
    transcribeManager.start();
    setIsListening(true);
    toggleMicMutation.mutate("on");
  }, [toggleMicMutation]);

  const stopListening = useCallback(() => {
    transcribeManager.stop();
    setIsListening(false);
    toggleMicMutation.mutate("off");
  }, [toggleMicMutation]);

  const toggleListening = useCallback(() => {
    if (transcribeManager.getIsListening() || isMicOn) {
      stopListening();
    } else {
      startListening();
    }
  }, [isMicOn, startListening, stopListening]);

  return {
    isListening,
    isMicOn,
    latestTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
