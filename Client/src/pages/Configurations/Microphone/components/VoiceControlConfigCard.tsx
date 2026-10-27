import { useState, useEffect, type FC } from "react";
import {
  Volume2,
  VolumeX,
  Keyboard,
  Lock,
  Loader2,
  Bot,
  Copy,
  Check,
  Save,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { VoiceConfig, VoiceConfigUpdateRequest } from "@/services";
import { useVoiceStore } from "@/store/useVoiceStore";
import { cn } from "@/lib/utils";

interface VoiceControlConfigCardProps {
  voiceConfig: VoiceConfig | null | undefined;
  onUpdateVoiceConfig: (updates: VoiceConfigUpdateRequest) => Promise<void>;
  isUpdating?: boolean;
}

export const VoiceControlConfigCard: FC<VoiceControlConfigCardProps> = ({
  voiceConfig,
  onUpdateVoiceConfig,
  isUpdating = false,
}) => {
  const isMasterEnabled = Boolean(voiceConfig?.voice_enable_master);
  const isWhileTypingEnabled = isMasterEnabled && Boolean(voiceConfig?.voice_enable_while_typing);

  const volume = useVoiceStore((s) => s.volume);
  const setVolume = useVoiceStore((s) => s.setVolume);
  const maximizeVolume = useVoiceStore((s) => s.maximizeVolume);

  const serverModelId = voiceConfig?.voice_model_id ?? "";
  const [modelIdInput, setModelIdInput] = useState(serverModelId);
  const [isCopied, setIsCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isSavingModelId, setIsSavingModelId] = useState(false);

  useEffect(() => {
    setModelIdInput(serverModelId);
  }, [serverModelId]);

  const isDirty = modelIdInput !== serverModelId;

  const handleSaveModelId = async () => {
    if (!isDirty || isSavingModelId) return;
    setIsSavingModelId(true);
    try {
      await onUpdateVoiceConfig({
        voice_model_id: modelIdInput.trim(),
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setIsSavingModelId(false);
    }
  };

  const handleSelectPreset = async (presetId: string) => {
    setModelIdInput(presetId);
    if (presetId.trim() === serverModelId) return;
    setIsSavingModelId(true);
    try {
      await onUpdateVoiceConfig({
        voice_model_id: presetId.trim(),
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setIsSavingModelId(false);
    }
  };

  const handleCopy = () => {
    if (!modelIdInput) return;
    navigator.clipboard.writeText(modelIdInput);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleReset = () => {
    setModelIdInput(serverModelId);
  };

  const handleToggleMaster = async () => {
    if (isUpdating) return;
    const nextMaster = !isMasterEnabled;
    await onUpdateVoiceConfig({
      voice_enable_master: nextMaster,
      ...(!nextMaster ? { voice_enable_while_typing: false } : {}),
    });
  };

  const handleToggleWhileTyping = async () => {
    if (isUpdating || !isMasterEnabled) return;
    const nextWhileTyping = !isWhileTypingEnabled;
    await onUpdateVoiceConfig({
      voice_enable_while_typing: nextWhileTyping,
    });
  };

  return (
    <div
      id="voice-control-config-card"
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/50 backdrop-blur-xl shadow-xl transition-all"
    >
      {/* Background ambient lighting */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative p-5 sm:p-6 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Voice Control & Speech Settings
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                Speech Output
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Global AI voice output behavior, typing audio suppression, and Vault speech controls
            </p>
          </div>
        </div>

        {isUpdating && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 self-start sm:self-auto">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Syncing with Vault...</span>
          </div>
        )}
      </div>

      {/* Controls Grid - Both toggles in the same row on md+ screens */}
      <div className="relative p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Master Voice Control Toggle Card */}
        <div
          id="setting-voice-enable-master"
          className={cn(
            "flex flex-col justify-between rounded-xl border p-5 transition-all duration-200",
            isMasterEnabled
              ? "border-cyan-500/30 bg-gradient-to-br from-cyan-950/25 via-zinc-950/60 to-zinc-950/40 shadow-[0_0_20px_rgba(6,182,212,0.06)]"
              : "border-white/[0.06] bg-zinc-950/40 hover:border-white/10"
          )}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                    isMasterEnabled
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "bg-zinc-800 text-zinc-400 border border-white/10"
                  )}
                >
                  {isMasterEnabled ? (
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Master Voice Control
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    voice_enable_master
                  </span>
                </div>
              </div>

              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase shrink-0",
                  isMasterEnabled
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                    : "bg-zinc-800/80 border border-white/10 text-zinc-400"
                )}
              >
                {isMasterEnabled ? "Active" : "Disabled"}
              </span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed min-h-[40px]">
              Primary switch for MIRA voice interactions and speech synthesis. When disabled, all AI voice outputs are globally silenced and typing speech is locked.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 mt-3 border-t border-white/[0.05]">
            <span className="text-xs font-mono text-zinc-400">
              {isMasterEnabled ? "Global Voice Active" : "Globally Muted"}
            </span>

            {/* Switch button */}
            <button
              type="button"
              id="switch-voice-enable-master"
              role="switch"
              aria-checked={isMasterEnabled}
              disabled={isUpdating}
              onClick={handleToggleMaster}
              className={cn(
                "relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50",
                isMasterEnabled
                  ? "bg-cyan-600 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                  : "bg-zinc-800 hover:bg-zinc-750"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  isMasterEnabled ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        {/* Voice Playback While Typing Toggle Card */}
        <div
          id="setting-voice-enable-while-typing"
          className={cn(
            "flex flex-col justify-between rounded-xl border p-5 transition-all duration-200",
            !isMasterEnabled
              ? "border-white/[0.04] bg-zinc-950/20 opacity-60 cursor-not-allowed"
              : isWhileTypingEnabled
                ? "border-indigo-500/30 bg-gradient-to-br from-indigo-950/25 via-zinc-950/60 to-zinc-950/40 shadow-[0_0_20px_rgba(99,102,241,0.06)]"
                : "border-white/[0.06] bg-zinc-950/40 hover:border-white/10"
          )}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                    !isMasterEnabled
                      ? "bg-zinc-900 text-zinc-600 border border-white/5"
                      : isWhileTypingEnabled
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-zinc-800 text-zinc-400 border border-white/10"
                  )}
                >
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Voice Playback While Chating
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    voice_enable_while_typing
                  </span>
                </div>
              </div>

              {!isMasterEnabled ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-500/10 border border-amber-500/25 text-amber-300 shrink-0">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Auto-Disabled</span>
                </span>
              ) : (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase shrink-0",
                    isWhileTypingEnabled
                      ? "bg-indigo-500/15 border border-indigo-500/30 text-indigo-300"
                      : "bg-zinc-800/80 border border-white/10 text-zinc-400"
                  )}
                >
                  {isWhileTypingEnabled ? "Enabled" : "Disabled"}
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed min-h-[40px]">
              Allow MIRA to vocalize speech responses while you are actively typing on your keyboard. Turn off to automatically mute voice output during keyboard input.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 mt-3 border-t border-white/[0.05]">
            <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              {!isMasterEnabled ? (
                <>
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-amber-400/90">Locked by Master Control</span>
                </>
              ) : isWhileTypingEnabled ? (
                "Speaking While Typing"
              ) : (
                "Muted During Typing"
              )}
            </span>

            {/* Switch button */}
            <button
              type="button"
              id="switch-voice-enable-while-typing"
              role="switch"
              aria-checked={isWhileTypingEnabled}
              disabled={!isMasterEnabled || isUpdating}
              onClick={handleToggleWhileTyping}
              title={
                !isMasterEnabled
                  ? "Locked: Enable Master Voice Control first"
                  : isWhileTypingEnabled
                    ? "Disable voice while typing"
                    : "Enable voice while typing"
              }
              className={cn(
                "relative inline-flex h-7 w-13 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-2 focus:ring-offset-zinc-950",
                !isMasterEnabled
                  ? "bg-zinc-900 cursor-not-allowed opacity-50"
                  : isWhileTypingEnabled
                    ? "bg-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] cursor-pointer"
                    : "bg-zinc-800 hover:bg-zinc-750 cursor-pointer"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  isWhileTypingEnabled ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Speech Output Volume & Audio Booster Section */}
      <div className="relative p-5 sm:p-6 border-t border-white/[0.06] bg-zinc-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Speech Output Volume & Booster
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                  {Math.round(volume * 100)}% Full
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                  Speaker Boost Active
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Full-fidelity output with Web Audio dynamic gain booster and ElevenLabs neural speaker volume boost
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              id="btn-voice-max-volume"
              onClick={maximizeVolume}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer border flex items-center gap-1.5",
                volume >= 0.99
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border-white/[0.08]"
              )}
              title="Set playback volume to 100% Full"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Full Volume (100%)</span>
            </button>
          </div>
        </div>

        {/* Volume Slider Bar */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (volume === 0 ? maximizeVolume() : setVolume(0))}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title={volume === 0 ? "Restore full volume" : "Mute playback"}
          >
            {volume === 0 ? (
              <VolumeX className="w-4 h-4 text-zinc-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>
          <input
            id="slider-voice-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full sm:max-w-xs h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
            title={`Adjust Volume: ${Math.round(volume * 100)}%`}
          />
          <span className="text-xs font-mono text-zinc-300 w-12 text-right">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      {/* Voice Model ID Section */}
      <div className="relative p-5 sm:p-6 border-t border-white/[0.06] bg-zinc-950/30">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Voice Model ID
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.06]">
                    voice_config.voice_model_id
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Identifier for AI speech synthesis model or custom cloned voice token stored in Vault
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {modelIdInput && (
                <button
                  type="button"
                  id="btn-copy-voice-model-id"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all cursor-pointer"
                  title="Copy Voice Model ID"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-mono text-[11px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="font-mono text-[11px]">Copy</span>
                    </>
                  )}
                </button>
              )}

              {isDirty && (
                <button
                  type="button"
                  id="btn-revert-voice-model-id"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all cursor-pointer"
                  title="Revert changes"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="font-mono text-[11px]">Revert</span>
                </button>
              )}

              <button
                type="button"
                id="btn-save-voice-model-id"
                onClick={handleSaveModelId}
                disabled={!isDirty || isSavingModelId || isUpdating}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm",
                  justSaved
                    ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                    : isDirty
                    ? "bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white border border-cyan-400/30 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                    : "bg-white/[0.04] text-zinc-500 border border-white/[0.05] cursor-not-allowed"
                )}
              >
                {isSavingModelId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : justSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Saved in Vault</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Model ID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="relative mt-1">
            <textarea
              id="input-voice-model-id"
              value={modelIdInput}
              onChange={(e) => setModelIdInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  handleSaveModelId();
                }
              }}
              rows={3}
              placeholder="Enter or paste your voice model ID (e.g. eleven_multilingual_v2, custom voice ID hash, or high-capacity model weights identifier)..."
              className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-zinc-950/80 border border-white/[0.08] text-cyan-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all resize-y min-h-[72px]"
            />

            <div className="flex items-center justify-between mt-1.5 px-1 text-[11px] text-zinc-500 font-mono">
              <span>
                Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.06]">Ctrl</kbd> + <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.06]">Enter</kbd> to save
              </span>
              <span className={cn(modelIdInput.length > 0 ? "text-cyan-400/80" : "text-zinc-600")}>
                {modelIdInput.length} characters
              </span>
            </div>

            {/* Quick preset buttons for verified premade voices */}
            <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-400">
                  Verified Premade Voices (Works with Free & Paid ElevenLabs tiers):
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Click to select
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: "Sarah (Default Female)", id: "EXAVITQu4vr4xnSDxMaL", desc: "Mature, Reassuring" },
                  { name: "George (Default Male)", id: "JBFqnCBsd6RMkjVDRZzb", desc: "Warm Storyteller" },
                  { name: "Alice (Female)", id: "Xb7hH8MSUJpSbSDYk0k2", desc: "Clear Educator" },
                  { name: "Roger (Male)", id: "CwhRBWXzGAHq8TQ4Fs17", desc: "Laid-Back Casual" },
                  { name: "Charlie (Male)", id: "IKne3meq5aSn9XLyUdCD", desc: "Deep & Confident" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer border flex items-center gap-1.5",
                      (serverModelId === preset.id || modelIdInput.trim() === preset.id)
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)] font-semibold"
                        : "bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border-white/[0.06]"
                    )}
                    title={`Switch to ${preset.name} (${preset.id})`}
                  >
                    {serverModelId === preset.id && <Check className="w-3 h-3 text-cyan-400" />}
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>

              {modelIdInput.trim() === "QTKSa2Iyv0yoxvXY2V8a" && (
                <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed space-y-1">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <span>⚠️ ElevenLabs Free API Restriction Notice:</span>
                  </div>
                  <p>
                    Voice ID <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-amber-200">QTKSa2Iyv0yoxvXY2V8a</code> (Neha P) is an ElevenLabs <strong>Community Library</strong> voice.
                  </p>
                  <p className="text-zinc-300">
                    ElevenLabs strictly blocks Free Tier API accounts from using Community Library voices (returns <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-rose-300">HTTP 402: Free users cannot use library voices via the API</code>).
                  </p>
                  <p className="text-zinc-400 text-[11px]">
                    To use Neha P, an ElevenLabs paid subscription (Creator/Starter) is required on your ElevenLabs account. On free accounts, please select one of the Premade voices above (like <strong>Sarah</strong> or <strong>George</strong>), which work freely without restriction!
                  </p>
                </div>
              )}

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Free ElevenLabs accounts only allow Premade voices via API. Library or cloned voices require a paid ElevenLabs plan. If an unpermitted library voice is entered, MIRA automatically falls back to Sarah so you always hear speech.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
