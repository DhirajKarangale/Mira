import { useState, useEffect } from "react";
import { voiceQueueManager } from "./voiceQueueManager";
import type { VoiceQueueSnapshot } from "./types";

/**
 * React hook subscribing to the centralized voice queue manager.
 * Provides real-time state of the currently playing response,
 * queued pending responses, and queue control actions.
 */
export function useVoiceQueue(): VoiceQueueSnapshot & {
  stopCurrent: () => void;
  stopAll: () => void;
  setInterResponseDelay: (delayMs: number) => void;
} {
  const [snapshot, setSnapshot] = useState<VoiceQueueSnapshot>(() =>
    voiceQueueManager.getSnapshot()
  );

  useEffect(() => {
    return voiceQueueManager.subscribe(() => {
      setSnapshot(voiceQueueManager.getSnapshot());
    });
  }, []);

  return {
    ...snapshot,
    stopCurrent: () => voiceQueueManager.stopCurrent(),
    stopAll: () => voiceQueueManager.stopAll(),
    setInterResponseDelay: (ms: number) =>
      voiceQueueManager.setInterResponseDelay(ms),
  };
}
