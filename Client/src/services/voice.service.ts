import { vaultService, type VoiceKeysResponse, type VoiceConfig, type VoiceConfigUpdateRequest } from "./vault.service";
import { operatorService, type MicrophoneStatusResponse, type MicrophoneActionResponse, type MicrophoneAutoStartResponse } from "./operator.service";

export interface VoiceSnapshot {
  provider: string;
  keys: string[];
  currentKeyIndex: number;
  totalKeys: number;
  activeKey: string | null;
  config: VoiceConfig;
  micStatus: MicrophoneStatusResponse;
}

export const voiceService = {
  /**
   * Retrieves all ElevenLabs API keys, total count, and current active key index from Vault.
   */
  async getElevenLabsKeys(provider = "elevenlabs"): Promise<VoiceKeysResponse> {
    return await vaultService.getVoiceKeys(provider);
  },

  /**
   * Updates the active ElevenLabs API key index in Vault.
   */
  async updateKeyIndex(
    newIndex: number,
    provider = "elevenlabs"
  ): Promise<VoiceKeysResponse> {
    return await vaultService.updateVoiceCurrentKey(newIndex, provider);
  },

  /**
   * Helper to rotate to the next key index in a round-robin cycle.
   */
  async rotateKey(provider = "elevenlabs"): Promise<VoiceKeysResponse> {
    const data = await this.getElevenLabsKeys(provider);
    if (!data.keys || data.keys.length === 0) {
      return data;
    }
    const nextIndex = (data.current_key + 1) % data.keys.length;
    return await this.updateKeyIndex(nextIndex, provider);
  },

  /**
   * Helper to retrieve the current active key string directly.
   */
  async getActiveKey(provider = "elevenlabs"): Promise<string | null> {
    const data = await this.getElevenLabsKeys(provider);
    if (!data.keys || data.keys.length === 0) return null;
    const safeIndex = Math.max(0, Math.min(data.current_key, data.keys.length - 1));
    return data.keys[safeIndex] || null;
  },

  /**
   * Retrieves the global voice settings (master toggle, while typing speech, mic auto-start).
   */
  async getVoiceConfig(): Promise<VoiceConfig> {
    return await vaultService.getVoiceConfig();
  },

  /**
   * Updates the global voice settings in Vault without showing disruptive UI messages.
   */
  async updateVoiceConfig(updates: VoiceConfigUpdateRequest): Promise<VoiceConfig> {
    return await vaultService.updateVoiceConfig(updates);
  },

  /**
   * Retrieves the current hardware microphone state from Operator.
   */
  async getMicrophoneStatus(): Promise<MicrophoneStatusResponse> {
    return await operatorService.getMicrophoneStatus();
  },

  /**
   * Turns the microphone on or off via Operator.
   */
  async toggleMicrophone(nextState: "on" | "off"): Promise<MicrophoneActionResponse> {
    return await operatorService.toggleMicrophone(nextState);
  },

  /**
   * Retrieves the microphone auto-start setting.
   */
  async getMicrophoneAutoStart(): Promise<MicrophoneAutoStartResponse> {
    return await operatorService.getMicrophoneAutoStart();
  },

  /**
   * Updates the microphone auto-start setting across Operator and Vault.
   */
  async updateMicrophoneAutoStart(enabled: boolean): Promise<MicrophoneAutoStartResponse> {
    return await operatorService.updateMicrophoneAutoStart(enabled);
  },

  /**
   * Complete snapshot of all voice & mic states across Vault and Operator.
   */
  async getVoiceSnapshot(): Promise<VoiceSnapshot> {
    const [keysData, config, micStatus] = await Promise.all([
      this.getElevenLabsKeys().catch(() => ({
        provider: "elevenlabs",
        keys: [],
        current_key: 0,
        total_keys: 0,
      })),
      this.getVoiceConfig().catch(() => ({
        mic_auto_start: false,
        voice_enable_master: false,
        voice_enable_while_typing: false,
        voice_model_id: "",
      })),
      this.getMicrophoneStatus().catch(() => ({
        state: "off" as const,
        is_on: false,
        auto_start: false,
      })),
    ]);

    const activeKey =
      keysData.keys.length > 0
        ? keysData.keys[Math.max(0, Math.min(keysData.current_key, keysData.keys.length - 1))] || null
        : null;

    return {
      provider: keysData.provider || "elevenlabs",
      keys: keysData.keys,
      currentKeyIndex: keysData.current_key,
      totalKeys: keysData.total_keys || keysData.keys.length,
      activeKey,
      config,
      micStatus,
    };
  },
};
