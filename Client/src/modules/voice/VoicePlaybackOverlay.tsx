import { type FC } from "react";
import {
  AudioLines,
  SkipForward,
  Square,
  Layers,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useVoiceQueue } from "./useVoiceQueue";
import { useVoiceStore } from "@/store/useVoiceStore";
import { cn } from "@/lib/utils";

/**
 * Voice Playback Overlay
 * Centralized floating overlay widget that displays the currently playing
 * voice response, chunk progress, full volume status, pending queue count,
 * and provides skip/stop controls.
 */
export const VoicePlaybackOverlay: FC = () => {
  const { currentResponse, pendingResponses, stopCurrent, stopAll } =
    useVoiceQueue();
  const volume = useVoiceStore((s) => s.volume);
  const setVolume = useVoiceStore((s) => s.setVolume);
  const maximizeVolume = useVoiceStore((s) => s.maximizeVolume);
  const superBoostVolume = useVoiceStore((s) => s.superBoostVolume);

  if (!currentResponse && pendingResponses.length === 0) {
    return null;
  }

  const currentChunkIdx = currentResponse?.currentChunkIndex ?? 0;
  const totalChunks = currentResponse?.chunks.length ?? 0;
  const pendingCount = pendingResponses.length;

  const previewText =
    currentResponse?.chunks[currentChunkIdx]?.text ||
    currentResponse?.cleanText ||
    "Generating speech...";

  return (
    <aside
      id="voice-playback-overlay"
      aria-label="Voice Playback Controls"
      className="fixed bottom-5 right-5 z-50 max-w-md w-[calc(100vw-2.5rem)] rounded-2xl border border-cyan-500/30 bg-zinc-950/90 backdrop-blur-xl p-3.5 shadow-2xl shadow-cyan-950/50 text-white transition-all animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Animated Soundwave Indicator */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
            <AudioLines className="w-4 h-4 animate-pulse text-cyan-300" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold tracking-wide uppercase text-cyan-400 flex items-center gap-1.5">
                <Volume2 className="w-3 visual-icon inline text-cyan-300" />
                <span>MIRA Voice</span>
              </span>

              {totalChunks > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.08] text-zinc-300 border border-white/[0.06]">
                  Part {currentChunkIdx + 1}/{totalChunks}
                </span>
              )}

              {/* Volume Status Badge / Quick Multi-Boost Toggle */}
              <button
                type="button"
                id="btn-voice-overlay-volume-toggle"
                onClick={() => {
                  if (volume === 0) {
                    maximizeVolume();
                  } else if (volume <= 1.05) {
                    superBoostVolume(1.5);
                  } else if (volume <= 1.55) {
                    superBoostVolume(2.0);
                  } else {
                    setVolume(0);
                  }
                }}
                title={`Playback Volume: ${Math.round(volume * 100)}% (Click to cycle 100% -> 150% -> 200% -> Mute)`}
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.2 rounded border flex items-center gap-1 transition-all cursor-pointer",
                  volume > 1.0
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                    : volume > 0
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                      : "bg-zinc-800 text-zinc-400 border-white/10 hover:bg-zinc-700"
                )}
              >
                {volume === 0 ? (
                  <VolumeX className="w-2.5 h-2.5 text-zinc-400" />
                ) : (
                  <Volume2 className={cn("w-2.5 h-2.5", volume > 1.0 ? "text-amber-400" : "text-emerald-400")} />
                )}
                <span>
                  {volume === 0 ? "Muted" : `${Math.round(volume * 100)}%${volume > 1.0 ? " Boost" : " Full"}`}
                </span>
              </button>

              {pendingCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <Layers className="w-2.5 h-2.5" />
                  <span>+{pendingCount}</span>
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-200 truncate mt-0.5 max-w-[230px] sm:max-w-[280px]">
              {previewText}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Maximize Volume Quick Action if muted or lower */}
          {volume < 1 && (
            <button
              type="button"
              id="btn-voice-overlay-max-vol"
              onClick={maximizeVolume}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all cursor-pointer"
              title="Maximize volume to 100% Full"
              aria-label="Maximize volume"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Skip Current Response */}
          <button
            type="button"
            id="btn-voice-overlay-skip"
            onClick={stopCurrent}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all cursor-pointer"
            title="Skip current voice response"
            aria-label="Skip to next response"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Stop All Playback */}
          <button
            type="button"
            id="btn-voice-overlay-stop"
            onClick={stopAll}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-rose-400 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all cursor-pointer shadow-sm shadow-rose-950/40"
            title="Stop all voice playback and clear queue"
            aria-label="Stop playback"
          >
            <Square className="w-3 h-3 fill-rose-400" />
          </button>
        </div>
      </div>
    </aside>
  );
};
