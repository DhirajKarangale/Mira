import { useEffect, useRef } from "react";
import { useVoiceStore } from "@/store/useVoiceStore";

/**
 * Global voice hook:
 * Initializes voice credentials, active key index, speech configuration,
 * and hardware microphone state on client startup.
 */
export function useVoiceSync() {
  const isInitialized = useVoiceStore((s) => s.isInitialized);
  const isLoading = useVoiceStore((s) => s.isLoading);
  const keys = useVoiceStore((s) => s.keys);
  const currentKeyIndex = useVoiceStore((s) => s.currentKeyIndex);
  const activeKey = useVoiceStore((s) => s.activeKey);
  const isMicOn = useVoiceStore((s) => s.isMicOn);
  const voiceEnableMaster = useVoiceStore((s) => s.voiceEnableMaster);
  const voiceEnableWhileTyping = useVoiceStore((s) => s.voiceEnableWhileTyping);

  const initAttempted = useRef(false);

  useEffect(() => {
    if (!initAttempted.current) {
      initAttempted.current = true;
      useVoiceStore.getState().initialize().catch((err) => {
        console.warn("[VoiceSync] Failed to initialize voice state on boot:", err);
      });
    }
  }, []);

  return {
    isInitialized,
    isLoading,
    keys,
    currentKeyIndex,
    activeKey,
    isMicOn,
    voiceEnableMaster,
    voiceEnableWhileTyping,
    updateKeyIndex: useVoiceStore.getState().updateKeyIndex,
    rotateToNextKey: useVoiceStore.getState().rotateToNextKey,
    setMicrophoneState: useVoiceStore.getState().setMicrophoneState,
    setMicrophoneAutoStart: useVoiceStore.getState().setMicrophoneAutoStart,
    setVoiceConfig: useVoiceStore.getState().setVoiceConfig,
    refresh: useVoiceStore.getState().refresh,
  };
}
