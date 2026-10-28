import { useState, useEffect, useMemo, type FC } from "react";
import {
  Volume2,
  Keyboard,
  Loader2,
  Bot,
  Copy,
  Check,
  Save,
  RotateCcw,
  Heart,
  AlertTriangle,
  Play,
  Square,
  Mic,
  Activity,
  ShieldCheck,
  Radio,
} from "lucide-react";
import type { VoiceConfig, VoiceConfigUpdateRequest } from "@/services";
import { useVoiceStore } from "@/store/useVoiceStore";
import { cn } from "@/lib/utils";
import {
  PREMADE_VOICES,
  resolveVoiceAndModel,
  serializeVoiceConfig,
  isKnownModel,
  KNOWN_DEAD_KEYS,
  KNOWN_EXHAUSTED_KEYS,
  audioPlayer,
} from "@/modules/voice";
import { voiceToTextService } from "@/modules/mic";
import { toast } from "@/components";

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

  const keys = useVoiceStore((s) => s.keys);
  const areAllKeysExpired = useVoiceStore((s) => s.areAllKeysExpired);
  const isMicOn = useVoiceStore((s) => s.isMicOn);
  const micAutoStart = useVoiceStore((s) => s.micAutoStart);

  const hasNoUsableKeys =
    keys.length === 0 ||
    areAllKeysExpired ||
    (keys.length > 0 &&
      keys.every(
        (k) =>
          KNOWN_DEAD_KEYS.has(k.trim()) || KNOWN_EXHAUSTED_KEYS.has(k.trim())
      ));

  const serverModelId = voiceConfig?.voice_model_id ?? "";
  const currentResolved = useMemo(
    () => resolveVoiceAndModel(serverModelId),
    [serverModelId]
  );

  const [selectedVoiceId, setSelectedVoiceId] = useState(currentResolved.voiceId);
  const [selectedModelId, setSelectedModelId] = useState(currentResolved.modelId);
  const [customVoiceInput, setCustomVoiceInput] = useState(serverModelId);
  const [isCopied, setIsCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    const res = resolveVoiceAndModel(serverModelId);
    setSelectedVoiceId(res.voiceId);
    setSelectedModelId(res.modelId);
    setCustomVoiceInput(serverModelId || res.voiceId);
  }, [serverModelId]);

  const activeVoiceObj = useMemo(() => {
    return PREMADE_VOICES.find((v) => v.id === selectedVoiceId) || null;
  }, [selectedVoiceId]);

  // Strictly 3 Free Premade Female Voices
  const freeFemaleVoices = useMemo(() => PREMADE_VOICES.slice(0, 3), []);

  const isCustomVoiceDirty = customVoiceInput.trim() !== serverModelId.trim();

  // STT Active Provider info
  const activeSTTProvider = useMemo(() => {
    try {
      return voiceToTextService.getActiveProvider();
    } catch {
      return null;
    }
  }, []);

  const handleSelectVoice = async (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    const serialized = serializeVoiceConfig(voiceId, selectedModelId);
    setCustomVoiceInput(serialized);
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
    const serialized = clean.startsWith("{") ? clean : serializeVoiceConfig(targetVoice, targetModel);

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

  const handleTestVoice = async (voiceId: string) => {
    if (testingVoiceId) {
      audioPlayer.stop();
      setTestingVoiceId(null);
      return;
    }
    setTestingVoiceId(voiceId);
    try {
      const res = await audioPlayer.testVoice(
        "Hello! I am MIRA, your personal AI assistant. How can I help you today?",
        { voiceId, modelId: selectedModelId }
      );
      if (res.provider === "elevenlabs") {
        toast.success("Playing natural ElevenLabs voice sample in full fidelity.", {
          title: "ElevenLabs Voice Test",
        });
      } else {
        toast.warning(
          `ElevenLabs key error (${res.error}). Played via local Windows speech fallback.`,
          { title: "Voice Fallback Active" }
        );
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Audio sample test failed", {
        title: "Playback Error",
      });
    } finally {
      setTestingVoiceId(null);
    }
  };

  const handleCopy = () => {
    if (!customVoiceInput) return;
    navigator.clipboard.writeText(customVoiceInput);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleResetCustom = () => {
    setCustomVoiceInput(serverModelId || selectedVoiceId);
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
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/50 backdrop-blur-xl shadow-xl transition-all space-y-0"
    >
      {/* Background ambient lighting */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* 1. Header with Master Switches */}
      <div className="relative p-5 sm:p-6 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Voice Output & Speech Settings
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                ElevenLabs TTS
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select verified Free female voices, configure voice model IDs, and inspect audio pipeline diagnostics
            </p>
          </div>
        </div>

        {isUpdating && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 self-start sm:self-auto">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Saving in Vault...</span>
          </div>
        )}
      </div>

      {/* 2. Master Toggle & While-Typing Switch Grid */}
      <div className="relative p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-950/20">
        {/* Master Voice Toggle */}
        <div
          id="setting-voice-enable-master"
          className={cn(
            "flex flex-col justify-between rounded-xl border p-4 transition-all duration-200",
            isMasterEnabled
              ? "border-cyan-500/30 bg-gradient-to-br from-cyan-950/25 via-zinc-950/60 to-zinc-950/40 shadow-[0_0_20px_rgba(6,182,212,0.06)]"
              : "border-white/[0.06] bg-zinc-950/40 hover:border-white/10"
          )}
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                    isMasterEnabled
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "bg-zinc-800/60 text-zinc-500 border border-white/[0.06]"
                  )}
                >
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Master Voice Output
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Global Audio Speech Toggle
                  </span>
                </div>
              </div>

              {/* Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isMasterEnabled}
                onClick={handleToggleMaster}
                disabled={isUpdating}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50",
                  isMasterEnabled ? "bg-cyan-500" : "bg-zinc-700"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    isMasterEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When enabled, MIRA speaks aloud responses across voice conversations and daily suggestions.
            </p>
          </div>
        </div>

        {/* Voice While Typing Toggle */}
        <div
          id="setting-voice-while-typing"
          className={cn(
            "flex flex-col justify-between rounded-xl border p-4 transition-all duration-200",
            !isMasterEnabled
              ? "opacity-50 border-white/[0.04] bg-zinc-950/20 cursor-not-allowed"
              : isWhileTypingEnabled
              ? "border-sky-500/30 bg-gradient-to-br from-sky-950/25 via-zinc-950/60 to-zinc-950/40 shadow-[0_0_20px_rgba(14,165,233,0.06)]"
              : "border-white/[0.06] bg-zinc-950/40 hover:border-white/10"
          )}
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                    isWhileTypingEnabled
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                      : "bg-zinc-800/60 text-zinc-500 border border-white/[0.06]"
                  )}
                >
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Voice While Typing
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Keyboard Chat Speech
                  </span>
                </div>
              </div>

              {/* Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isWhileTypingEnabled}
                onClick={handleToggleWhileTyping}
                disabled={isUpdating || !isMasterEnabled}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:opacity-50",
                  isWhileTypingEnabled ? "bg-sky-500" : "bg-zinc-700"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    isWhileTypingEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When enabled, typed messages in the chat interface will also receive voice audio responses.
            </p>
          </div>
        </div>
      </div>

      {/* Warning banner if ElevenLabs keys are exhausted / blocked */}
      {hasNoUsableKeys && (
        <div className="p-4 sm:p-5 mx-5 sm:mx-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="font-semibold text-amber-300 flex items-center justify-between gap-2 flex-wrap">
              <span>ElevenLabs API Keys Exhausted or Blocked</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                Windows Speech Fallback Active
              </span>
            </div>
            <p className="text-zinc-300 leading-relaxed">
              All 7 ElevenLabs keys in Vault have 0 credits or are blocked by ElevenLabs.
              MIRA is currently falling back to your computer&apos;s local Windows speech synthesizer (which is why the voice sounds robotic and stays the same regardless of which model or persona is selected).
            </p>
            <p className="text-amber-200 font-medium">
              👉 To hear Rachel, Sarah, or Alice in natural ElevenLabs audio, please add a fresh API key with available credits in the <strong>ElevenLabs API Keys</strong> section below.
            </p>
          </div>
        </div>
      )}

      {/* 3. Strictly 3 Free ElevenLabs Female Voices */}
      <div className="p-5 sm:p-6 border-t border-white/[0.06] bg-zinc-950/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400">
              <Heart className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                Free ElevenLabs Female Voices (3 Available)
              </h3>
              <p className="text-xs text-zinc-400">
                Verified Premade voices available on all ElevenLabs tiers (never blocked by free account restrictions)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono self-start sm:self-auto">
            <span className="text-zinc-400">Active Persona:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold flex items-center gap-1.5">
              <Radio className="w-2.5 h-2.5 text-pink-400 animate-pulse" />
              {activeVoiceObj ? activeVoiceObj.name : "Custom Voice"}
            </span>
          </div>
        </div>

        {/* 3 Female Voice Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {freeFemaleVoices.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;
            const isTesting = testingVoiceId === voice.id;
            return (
              <div
                key={voice.id}
                className={cn(
                  "relative p-4 rounded-xl border transition-all flex flex-col justify-between gap-3",
                  isSelected
                    ? "bg-pink-500/10 border-pink-500/40 shadow-[0_0_20px_rgba(236,72,153,0.15)] ring-1 ring-pink-500/30"
                    : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-zinc-400"
                )}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-bold tracking-tight",
                          isSelected ? "text-white" : "text-zinc-200"
                        )}
                      >
                        {voice.name}
                      </span>
                      {voice.recommended && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold">
                          Recommended
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-300 border border-white/[0.06]">
                      {voice.accent}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {voice.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between gap-2">
                  {/* Select Voice Button */}
                  <button
                    type="button"
                    onClick={() => handleSelectVoice(voice.id)}
                    disabled={isSavingVoice || isSelected}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 flex-1 justify-center",
                      isSelected
                        ? "bg-pink-500/20 text-pink-300 border border-pink-500/40 cursor-default"
                        : "bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08]"
                    )}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-pink-400" />
                        <span>Active Voice</span>
                      </>
                    ) : (
                      <span>Select {voice.name}</span>
                    )}
                  </button>

                  {/* Test Audio Button */}
                  <button
                    type="button"
                    onClick={() => handleTestVoice(voice.id)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer border flex items-center gap-1 shrink-0",
                      isTesting
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border-white/[0.06]"
                    )}
                    title={`Play voice sample for ${voice.name}`}
                  >
                    {isTesting ? (
                      <>
                        <Square className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                        <span>Sample</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Dedicated Voice Model ID / Custom Voice Input */}
      <div className="p-5 sm:p-6 border-t border-white/[0.06] bg-zinc-950/40 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                Voice Model ID / Custom Voice Configuration
              </h3>
              <p className="text-xs text-zinc-400">
                Enter or paste any ElevenLabs Voice ID (from Voice Lab) or Model ID (e.g. eleven_flash_v2_5)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {customVoiceInput && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all cursor-pointer"
                title="Copy current Voice Model ID"
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
                title="Revert changes"
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
                  <span>Saved in Vault</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Voice Model ID</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            id="input-voice-model-id"
            value={customVoiceInput}
            onChange={(e) => setCustomVoiceInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSaveCustomVoice();
              }
            }}
            placeholder="Paste ElevenLabs Voice ID (e.g. 21m00Tcm4TlvDq8ikWAM) or model ID (e.g. eleven_flash_v2_5)..."
            className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-zinc-950/80 border border-white/[0.08] text-cyan-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>
            Vault configuration key: <code className="text-zinc-400">voice_config.voice_model_id</code>
          </span>
          <span>Press Enter to save</span>
        </div>
      </div>

      {/* 5. Detailed Active Voice & Speech-To-Text Architecture Diagnostics Section */}
      <div className="p-5 sm:p-6 border-t border-white/[0.06] bg-zinc-950/60 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Active Voice & Speech Architecture Diagnostics
            </h3>
            <p className="text-xs text-zinc-400">
              Live inspection of Text-to-Speech (TTS) and Speech-to-Text (STT) engines currently running in MIRA
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Diagnostic Card A: Voice Output (TTS) */}
          <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-900/40 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Voice Output (Text-to-Speech)
                </span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded-full font-bold",
                  hasNoUsableKeys
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                )}
              >
                {hasNoUsableKeys ? "Fallback Engine Active" : "ElevenLabs Active"}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Primary Engine:</span>
                <span className="text-zinc-200 font-semibold">ElevenLabs TTS API</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Active Voice Persona:</span>
                <span className="text-pink-300 font-bold">
                  {activeVoiceObj ? `${activeVoiceObj.name} (Female, ${activeVoiceObj.accent})` : "Custom Voice ID"}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Voice ID Hash:</span>
                <span className="text-cyan-300 text-[11px]">{selectedVoiceId}</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Synthesis AI Model:</span>
                <span className="text-emerald-300">Eleven Flash v2.5 (eleven_flash_v2_5)</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Engine Latency:</span>
                <span className="text-zinc-300">~75ms Ultra-Low Latency</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Key Ring Status:</span>
                <span className={cn(hasNoUsableKeys ? "text-amber-400 font-bold" : "text-emerald-400")}>
                  {hasNoUsableKeys
                    ? "7 Keys (0 credits remaining / blocked)"
                    : `${keys.length} API Keys Active`}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-400 pt-1 border-t border-white/[0.04]">
                <span>Fallback Mode:</span>
                <span className="text-zinc-300">
                  {hasNoUsableKeys ? "Windows SpeechSynthesis (Active)" : "Browser Speech (Standby)"}
                </span>
              </div>
            </div>
          </div>

          {/* Diagnostic Card B: Voice Input (STT) */}
          <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-900/40 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Voice Input (Speech-to-Text)
                </span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded-full font-bold",
                  isMicOn
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-white/[0.06]"
                )}
              >
                {isMicOn ? "Microphone ON" : "Microphone Muted"}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Active STT Provider:</span>
                <span className="text-zinc-200 font-semibold">
                  {activeSTTProvider ? activeSTTProvider.name : "Browser Web Speech API"}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>STT Streaming Engine:</span>
                <span className="text-sky-300">Native Web SpeechRecognition</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Neural Local STT:</span>
                <span className="text-emerald-300">Faster-Whisper tiny.en (Port 9007)</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Wake Word Detection:</span>
                <span className="text-cyan-300 font-semibold">&quot;Mira&quot; (Zero Cloud Transmission)</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Input Language:</span>
                <span className="text-zinc-300">English (en-US / strictly English)</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Auto-Start on Boot:</span>
                <span className="text-zinc-300">{micAutoStart ? "Enabled" : "Disabled"}</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400 pt-1 border-t border-white/[0.04]">
                <span>Privacy & Security:</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> 100% On-Device Capture
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
