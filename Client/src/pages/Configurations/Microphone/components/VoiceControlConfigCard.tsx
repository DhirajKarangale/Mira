import { useState, useEffect, useMemo, type FC } from "react";
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
  Zap,
  User,
  Cpu,
  Layers,
  Heart,
} from "lucide-react";
import type { VoiceConfig, VoiceConfigUpdateRequest } from "@/services";
import { useVoiceStore } from "@/store/useVoiceStore";
import { cn } from "@/lib/utils";
import {
  PREMADE_VOICES,
  AVAILABLE_MODELS,
  resolveVoiceAndModel,
  serializeVoiceConfig,
  isKnownModel,
} from "@/modules/voice";

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
  const superBoostVolume = useVoiceStore((s) => s.superBoostVolume);

  const serverModelId = voiceConfig?.voice_model_id ?? "";
  const currentResolved = useMemo(
    () => resolveVoiceAndModel(serverModelId),
    [serverModelId]
  );

  const [selectedVoiceId, setSelectedVoiceId] = useState(currentResolved.voiceId);
  const [selectedModelId, setSelectedModelId] = useState(currentResolved.modelId);
  const [customVoiceInput, setCustomVoiceInput] = useState(currentResolved.voiceId);
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male" | "custom">("female");
  const [isCopied, setIsCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);

  useEffect(() => {
    const res = resolveVoiceAndModel(serverModelId);
    setSelectedVoiceId(res.voiceId);
    setSelectedModelId(res.modelId);
    setCustomVoiceInput(res.voiceId);
  }, [serverModelId]);

  const activeVoiceObj = useMemo(() => {
    return PREMADE_VOICES.find((v) => v.id === selectedVoiceId) || null;
  }, [selectedVoiceId]);

  const activeModelObj = useMemo(() => {
    return AVAILABLE_MODELS.find((m) => m.id === selectedModelId) || AVAILABLE_MODELS[0];
  }, [selectedModelId]);

  const femaleVoices = useMemo(
    () => PREMADE_VOICES.filter((v) => v.gender === "female"),
    []
  );

  const maleVoices = useMemo(
    () => PREMADE_VOICES.filter((v) => v.gender === "male"),
    []
  );

  const isCustomVoiceDirty = customVoiceInput.trim() !== selectedVoiceId;

  const handleSelectVoice = async (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    setCustomVoiceInput(voiceId);
    const serialized = serializeVoiceConfig(voiceId, selectedModelId);
    setIsSavingVoice(true);
    try {
      await onUpdateVoiceConfig({
        voice_model_id: serialized,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModelId(modelId);
    const serialized = serializeVoiceConfig(selectedVoiceId, modelId);
    setIsSavingVoice(true);
    try {
      await onUpdateVoiceConfig({
        voice_model_id: serialized,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleSaveCustomVoice = async () => {
    const clean = customVoiceInput.trim();
    if (!clean || isSavingVoice) return;
    const resolved = resolveVoiceAndModel(clean);
    const targetVoice = resolved.voiceId;
    const targetModel = isKnownModel(clean) ? resolved.modelId : selectedModelId;

    setSelectedVoiceId(targetVoice);
    setSelectedModelId(targetModel);
    const serialized = serializeVoiceConfig(targetVoice, targetModel);

    setIsSavingVoice(true);
    try {
      await onUpdateVoiceConfig({
        voice_model_id: serialized,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleCopy = () => {
    if (!customVoiceInput) return;
    navigator.clipboard.writeText(customVoiceInput);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleResetCustom = () => {
    setCustomVoiceInput(selectedVoiceId);
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
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors",
                volume > 1.0
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
              )}
            >
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Speech Output Volume & Booster
                </h3>
                {volume === 0 ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/10 font-bold">
                    Muted
                  </span>
                ) : volume > 1.0 ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                    {Math.round(volume * 100)}% Super Boost
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                    {Math.round(volume * 100)}% Full
                  </span>
                )}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                  Speaker Boost Active
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Full-fidelity output with Web Audio 2.5x dynamic gain booster, anti-clipping dynamics compression, and ElevenLabs neural speaker boost
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              id="btn-voice-normal-volume"
              onClick={maximizeVolume}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer border flex items-center gap-1.5",
                Math.abs(volume - 1.0) < 0.05
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border-white/[0.08]"
              )}
              title="Set playback volume to standard full 100%"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>100% Full</span>
            </button>

            <button
              type="button"
              id="btn-voice-boost-150"
              onClick={() => superBoostVolume(1.5)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer border flex items-center gap-1.5",
                Math.abs(volume - 1.5) < 0.05
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border-white/[0.08]"
              )}
              title="Boost volume to 150% High"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>150% Boost</span>
            </button>

            <button
              type="button"
              id="btn-voice-boost-200"
              onClick={() => superBoostVolume(2.0)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer border flex items-center gap-1.5",
                Math.abs(volume - 2.0) < 0.05
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border-white/[0.08]"
              )}
              title="Boost volume to 200% Max Ultra Loud"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>200% Ultra</span>
            </button>
          </div>
        </div>

        {/* Volume Slider Bar with Quick Indicators */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (volume === 0 ? maximizeVolume() : setVolume(0))}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title={volume === 0 ? "Restore full volume" : "Mute playback"}
            >
              {volume === 0 ? (
                <VolumeX className="w-4 h-4 text-zinc-500" />
              ) : (
                <Volume2 className={cn("w-4 h-4", volume > 1.0 ? "text-amber-400" : "text-emerald-400")} />
              )}
            </button>
            <input
              id="slider-voice-volume"
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className={cn(
                "w-full sm:max-w-md h-2 rounded-lg appearance-none cursor-pointer transition-all bg-zinc-800",
                volume > 1.0
                  ? "accent-amber-500 hover:accent-amber-400"
                  : "accent-emerald-500 hover:accent-emerald-400"
              )}
              title={`Adjust Volume: ${Math.round(volume * 100)}% (0% to 200%)`}
            />
            <span
              className={cn(
                "text-xs font-mono w-16 text-right font-bold",
                volume > 1.0 ? "text-amber-300" : "text-zinc-300"
              )}
            >
              {Math.round(volume * 100)}%
            </span>
          </div>

          <div className="flex items-center justify-between sm:max-w-md pl-7 text-[10px] font-mono text-zinc-500 select-none">
            <span>0%</span>
            <span>50%</span>
            <span className={cn(volume >= 0.95 && volume <= 1.05 ? "text-emerald-400 font-bold" : "")}>100% (Std)</span>
            <span className={cn(volume >= 1.45 && volume <= 1.55 ? "text-amber-400 font-bold" : "")}>150% (Boost)</span>
            <span className={cn(volume >= 1.95 ? "text-rose-400 font-bold" : "")}>200% (Ultra)</span>
          </div>
        </div>
      </div>

      {/* Voice & Model Configuration Section */}
      <div className="relative p-5 sm:p-6 border-t border-white/[0.06] bg-zinc-950/40 space-y-6">
        {/* Header with Active Summary Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Voice Persona & AI Engine Model
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.06]">
                  ElevenLabs TTS
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Choose natural human voice personas and low-latency speech synthesis models
              </p>
            </div>
          </div>

          {/* Active Summary Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs font-mono self-start sm:self-auto">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-400">Active:</span>
            <span className="text-cyan-300 font-semibold">
              {activeVoiceObj ? activeVoiceObj.name : "Custom Voice"}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-sky-300 font-medium">{activeModelObj.name}</span>
            {justSaved && (
              <span className="ml-1 text-[11px] text-emerald-400 flex items-center gap-1 font-sans">
                <Check className="w-3 h-3" /> Saved!
              </span>
            )}
          </div>
        </div>

        {/* 1. AI Speech Synthesis Model Selection */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI Speech Model</span>
            </label>
            <span className="text-[11px] text-zinc-500 font-mono">
              Affects latency, natural cadence, and credit cost
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = selectedModelId === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelectModel(model.id)}
                  disabled={isSavingVoice}
                  className={cn(
                    "relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
                    isSelected
                      ? "bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30"
                      : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-zinc-400"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        isSelected ? "text-white" : "text-zinc-300"
                      )}
                    >
                      {model.name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded",
                        model.recommended
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-white/[0.04] text-zinc-400"
                      )}
                    >
                      {model.tag}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                    {model.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px] font-mono">
                    <code className="text-zinc-500">{model.id}</code>
                    {isSelected && (
                      <span className="text-cyan-400 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Voice Persona Selection (Female / Male / Custom) */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-pink-400" />
                <span>Voice Persona</span>
              </label>
              <span className="text-[11px] text-zinc-500">
                (Verified ElevenLabs premade voices - Free & Paid friendly)
              </span>
            </div>

            {/* Gender / Custom Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-950 border border-white/[0.08] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setVoiceGenderTab("female")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  voiceGenderTab === "female"
                    ? "bg-pink-500/20 text-pink-300 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Heart className="w-3 h-3 text-pink-400" />
                <span>Female Voices ({femaleVoices.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setVoiceGenderTab("male")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  voiceGenderTab === "male"
                    ? "bg-sky-500/20 text-sky-300 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <User className="w-3 h-3 text-sky-400" />
                <span>Male Voices ({maleVoices.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setVoiceGenderTab("custom")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  voiceGenderTab === "custom"
                    ? "bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Custom Voice ID</span>
              </button>
            </div>
          </div>

          {/* Female Voices Grid */}
          {voiceGenderTab === "female" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {femaleVoices.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => handleSelectVoice(voice.id)}
                    disabled={isSavingVoice}
                    className={cn(
                      "relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
                      isSelected
                        ? "bg-pink-500/10 border-pink-500/40 shadow-[0_0_15px_rgba(236,72,153,0.15)] ring-1 ring-pink-500/30"
                        : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-zinc-400"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            isSelected ? "text-white" : "text-zinc-200"
                          )}
                        >
                          {voice.name}
                        </span>
                        {voice.recommended && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            Recommended
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400">
                        {voice.accent}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                      {voice.description}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px] font-mono">
                      <code className="text-zinc-600 truncate max-w-[120px]">{voice.id}</code>
                      {isSelected ? (
                        <span className="text-pink-400 font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="text-zinc-500 hover:text-zinc-300">Select</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Male Voices Grid */}
          {voiceGenderTab === "male" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {maleVoices.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => handleSelectVoice(voice.id)}
                    disabled={isSavingVoice}
                    className={cn(
                      "relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
                      isSelected
                        ? "bg-sky-500/10 border-sky-500/40 shadow-[0_0_15px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/30"
                        : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-zinc-400"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            isSelected ? "text-white" : "text-zinc-200"
                          )}
                        >
                          {voice.name}
                        </span>
                        {voice.recommended && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            Recommended
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400">
                        {voice.accent}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                      {voice.description}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px] font-mono">
                      <code className="text-zinc-600 truncate max-w-[120px]">{voice.id}</code>
                      {isSelected ? (
                        <span className="text-sky-400 font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="text-zinc-500 hover:text-zinc-300">Select</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Custom Voice ID Tab */}
          {voiceGenderTab === "custom" && (
            <div className="space-y-3 p-4 rounded-xl bg-zinc-950/60 border border-white/[0.06]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Enter Custom Voice ID or Cloned Voice Token
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Paste your ElevenLabs Voice ID (e.g. from your ElevenLabs Voice Lab or Voice Library)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {customVoiceInput && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all cursor-pointer"
                      title="Copy Custom Voice ID"
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

                  {isCustomVoiceDirty && (
                    <button
                      type="button"
                      onClick={handleResetCustom}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all cursor-pointer"
                      title="Revert to current active voice"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="font-mono text-[11px]">Revert</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveCustomVoice}
                    disabled={!isCustomVoiceDirty || isSavingVoice}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm",
                      justSaved
                        ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                        : isCustomVoiceDirty
                        ? "bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white border border-cyan-400/30 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                        : "bg-white/[0.04] text-zinc-500 border border-white/[0.05] cursor-not-allowed"
                    )}
                  >
                    {isSavingVoice ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : justSaved ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Voice ID</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={customVoiceInput}
                onChange={(e) => setCustomVoiceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveCustomVoice();
                  }
                }}
                placeholder="Paste 20-character Voice ID (e.g. 21m00Tcm4TlvDq8ikWAM, EXAVITQu4vr4xnSDxMaL)..."
                className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-zinc-950/80 border border-white/[0.08] text-cyan-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
              />

              {customVoiceInput.trim() === "QTKSa2Iyv0yoxvXY2V8a" && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed space-y-1">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <span>⚠️ ElevenLabs Free API Restriction Notice:</span>
                  </div>
                  <p>
                    Voice ID <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-amber-200">QTKSa2Iyv0yoxvXY2V8a</code> (Neha P) is an ElevenLabs <strong>Community Library</strong> voice.
                  </p>
                  <p className="text-zinc-300">
                    ElevenLabs blocks Free Tier API accounts from using Community Library voices (returns <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-rose-300">HTTP 402: Free users cannot use library voices via the API</code>).
                  </p>
                  <p className="text-zinc-400 text-[11px]">
                    On free accounts, please select one of our curated Premade voices above (like <strong>Rachel</strong>, <strong>Sarah</strong>, or <strong>Alice</strong>), which work freely without restriction!
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span>
              Configured voice will use <strong className="text-cyan-400 font-semibold">{activeModelObj.name}</strong> for low-latency generation.
            </span>
            <span className="text-zinc-600">
              Vault key: <code className="text-zinc-500">voice_config.voice_model_id</code>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
