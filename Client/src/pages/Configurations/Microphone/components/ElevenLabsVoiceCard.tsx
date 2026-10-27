import { useState, type FC } from "react";
import {
  Volume2,
  Square,
  Play,
  Key,
  Layers,
  Sparkles,
  Plus,
  ChevronDown,
  ExternalLink,
  Info,
} from "lucide-react";
import { useTTS } from "@/hooks/useTTS";
import { smartChunkText, type TTSChunk } from "@/utils/ttsChunker";
import { toast } from "@/components";
import { cn } from "@/lib/utils";

const SAMPLE_LANGCHAIN_TEXT = `LangChain is an open-source framework designed for building applications with large language models (LLMs). It helps connect models to external data sources, tools, and APIs.

Key components include:
*   Chains: Sequences of calls to LLMs and other components.
*   Retrieval-Augmented Generation (RAG): Integrates external knowledge bases with LLMs.
*   Agents: Enables LLMs to use tools and make decisions dynamically.
*   Memory: Manages conversation history and state.
*   Integrations: Supports numerous LLM providers (OpenAI, Anthropic, Hugging Face, etc.), vector stores, and data sources.

The framework is primarily written in Python, and a JavaScript/TypeScript version (LangChain.js) is also available.`;

const SAMPLE_SHORT_TEXT =
  "Hello! This is Mira powered by ElevenLabs text-to-speech. Speech is streamed in smooth, ~100-character chunks with zero audible latency.";

export const ElevenLabsVoiceCard: FC = () => {
  const [inputText, setInputText] = useState<string>(SAMPLE_LANGCHAIN_TEXT);
  const [showChunks, setShowChunks] = useState<boolean>(true);
  const [newKeyInput, setNewKeyInput] = useState<string>("");
  const [isAddingKey, setIsAddingKey] = useState<boolean>(false);

  const {
    speak,
    stop,
    isPlaying,
    currentChunk,
    totalChunks,
    currentKeyIndex,
    keys,
    addKey,
    selectedVoiceId,
    setSelectedVoiceId,
    availableVoices,
  } = useTTS();

  const activeVoice =
    availableVoices.find((v) => v.id === selectedVoiceId) || availableVoices[0];

  const previewChunks: TTSChunk[] = smartChunkText(inputText, 100);

  const handlePlay = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to speak");
      return;
    }

    try {
      toast.success(
        `Starting speech: ${previewChunks.length} chunks planned (~100c each)`,
        { title: "ElevenLabs TTS" }
      );
      await speak(inputText);
    } catch (err: any) {
      toast.error(err?.message || "Failed to start speech synthesis", {
        title: "TTS Error",
      });
    }
  };

  const handleAddKey = () => {
    const trimmed = newKeyInput.trim();
    if (!trimmed) return;
    addKey(trimmed);
    setNewKeyInput("");
    setIsAddingKey(false);
    toast.success("New ElevenLabs key added to rotation array", {
      title: "Key Pool Updated",
    });
  };

  const activeKeyMasked =
    keys[currentKeyIndex]
      ? `${keys[currentKeyIndex].substring(0, 10)}...${keys[currentKeyIndex].slice(-4)}`
      : "No Key Configured";

  return (
    <div
      id="elevenlabs-voice-tts-card"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-xl shadow-xl p-5 sm:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white">
                ElevenLabs Voice TTS
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                eleven_turbo_v2_5
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hidden sm:inline">
                ~100 chars/chunk
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Asynchronous Web Worker streaming with gapless Web Audio scheduler & auto-key rotation
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-zinc-800/80 border border-white/10 text-zinc-300">
            <Key className="w-3 h-3 text-amber-400" />
            <span>Key {currentKeyIndex + 1}/{keys.length}:</span>
            <span className="text-amber-300">{activeKeyMasked}</span>
          </div>

          {isPlaying && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-violet-950/80 border border-violet-500/40 text-violet-300 animate-pulse">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              <span>Chunk {currentChunk || 1} / {totalChunks || previewChunks.length}</span>
            </span>
          )}
        </div>
      </div>

      {/* Voice Model Selector Dropdown & Profile */}
      <div className="rounded-xl bg-zinc-950/50 border border-white/10 p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label
            htmlFor="elevenlabs-voice-dropdown"
            className="flex items-center gap-2 text-xs font-semibold text-zinc-200"
          >
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span>Select ElevenLabs Voice Model:</span>
          </label>
          <span className="text-[11px] text-zinc-400 font-mono">
            {activeVoice?.category === "library"
              ? "🌟 Requested Community Model"
              : "⚡ Premade Standard Voice"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <select
              id="elevenlabs-voice-dropdown"
              value={selectedVoiceId}
              onChange={(e) => {
                setSelectedVoiceId(e.target.value);
                const chosen = availableVoices.find((v) => v.id === e.target.value);
                if (chosen) {
                  toast.success(`Active voice changed to ${chosen.name}`, {
                    title: "Voice Model Updated",
                  });
                }
              }}
              className="w-full appearance-none rounded-xl bg-zinc-900/90 border border-white/15 px-3.5 py-2.5 pr-10 text-xs sm:text-sm font-medium text-white shadow-inner focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 cursor-pointer"
            >
              <optgroup label="🌟 Requested Voice Models (ElevenLabs Voice Library)">
                {availableVoices
                  .filter((v) => v.category === "library")
                  .map((v) => (
                    <option key={v.id} value={v.id} className="bg-zinc-900 text-white">
                      {v.name} ({v.gender}) — {v.description}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Standard Premade Voices (Free & Paid)">
                {availableVoices
                  .filter((v) => v.category === "premade")
                  .map((v) => (
                    <option key={v.id} value={v.id} className="bg-zinc-900 text-zinc-300">
                      {v.name} ({v.gender}) — {v.description}
                    </option>
                  ))}
              </optgroup>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          </div>

          {activeVoice?.url && (
            <a
              href={activeVoice.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 hover:text-violet-200 border border-violet-500/30 text-xs font-mono transition-colors shrink-0"
              title={`Open ${activeVoice.name} model page on ElevenLabs`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open on ElevenLabs</span>
            </a>
          )}
        </div>

        {/* Selected Voice Profile & Tier Guidance */}
        {activeVoice && (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-900/70 border border-white/5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">{activeVoice.name}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  ID: {activeVoice.id}
                </span>
                {activeVoice.badge && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {activeVoice.badge}
                  </span>
                )}
                <span className="text-[11px] text-zinc-400 capitalize">
                  ({activeVoice.gender})
                </span>
              </div>
            </div>
            <p className="text-zinc-300 text-xs leading-relaxed">{activeVoice.description}</p>
            {activeVoice.category === "library" && (
              <div className="flex items-start gap-1.5 pt-1 text-[11px] text-amber-300/90 font-mono">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  Library Community Voice: Requires an ElevenLabs paid subscription key. If your active key is on a free tier, Mira automatically fails over to Sarah so speech never breaks.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preset Quick Fill Buttons */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-zinc-400 text-[11px] font-medium mr-1">Sample Text:</span>
        <button
          type="button"
          onClick={() => setInputText(SAMPLE_LANGCHAIN_TEXT)}
          className="px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer"
        >
          LangChain Architecture (9 Chunks)
        </button>
        <button
          type="button"
          onClick={() => setInputText(SAMPLE_SHORT_TEXT)}
          className="px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer"
        >
          Short Welcome Test (2 Chunks)
        </button>
        <button
          type="button"
          onClick={() => setShowChunks(!showChunks)}
          className="ml-auto px-2.5 py-1 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/5 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>{showChunks ? "Hide Chunks" : `Inspect Chunks (${previewChunks.length})`}</span>
        </button>
      </div>

      {/* Input Text Area */}
      <div className="space-y-2">
        <textarea
          rows={5}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter or paste text to convert to speech..."
          className="w-full rounded-xl bg-zinc-950/60 border border-white/10 p-3 text-xs sm:text-[13px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 leading-relaxed font-mono resize-y"
        />
        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono px-1">
          <span>Total: {inputText.length} characters</span>
          <span>Calculated: {previewChunks.length} chunks (~100 chars each)</span>
        </div>
      </div>

      {/* Visual Chunk Breakdown Inspector */}
      {showChunks && previewChunks.length > 0 && (
        <div className="rounded-xl bg-zinc-950/40 border border-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-b border-white/5 pb-2">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Smart Chunking Preview (Sequence Preserved):</span>
            </span>
            <span className="text-zinc-500">Target: ~100 chars • No word splitting</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
            {previewChunks.map((chunk) => {
              const isActive = isPlaying && currentChunk === chunk.index + 1;
              return (
                <div
                  key={chunk.index}
                  className={cn(
                    "flex items-start gap-2.5 p-2 rounded-lg text-xs font-mono transition-all",
                    isActive
                      ? "bg-violet-950/70 border border-violet-500/50 text-violet-200 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                      : "bg-zinc-900/60 border border-white/5 text-zinc-300"
                  )}
                >
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0",
                      isActive
                        ? "bg-violet-500 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    )}
                  >
                    #{chunk.index + 1}
                  </span>
                  <span className="flex-1 break-words">{chunk.text}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {chunk.charCount}c
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary Play / Stop Controls */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          id="btn-play-elevenlabs-voice"
          onClick={isPlaying ? stop : handlePlay}
          className={cn(
            "flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-xs sm:text-sm shadow-lg transition-all duration-150 cursor-pointer",
            isPlaying
              ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 active:scale-95 animate-pulse"
              : "bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-600/30 active:scale-95"
          )}
        >
          {isPlaying ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Speech (Playing Chunk {currentChunk}/{totalChunks})</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Play Voice (One-Stroke TTS)</span>
            </>
          )}
        </button>

        {isPlaying && (
          <button
            type="button"
            onClick={stop}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isAddingKey ? (
            <button
              type="button"
              onClick={() => setIsAddingKey(true)}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-mono"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Backup Key</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="sk_..."
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg bg-zinc-950 border border-white/20 text-white font-mono w-36 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleAddKey}
                className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-xs cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setIsAddingKey(false)}
                className="px-2 py-1 text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
