/**
 * React Hook for ElevenLabs Text-to-Speech (TTS)
 *
 * Provides reactive access to TTS playback state, chunk progress,
 * and gapless playback controls for any component in Mira.
 */

import { useState, useEffect, useCallback } from "react";
import { ttsService, type TTSOptions, type TTSState } from "@/utils/ttsService";
import { ttsKeyManager } from "@/utils/ttsKeyManager";

export function useTTS() {
  const [state, setState] = useState<TTSState>(ttsService.getState());
  const [keys, setKeys] = useState<string[]>(ttsKeyManager.getAllKeys());

  useEffect(() => {
    const unsubscribe = ttsService.onStateChange((newState) => {
      setState(newState);
    });

    const handleKeyRotated = () => {
      setKeys(ttsKeyManager.getAllKeys());
      setState(ttsService.getState());
    };

    window.addEventListener("mira:tts-key-rotated", handleKeyRotated);

    return () => {
      unsubscribe();
      window.removeEventListener("mira:tts-key-rotated", handleKeyRotated);
    };
  }, []);

  const speak = useCallback((text: string, options?: TTSOptions) => {
    return ttsService.speak(text, options);
  }, []);

  const stop = useCallback(() => {
    ttsService.stop();
  }, []);

  const pause = useCallback(() => {
    ttsService.pause();
  }, []);

  const resume = useCallback(() => {
    ttsService.resume();
  }, []);

  const togglePlay = useCallback(
    (text: string, options?: TTSOptions) => {
      if (state.isPlaying) {
        if (state.activeText === text.trim()) {
          stop();
        } else {
          speak(text, options);
        }
      } else {
        speak(text, options);
      }
    },
    [state.isPlaying, state.activeText, speak, stop]
  );

  const addKey = useCallback((newKey: string) => {
    ttsKeyManager.addKey(newKey);
    setKeys(ttsKeyManager.getAllKeys());
  }, []);

  const setSelectedVoiceId = useCallback((voiceId: string) => {
    ttsService.setSelectedVoiceId(voiceId);
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    togglePlay,
    addKey,
    keys,
    selectedVoiceId: state.selectedVoiceId,
    setSelectedVoiceId,
    availableVoices: ttsService.getAvailableVoices(),
    isPlaying: state.isPlaying,
    isPaused: state.isPaused,
    currentChunk: state.currentChunk,
    totalChunks: state.totalChunks,
    activeText: state.activeText,
    currentKeyIndex: state.currentKeyIndex,
  };
}
