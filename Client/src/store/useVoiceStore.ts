import { create } from "zustand";
import {
  voiceService,
  type VoiceConfigUpdateRequest,
} from "@/services";
import { audioPlayer } from "@/modules/voice/audioPlayer";


export interface VoiceState {
  // ElevenLabs keys & active key state
  provider: string;
  keys: string[];
  currentKeyIndex: number;
  totalKeys: number;
  activeKey: string | null;

  // Hardware microphone state
  isMicOn: boolean;
  micAutoStart: boolean;

  // Voice output configuration
  voiceEnableMaster: boolean;
  voiceEnableWhileTyping: boolean;
  voiceModelId: string;
  volume: number; // 0.0 - 2.0 (default 1.0 = 100% full volume, up to 2.0 = 200% Super Boost)

  // Store metadata
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  areAllKeysExpired: boolean;

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  updateKeyIndex: (newIndex: number) => Promise<void>;
  rotateToNextKey: () => Promise<string | null>;
  markAllKeysExpired: () => void;
  resetKeysExpired: () => void;
  setMicrophoneState: (nextState: "on" | "off") => Promise<void>;
  setMicrophoneAutoStart: (enabled: boolean) => Promise<void>;
  setVoiceConfig: (updates: VoiceConfigUpdateRequest) => Promise<void>;
  setVoiceModelId: (modelId: string) => Promise<void>;
  setKeys: (keys: string[], currentKeyIndex?: number) => void;
  setVolume: (volume: number) => void;
  maximizeVolume: () => void;
  superBoostVolume: (level?: number) => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  provider: "elevenlabs",
  keys: [],
  currentKeyIndex: 0,
  totalKeys: 0,
  activeKey: null,
  areAllKeysExpired: false,

  markAllKeysExpired: () => {
    set({ areAllKeysExpired: true });
  },

  resetKeysExpired: () => {
    set({ areAllKeysExpired: false });
  },

  isMicOn: false,
  micAutoStart: false,

  voiceEnableMaster: false,
  voiceEnableWhileTyping: false,
  voiceModelId: "",
  volume: 1.0,

  isLoading: false,
  isInitialized: false,
  error: null,

  /**
   * Initializes the voice module on client startup:
   * Fetches all ElevenLabs keys, active key index, global voice configuration, and microphone status.
   */
  initialize: async () => {
    // Avoid double-initialization while already loading
    if (get().isLoading) return;
    set({ isLoading: true, error: null });

    try {
      const snapshot = await voiceService.getVoiceSnapshot();
      const safeIndex =
        snapshot.keys.length > 0
          ? Math.max(0, Math.min(snapshot.currentKeyIndex, snapshot.keys.length - 1))
          : 0;

      const activeKey =
        snapshot.keys.length > 0 ? snapshot.keys[safeIndex] || null : null;

      const isMicOn = Boolean(
        snapshot.micStatus.is_on ||
          (typeof snapshot.micStatus.state === "string" &&
            snapshot.micStatus.state.toLowerCase() === "on")
      );

      const micAutoStart = Boolean(
        snapshot.config.mic_auto_start ?? snapshot.micStatus.auto_start
      );

      set({
        provider: snapshot.provider,
        keys: snapshot.keys,
        currentKeyIndex: safeIndex,
        totalKeys: snapshot.totalKeys,
        activeKey,
        isMicOn,
        micAutoStart,
        voiceEnableMaster: Boolean(snapshot.config.voice_enable_master),
        voiceEnableWhileTyping:
          Boolean(snapshot.config.voice_enable_master) &&
          Boolean(snapshot.config.voice_enable_while_typing),
        voiceModelId: snapshot.config.voice_model_id || "",
        isLoading: false,
        isInitialized: true,
        error: null,
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to initialize voice module.";
      set({ isLoading: false, error: msg, isInitialized: true });
    }
  },

  /**
   * Refresh all voice, mic, and credential state from backend.
   */
  refresh: async () => {
    await get().initialize();
  },

  /**
   * Updates the active ElevenLabs key index in Vault and updates local store state.
   */
  updateKeyIndex: async (newIndex: number) => {
    try {
      const res = await voiceService.updateKeyIndex(newIndex, get().provider);
      const safeIndex =
        res.keys.length > 0
          ? Math.max(0, Math.min(res.current_key, res.keys.length - 1))
          : 0;
      const activeKey = res.keys.length > 0 ? res.keys[safeIndex] || null : null;

      set({
        keys: res.keys,
        currentKeyIndex: safeIndex,
        totalKeys: res.total_keys || res.keys.length,
        activeKey,
        error: null,
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update voice key index.";
      set({ error: msg });
      throw err;
    }
  },

  /**
   * Cycles to the next key index in a round-robin rotation in backend and store.
   */
  rotateToNextKey: async () => {
    const { keys, currentKeyIndex, updateKeyIndex } = get();
    if (!keys || keys.length === 0) return null;
    const nextIndex = (currentKeyIndex + 1) % keys.length;
    await updateKeyIndex(nextIndex);
    return get().activeKey;
  },

  /**
   * Toggles the hardware microphone via Operator without showing UI messages.
   */
  setMicrophoneState: async (nextState: "on" | "off") => {
    try {
      await voiceService.toggleMicrophone(nextState);
      set({ isMicOn: nextState === "on" });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to toggle microphone.";
      set({ error: msg });
      throw err;
    }
  },

  /**
   * Updates microphone auto-start setting across Operator and Vault without showing UI messages.
   */
  setMicrophoneAutoStart: async (enabled: boolean) => {
    try {
      await voiceService.updateMicrophoneAutoStart(enabled);
      set({ micAutoStart: enabled });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update microphone auto-start.";
      set({ error: msg });
      throw err;
    }
  },

  /**
   * Updates voice settings in Vault without showing UI messages.
   */
  setVoiceConfig: async (updates: VoiceConfigUpdateRequest) => {
    try {
      const updated = await voiceService.updateVoiceConfig(updates);
      const nextMaster =
        updates.voice_enable_master !== undefined
          ? updates.voice_enable_master
          : get().voiceEnableMaster;
      const nextWhileTyping = !nextMaster
        ? false
        : updates.voice_enable_while_typing !== undefined
        ? updates.voice_enable_while_typing
        : get().voiceEnableWhileTyping;

      const nextModelId =
        updates.voice_model_id !== undefined
          ? updates.voice_model_id
          : (updated.voice_model_id ?? get().voiceModelId);

      set({
        voiceEnableMaster: nextMaster,
        voiceEnableWhileTyping: nextWhileTyping,
        voiceModelId: nextModelId,
        micAutoStart:
          updates.mic_auto_start !== undefined
            ? updates.mic_auto_start
            : updated.mic_auto_start ?? get().micAutoStart,
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update voice configuration.";
      set({ error: msg });
      throw err;
    }
  },

  /**
   * Updates the voice model ID string in Vault and store.
   */
  setVoiceModelId: async (modelId: string) => {
    await get().setVoiceConfig({ voice_model_id: modelId });
  },

  /**
   * Locally updates the keys array and safely clamps current key index.
   * If keys changed or new keys are provided, resets the expired state.
   */
  setKeys: (newKeys: string[], targetCurrentIndex?: number) => {
    const prevKeys = get().keys;
    const keysChanged =
      newKeys.length !== prevKeys.length ||
      newKeys.some((k, i) => k !== prevKeys[i]);

    const safeIdx =
      newKeys.length > 0
        ? Math.max(
            0,
            Math.min(
              targetCurrentIndex !== undefined
                ? targetCurrentIndex
                : get().currentKeyIndex,
              newKeys.length - 1
            )
          )
        : 0;

    set({
      keys: newKeys,
      totalKeys: newKeys.length,
      currentKeyIndex: safeIdx,
      activeKey: newKeys.length > 0 ? newKeys[safeIdx] || null : null,
      areAllKeysExpired: keysChanged ? false : get().areAllKeysExpired,
    });
  },

  /**
   * Sets playback volume (0.0 to 2.0) and updates the audio player.
   * Supports both decimal multipliers (0.0 to 2.0) and percentages (0 to 200).
   */
  setVolume: (volume: number) => {
    const raw = Number.isFinite(volume) ? volume : 1.0;
    const normalized = raw > 2.0 ? raw / 100 : raw;
    const clamped = Math.max(0, Math.min(2.0, normalized));
    set({ volume: clamped });
    audioPlayer.setVolume(clamped);
  },

  /**
   * Maximizes voice playback volume to standard full (1.0).
   */
  maximizeVolume: () => {
    set({ volume: 1.0 });
    audioPlayer.maximizeVolume();
  },

  /**
   * Sets voice playback volume to super boosted level (e.g. 1.5 or 2.0).
   */
  superBoostVolume: (level = 1.5) => {
    const clamped = Math.max(0, Math.min(2.0, level));
    set({ volume: clamped });
    audioPlayer.superBoostVolume(clamped);
  },
}));

