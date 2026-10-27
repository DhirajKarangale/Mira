import { useState, type FC } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Radio,
  CheckCircle2,
  AlertTriangle,
  AudioLines,
} from "lucide-react";
import type { VoiceModel } from "@/services";
import { cn } from "@/lib/utils";

interface ElevenLabsOverviewCardProps {
  model: VoiceModel | null;
  onAddNewKeyClick: () => void;
}

export const ElevenLabsOverviewCard: FC<ElevenLabsOverviewCardProps> = ({
  model,
  onAddNewKeyClick,
}) => {
  const [showCurrentKey, setShowCurrentKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const keys = model?.keys ?? [];
  const totalKeys = model?.total_keys ?? keys.length;
  const rawCurrentIndex = model?.current_key ?? 0;

  const hasKeys = keys.length > 0;
  const currentKey1Indexed = hasKeys ? rawCurrentIndex + 1 : 0;
  const activeKeyRaw = hasKeys
    ? keys[Math.max(0, Math.min(rawCurrentIndex, keys.length - 1))] || ""
    : "";

  const handleCopy = () => {
    if (!activeKeyRaw) return;
    navigator.clipboard.writeText(activeKeyRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskKey = (key: string): string => {
    if (!key) return "••••••••••••••••";
    if (key.length <= 8) return "••••••••••••••••";
    const prefix = key.slice(0, 4);
    const suffix = key.slice(-4);
    return `${prefix}••••••••••••••••${suffix}`;
  };

  return (
    <div
      id="elevenlabs-overview-card"
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl transition-all"
    >
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400">
              <AudioLines className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              ElevenLabs Voice Model & Key Rotation
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border border-sky-500/25 bg-sky-500/10 text-sky-300">
              Voice Synthesis
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Generative voice synthesis, realistic AI speech, and secure key rotation in Vault
          </p>
        </div>

        <a
          href="https://elevenlabs.io/app/settings/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-all cursor-pointer self-start sm:self-auto"
        >
          <span>Get ElevenLabs API Keys</span>
          <ExternalLink className="w-3 h-3 text-zinc-400" />
        </a>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stat Box 1: Total Keys */}
        <div
          id="stat-total-keys-elevenlabs"
          className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/50 p-5 backdrop-blur-md transition-all hover:border-white/15"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Total Keys
              </span>
            </div>

            <span
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium",
                totalKeys > 0
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
              )}
            >
              {totalKeys > 0 ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{totalKeys} Stored</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  <span>0 Configured</span>
                </>
              )}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {totalKeys}
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              {totalKeys === 1 ? "key configured" : "keys configured"}
            </span>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Multi-key redundancy enables automated voice failover, quota pooling, and rate-limit mitigation.
          </p>
        </div>

        {/* Stat Box 2: Current Active Key */}
        <div
          id="stat-current-key-elevenlabs"
          className={cn(
            "relative overflow-hidden rounded-xl border p-5 backdrop-blur-md transition-all",
            hasKeys
              ? "border-sky-500/40 bg-gradient-to-br from-sky-950/30 via-zinc-950/60 to-zinc-950/50 shadow-[0_0_25px_rgba(14,165,233,0.1)]"
              : "border-white/[0.08] bg-zinc-950/50"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg",
                  hasKeys
                    ? "bg-sky-500/20 border border-sky-500/40 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.25)]"
                    : "bg-zinc-800/80 border border-white/10 text-zinc-400"
                )}
              >
                <Key className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Current Key
              </span>
            </div>

            {hasKeys && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-sky-500/20 border border-sky-500/40 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.25)]">
                <Radio className="w-2.5 h-2.5 animate-pulse text-sky-400" />
                <span>Active Key #{currentKey1Indexed}</span>
              </span>
            )}
          </div>

          {hasKeys ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-sky-500/25 border border-sky-400/40 text-sky-200 shadow-[0_0_12px_rgba(14,165,233,0.3)]">
                    CURRENT
                  </span>
                  <span className="text-3xl font-extrabold text-sky-300 font-mono tracking-tight drop-shadow-[0_0_12px_rgba(14,165,233,0.45)]">
                    Key #{currentKey1Indexed}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 font-mono">
                  (of {totalKeys} {totalKeys === 1 ? "key" : "keys"})
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-900/80 border border-white/10">
                <span className="font-mono text-xs text-zinc-200 truncate select-all px-1">
                  {showCurrentKey ? activeKeyRaw : maskKey(activeKeyRaw)}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    id="btn-toggle-elevenlabs-current-key-visibility"
                    onClick={() => setShowCurrentKey((prev) => !prev)}
                    title={showCurrentKey ? "Mask key" : "Show key"}
                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showCurrentKey ? (
                      <EyeOff className="w-3.5 h-3.5 text-sky-400" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    id="btn-copy-elevenlabs-current-key"
                    onClick={handleCopy}
                    title="Copy current key"
                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>Active credential dispatched for ElevenLabs voice generation</span>
                {copied && (
                  <span className="text-emerald-400 font-mono">Copied to clipboard!</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 pt-1">
              <span className="text-sm font-semibold text-zinc-400">
                No active key available
              </span>
              <p className="text-[11px] text-zinc-500">
                ElevenLabs speech synthesis cannot operate until at least one API key is added.
              </p>
              <button
                type="button"
                onClick={onAddNewKeyClick}
                className="mt-1 text-xs text-sky-400 hover:text-sky-300 font-medium underline underline-offset-4 cursor-pointer"
              >
                + Add your first key now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
