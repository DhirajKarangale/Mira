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
} from "lucide-react";
import type { AIConfig } from "@/services";
import { getProviderMeta } from "../types";
import { cn } from "@/lib/utils";

interface ProviderOverviewCardProps {
  provider: string;
  config: AIConfig | null;
  onAddNewKeyClick: () => void;
}

export const ProviderOverviewCard: FC<ProviderOverviewCardProps> = ({
  provider,
  config,
  onAddNewKeyClick,
}) => {
  const meta = getProviderMeta(provider);
  const [showCurrentKey, setShowCurrentKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const keys = config?.keys ?? [];
  const totalKeys = config?.total_keys ?? keys.length;
  const rawCurrentIndex = config?.current_key ?? 0;

  const hasKeys = keys.length > 0;
  // 1-indexed count as requested: count we got from backend + 1
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
      id={`provider-overview-${provider}`}
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl transition-all"
    >
      {/* Provider Details Header */}
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {meta.name} Credentials & Key Rotation
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              {meta.badge}
            </span>
          </div>
          <p className="text-xs text-zinc-400">{meta.tagline}</p>
        </div>

        {meta.docsUrl && (
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-all cursor-pointer self-start sm:self-auto"
          >
            <span>Get API Keys</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
        )}
      </div>

      {/* Primary Metrics: Total Keys & Highlighted Current Key */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Metric 1: Total Configured Keys */}
        <div
          id="stat-total-keys"
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
            Multi-key redundancy enables automated failover, load rotation, and rate-limit mitigation.
          </p>
        </div>

        {/* Metric 2: Current Key with Prominently Highlighted Count */}
        <div
          id="stat-current-key"
          className={cn(
            "relative overflow-hidden rounded-xl border p-5 backdrop-blur-md transition-all",
            hasKeys
              ? "border-cyan-500/40 bg-gradient-to-br from-cyan-950/30 via-zinc-950/60 to-zinc-950/50 shadow-[0_0_25px_rgba(6,182,212,0.1)]"
              : "border-white/[0.08] bg-zinc-950/50"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg",
                  hasKeys
                    ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
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
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                <Radio className="w-2.5 h-2.5 animate-pulse text-cyan-400" />
                <span>Active Key #{currentKey1Indexed}</span>
              </span>
            )}
          </div>

          {hasKeys ? (
            <div className="space-y-3">
              {/* Highlighted Count Display */}
              <div className="flex items-baseline gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                    CURRENT
                  </span>
                  <span className="text-3xl font-extrabold text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_12px_rgba(6,182,212,0.45)]">
                    Key #{currentKey1Indexed}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 font-mono">
                  (of {totalKeys} {totalKeys === 1 ? "key" : "keys"})
                </span>
              </div>

              {/* Masked Key Display with Eye Toggle */}
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-900/80 border border-white/10">
                <span className="font-mono text-xs text-zinc-200 truncate select-all px-1">
                  {showCurrentKey ? activeKeyRaw : maskKey(activeKeyRaw)}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    id="btn-toggle-current-key-visibility"
                    onClick={() => setShowCurrentKey((prev) => !prev)}
                    title={showCurrentKey ? "Mask key" : "Show key"}
                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showCurrentKey ? (
                      <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    id="btn-copy-current-key"
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
                <span>Active credential dispatched for inference & tools</span>
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
                This provider cannot process LLM requests until at least one API key is added.
              </p>
              <button
                type="button"
                onClick={onAddNewKeyClick}
                className="mt-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4 cursor-pointer"
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
