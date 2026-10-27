import type { FC } from "react";
import {
  Volume2,
  VolumeX,
  Keyboard,
  Lock,
  Loader2,
} from "lucide-react";
import type { VoiceConfig, VoiceConfigUpdateRequest } from "@/services";
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
                    Voice Playback While Typing
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
    </div>
  );
};
