import { useEffect, useState, useCallback, useRef } from "react";
import { transcribeManager, type TranscribeRecord } from "@/utils/transcribe";
import { operatorService } from "@/services/operator.service";

// Module-level global state shared across all components
let globalMicOn: boolean = (() => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("mira_mic_enabled");
    if (stored !== null) return stored === "true";
  }
  return false;
})();

export function useSpeechRecognition(autoSyncWithOperator: boolean = true) {
  const [isMicOn, setIsMicOn] = useState<boolean>(globalMicOn);
  const [isListening, setIsListening] = useState<boolean>(transcribeManager.getIsListening());
  const [latestTranscript, setLatestTranscript] = useState<TranscribeRecord | null>(null);
  const hasCheckedAutoStart = useRef<boolean>(false);

  // Sync with global events and transcribeManager
  useEffect(() => {
    const handleStateChange = (e: any) => {
      if (typeof e.detail?.isMicOn === "boolean") {
        globalMicOn = e.detail.isMicOn;
        setIsMicOn(e.detail.isMicOn);
      }
      if (typeof e.detail?.isListening === "boolean") {
        setIsListening(e.detail.isListening);
      }
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

  // Ensure transcription starts on mount if mic was enabled in localStorage or auto-start is true
  useEffect(() => {
    if (!autoSyncWithOperator || hasCheckedAutoStart.current) return;
    hasCheckedAutoStart.current = true;

    const initMicState = async () => {
      try {
        const storedMicEnabled = localStorage.getItem("mira_mic_enabled");
        const storedAutoStart = localStorage.getItem("mira_mic_auto_start");
        
        let shouldBeOn = storedMicEnabled === "true";
        if (storedMicEnabled === null && storedAutoStart === "true") {
          shouldBeOn = true;
        }

        if (storedAutoStart === null && !shouldBeOn) {
          const res = await operatorService.getMicrophoneAutoStart();
          if (Boolean(res?.auto_start || res?.mic_auto_start)) {
            shouldBeOn = true;
          }
        }

        if (shouldBeOn) {
          globalMicOn = true;
          setIsMicOn(true);
          localStorage.setItem("mira_mic_enabled", "true");
          await transcribeManager.start();
          operatorService.toggleMicrophone("on").catch(() => {});
          window.dispatchEvent(
            new CustomEvent("mira-mic-state-change", {
              detail: { isMicOn: true, isListening: true },
            })
          );
        }
      } catch (err) {
        console.warn("[SpeechRecognition] Initialization error:", err);
      }
    };

    initMicState();
  }, [autoSyncWithOperator]);

  const startListening = useCallback(async () => {
    globalMicOn = true;
    setIsMicOn(true);
    setIsListening(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("mira_mic_enabled", "true");
      window.dispatchEvent(
        new CustomEvent("mira-mic-state-change", {
          detail: { isMicOn: true, isListening: true },
        })
      );
    }
    await transcribeManager.start();
    operatorService.toggleMicrophone("on").catch(() => {});
  }, []);

  const stopListening = useCallback(() => {
    globalMicOn = false;
    setIsMicOn(false);
    setIsListening(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("mira_mic_enabled", "false");
      window.dispatchEvent(
        new CustomEvent("mira-mic-state-change", {
          detail: { isMicOn: false, isListening: false },
        })
      );
    }
    transcribeManager.stop();
    operatorService.toggleMicrophone("off").catch(() => {});
  }, []);

  const toggleListening = useCallback(() => {
    if (globalMicOn || isMicOn || transcribeManager.getIsListening()) {
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
