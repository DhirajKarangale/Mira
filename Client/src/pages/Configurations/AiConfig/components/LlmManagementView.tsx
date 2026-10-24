import { useMemo, type FC } from "react";
import {
  Workflow,
  Cpu,
  Zap,
  Sparkles,
  ShieldCheck,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Activity,
  Key,
} from "lucide-react";
import { ProviderPriorityCard } from "./ProviderPriorityCard";
import { getProviderMeta } from "../types";
import type { AIConfig } from "@/services";
import { cn } from "@/lib/utils";

interface LlmManagementViewProps {
  providers: string[];
  priorities: string[];
  configsMap: Record<string, AIConfig>;
  onSavePriorities: (newPriorities: string[]) => Promise<void>;
  onSelectProvider: (provider: string) => void;
  isUpdating: boolean;
}

export const LlmManagementView: FC<LlmManagementViewProps> = ({
  providers,
  priorities,
  configsMap,
  onSavePriorities,
  onSelectProvider,
  isUpdating,
}) => {
  // Determine primary and secondary providers based on current sequence
  const primaryProvider = providers[0] || "groq";
  const secondaryProvider = providers[1] || "gemini";

  const primaryMeta = getProviderMeta(primaryProvider);
  const primaryConfig = configsMap[primaryProvider.toLowerCase()];
  const primaryKeysCount = primaryConfig?.total_keys ?? primaryConfig?.keys?.length ?? 0;
  const primaryHasKeys = primaryKeysCount > 0;

  const secondaryMeta = getProviderMeta(secondaryProvider);
  const secondaryConfig = configsMap[secondaryProvider.toLowerCase()];
  const secondaryKeysCount = secondaryConfig?.total_keys ?? secondaryConfig?.keys?.length ?? 0;

  // Aggregate stats
  const totalKeysAcrossAll = useMemo(() => {
    return Object.values(configsMap).reduce((sum, cfg) => {
      const count = cfg?.total_keys ?? cfg?.keys?.length ?? 0;
      return sum + count;
    }, 0);
  }, [configsMap]);

  const configuredProvidersCount = useMemo(() => {
    return providers.filter((p) => {
      const cfg = configsMap[p.toLowerCase()];
      return (cfg?.total_keys ?? cfg?.keys?.length ?? 0) > 0;
    }).length;
  }, [providers, configsMap]);

  const getProviderIcon = (providerName: string) => {
    const lower = providerName.toLowerCase();
    if (lower === "groq") return Zap;
    if (lower === "gemini") return Sparkles;
    return Cpu;
  };

  const PrimaryIcon = getProviderIcon(primaryProvider);
  const SecondaryIcon = getProviderIcon(secondaryProvider);

  return (
    <div
      id="llm-management-tab-content"
      className="space-y-6 animate-in fade-in duration-200"
    >
      {/* Overview Metric Banner Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Primary Execution Model */}
        <div
          id="stat-primary-model"
          className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 via-zinc-950/60 to-zinc-950/40 p-5 backdrop-blur-xl shadow-lg transition-all hover:border-cyan-500/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                <PrimaryIcon className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider font-mono">
                Primary Engine
              </span>
            </div>

            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium",
                primaryHasKeys
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                  : "bg-amber-500/15 border border-amber-500/30 text-amber-300"
              )}
            >
              {primaryHasKeys ? (
                <>
                  <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                  <span>Ready</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                  <span>No Keys</span>
                </>
              )}
            </span>
          </div>

          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                {primaryMeta.name}
              </span>
              <span className="text-xs font-mono text-cyan-400 font-semibold">
                #1 Priority
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 line-clamp-1">
              {primaryMeta.tagline}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px]">
            <span className="text-zinc-400 font-mono">
              {primaryKeysCount} {primaryKeysCount === 1 ? "key stored" : "keys stored"}
            </span>
            <button
              type="button"
              onClick={() => onSelectProvider(primaryProvider)}
              className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Manage Keys</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Failover Pipeline */}
        <div
          id="stat-failover-pipeline"
          className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 via-zinc-950/60 to-zinc-950/40 p-5 backdrop-blur-xl shadow-lg transition-all hover:border-indigo-500/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.25)]">
                <Workflow className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider font-mono">
                Failover Chain
              </span>
            </div>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              <Activity className="w-2.5 h-2.5 text-indigo-400" />
              <span>Active</span>
            </span>
          </div>

          <div className="mb-2">
            <div className="flex items-center flex-wrap gap-1.5 text-xs sm:text-sm font-semibold text-white tracking-tight font-mono">
              <span className="inline-flex items-center gap-1 text-cyan-300">
                <PrimaryIcon className="w-3.5 h-3.5" />
                <span>{primaryMeta.name}</span>
              </span>
              <span className="text-zinc-500">➔</span>
              <span className="inline-flex items-center gap-1 text-indigo-300">
                <SecondaryIcon className="w-3.5 h-3.5" />
                <span>{secondaryMeta.name}</span>
              </span>
              {providers.length > 2 && (
                <>
                  <span className="text-zinc-500">➔</span>
                  <span className="text-zinc-400">+{providers.length - 2}</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Automated cascade on rate limit (429) or outage
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px]">
            <span className="text-zinc-400 font-mono">
              Secondary: {secondaryMeta.name} ({secondaryKeysCount}k)
            </span>
            <button
              type="button"
              onClick={() => onSelectProvider(secondaryProvider)}
              className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>View</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: Keyring Capacity */}
        <div
          id="stat-keyring-capacity"
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/30 p-5 backdrop-blur-xl shadow-lg transition-all hover:border-white/15"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Key className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Vault Keyring
              </span>
            </div>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              <span>AES-256</span>
            </span>
          </div>

          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight font-mono">
                {totalKeysAcrossAll}
              </span>
              <span className="text-xs text-zinc-400 font-medium">
                total credentials stored
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Across {providers.length} registered inference providers
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px]">
            <span className="text-zinc-400 font-mono">
              {configuredProvidersCount} of {providers.length} active
            </span>
            <span className="text-emerald-400 font-mono text-[10px]">
              Encrypted
            </span>
          </div>
        </div>

        {/* Card 4: High Availability */}
        <div
          id="stat-availability"
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/30 p-5 backdrop-blur-xl shadow-lg transition-all hover:border-white/15"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Execution SLA
              </span>
            </div>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-500/10 border border-purple-500/20 text-purple-300">
              <CheckCircle2 className="w-2.5 h-2.5 text-purple-400" />
              <span>Multi-Tier</span>
            </span>
          </div>

          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight font-mono">
                {providers.length}-Tier
              </span>
              <span className="text-xs text-zinc-400 font-medium">
                failover depth
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Multi-model resilience guarantees uninterrupted inference
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px]">
            <span className="text-zinc-400 font-mono">Zero Session Drop</span>
            <span className="text-purple-400 font-mono text-[10px]">Active</span>
          </div>
        </div>
      </div>

      {/* Global Priority Sequence Card (Drag-and-Drop & Arrow reordering) */}
      <ProviderPriorityCard
        providers={providers}
        priorities={priorities}
        configsMap={configsMap}
        onSavePriorities={onSavePriorities}
        onSelectProvider={onSelectProvider}
        activeProvider=""
        disabled={isUpdating}
      />

      {/* Failover Architecture & Engine Strategy */}
      <div
        id="card-failover-architecture"
        className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Workflow className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                MIRA Engine Execution & Failover Policy
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                How inference requests, tool executions, and rate limits are managed across the priority hierarchy
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold border border-cyan-500/30">
                1
              </span>
              <h4 className="text-xs font-semibold text-white">
                Primary Dispatch
              </h4>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Every inference request (chat response, task planning, code generation) is immediately dispatched to your <strong className="text-cyan-300 font-semibold">Priority #1</strong> model using its currently selected active API key.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
                2
              </span>
              <h4 className="text-xs font-semibold text-white">
                Graceful Cascade Failover
              </h4>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              If the primary provider returns a rate limit (HTTP 429), quota exhaustion, or temporary timeout, MIRA seamlessly falls back to the <strong className="text-indigo-300 font-semibold">Priority #2</strong> provider without terminating user tasks.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                3
              </span>
              <h4 className="text-xs font-semibold text-white">
                Keyring Multi-Key Rotation
              </h4>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Within each individual model provider, you can store multiple API keys. When one key exhausts its quota, you can rotate to reserve credentials directly in the provider tab.
            </p>
          </div>
        </div>
      </div>

      {/* Model Quick Access Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {providers.map((provider) => {
          const meta = getProviderMeta(provider);
          const Icon = getProviderIcon(provider);
          const config = configsMap[provider.toLowerCase()];
          const keyCount = config?.total_keys ?? config?.keys?.length ?? 0;
          const priorityIndex = providers.indexOf(provider);
          const isPrimary = priorityIndex === 0;

          return (
            <div
              key={`quick-card-${provider}`}
              className={cn(
                "relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition-all duration-150 flex flex-col justify-between gap-4",
                isPrimary
                  ? "border-cyan-500/30 bg-zinc-950/60 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                  : "border-white/[0.08] bg-zinc-950/40 hover:border-white/15"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-xl border",
                      isPrimary
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                        : "bg-white/[0.04] border-white/10 text-zinc-300"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        {meta.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.06] text-zinc-300 border border-white/10">
                        #{priorityIndex + 1}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                      {meta.tagline}
                    </p>
                  </div>
                </div>

                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0",
                    keyCount > 0
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                      : "bg-amber-500/15 border border-amber-500/30 text-amber-300"
                  )}
                >
                  {keyCount} {keyCount === 1 ? "Key" : "Keys"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                <span className="text-[11px] text-zinc-500 font-mono">
                  {keyCount > 0 ? "Configured in Vault" : "Missing API Key"}
                </span>

                <button
                  type="button"
                  onClick={() => onSelectProvider(provider)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 hover:text-white transition-all cursor-pointer border border-white/10 active:scale-95"
                >
                  <span>Configure {meta.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
