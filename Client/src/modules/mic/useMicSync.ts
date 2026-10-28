/**
 * useMicSync: React hook to synchronize microphone lifecycle and state.
 * Subscribes to micManager state changes and surfaces state to React components.
 */

import { useEffect, useState } from "react";
import { micManager } from "./micManager";
import { wakeWordDetector } from "./wakeWordDetector";
import { useVoiceStore } from "@/store/useVoiceStore";
import type { MicState } from "./types";

export function useMicSync() {
  const [micState, setMicState] = useState<MicState>(() => micManager.getState());
  const isMicOn = useVoiceStore((s) => s.isMicOn);

  useEffect(() => {
    const unsubscribe = micManager.addStateListener((nextState) => {
      setMicState(nextState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    micState,
    isMicOn,
    isListening: micState === "listening" || micState === "collecting_command",
    isCollectingCommand: micState === "collecting_command",
    isSubmitting: micState === "submitting",
    start: () => micManager.start(),
    stop: () => micManager.stop(),
    toggle: () => micManager.toggle(),
    wakeWords: wakeWordDetector.getWakeWords(),
    addWakeWord: (word: string) => wakeWordDetector.addWakeWord(word),
    setWakeWords: (words: string[]) => wakeWordDetector.setWakeWords(words),
  };
}
