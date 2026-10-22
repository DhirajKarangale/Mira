import { useState, useEffect, useRef, useMemo, type FC } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Cpu,
  Sparkles,
  RefreshCw,
  Zap,
  Sliders,
} from "lucide-react";
import {
  useAIProvidersQuery,
  useAIConfigsQuery,
  useUpdateAIConfigMutation,
  useAIPrioritiesQuery,
  useUpdateAIPrioritiesMutation,
  useEngineWorkersQuery,
  useUpdateEngineWorkersMutation,
} from "./queries";
import { ProviderOverviewCard } from "./components/ProviderOverviewCard";
import { AddApiKeyCard } from "./components/AddApiKeyCard";
import { ApiKeyList } from "./components/ApiKeyList";
import { ProviderPriorityCard } from "./components/ProviderPriorityCard";
import { EngineWorkersCard } from "./components/EngineWorkersCard";
import { getProviderMeta, type FeedbackNotification } from "./types";
import type { AIConfig, EngineWorkersUpdateRequest } from "@/services";
import { cn } from "@/lib/utils";

interface ProviderViewProps {
  providers: string[];
  configsMap: Record<string, AIConfig>;
  isLoading: boolean;
  onScrollToAdd: (provider: string) => void;
  onSetAsActive: (provider: string, index: number) => Promise<void>;
  onUpdateKey: (provider: string, index: number, updatedKeyValue: string) => Promise<void>;
  onRemoveKey: (provider: string, index: number) => Promise<void>;
  onAddKey: (provider: string, newKey: string, makeActive: boolean) => Promise<void>;
  isUpdating: boolean;
}

const ProviderView: FC<ProviderViewProps> = ({
  providers,
  configsMap,
  isLoading,
  onScrollToAdd,
  onSetAsActive,
  onUpdateKey,
  onRemoveKey,
  onAddKey,
  isUpdating,
}) => {
  const { provider: paramProvider } = useParams<{ provider: string }>();

  const activeProvider = useMemo(() => {
    if (!paramProvider) return "";
    const canonical = providers.find(
      (p) => p.toLowerCase() === paramProvider.toLowerCase()
    );
    return canonical || paramProvider;
  }, [paramProvider, providers]);

  const activeConfig = activeProvider
    ? configsMap[activeProvider.toLowerCase()] || null
    : null;
  const activeKeys = activeConfig?.keys || [];
  const currentKeyIndex = activeConfig?.current_key ?? 0;

  if (isLoading && providers.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-16 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-sm text-zinc-400 font-mono">Synchronizing with Vault...</p>
      </div>
    );
  }

  if (
    !isLoading &&
    providers.length > 0 &&
    !providers.some((p) => p.toLowerCase() === paramProvider?.toLowerCase())
  ) {
    return <Navigate to="/ai-configs/engine-workers" replace />;
  }

  if (!activeProvider) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/20 p-12 text-center">
        <Cpu className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-zinc-300">No Provider Available</h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
          No LLM providers were returned from Vault. Please ensure Vault is running.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <ProviderOverviewCard
        provider={activeProvider}
        config={activeConfig}
        onAddNewKeyClick={() => onScrollToAdd(activeProvider)}
      />

      <ApiKeyList
        provider={activeProvider}
        keys={activeKeys}
        currentKeyIndex={currentKeyIndex}
        onSetAsActive={(idx) => onSetAsActive(activeProvider, idx)}
        onUpdateKey={(idx, val) => onUpdateKey(activeProvider, idx, val)}
        onRemoveKey={(idx) => onRemoveKey(activeProvider, idx)}
        onAddNewKeyClick={() => onScrollToAdd(activeProvider)}
        disabled={isUpdating}
      />

      <AddApiKeyCard
        provider={activeProvider}
        onAddKey={(key, makeActive) => onAddKey(activeProvider, key, makeActive)}
        existingKeys={activeKeys}
        disabled={isUpdating}
      />
    </div>
  );
};

export const AiConfigsPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    data: providers = [],
    isLoading: isProvidersLoading,
    isFetching: isProvidersFetching,
    refetch: refetchProviders,
    error: providersError,
  } = useAIProvidersQuery();

  const {
    data: priorities = [],
    isLoading: isPrioritiesLoading,
    isFetching: isPrioritiesFetching,
    refetch: refetchPriorities,
    error: prioritiesError,
  } = useAIPrioritiesQuery();

  const {
    data: configs = [],
    isLoading: isConfigsLoading,
    isFetching: isConfigsFetching,
    refetch: refetchConfigs,
  } = useAIConfigsQuery();

  const {
    data: engineWorkers,
    isLoading: isEngineLoading,
    isFetching: isEngineFetching,
    refetch: refetchEngineWorkers,
    error: engineError,
  } = useEngineWorkersQuery();

  const updateMutation = useUpdateAIConfigMutation();
  const updatePrioritiesMutation = useUpdateAIPrioritiesMutation();
  const updateEngineMutation = useUpdateEngineWorkersMutation();

  const [feedback, setFeedback] = useState<FeedbackNotification | null>(null);
  const [dismissedQueryError, setDismissedQueryError] = useState(false);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const currentSubRoute = (pathSegments[1] || "").toLowerCase();
  const isEngineTab = currentSubRoute === "engine-workers" || currentSubRoute === "";

  const orderedProviders = useMemo(() => {
    if (!providers || providers.length === 0) return [];
    if (!priorities || priorities.length === 0) return providers;
    const canonicalMap = new Map(providers.map((p) => [p.toLowerCase(), p]));
    const result: string[] = [];
    const seen = new Set<string>();

    for (const p of priorities) {
      const lower = p.toLowerCase();
      if (canonicalMap.has(lower) && !seen.has(lower)) {
        result.push(canonicalMap.get(lower)!);
        seen.add(lower);
      }
    }
    for (const p of providers) {
      const lower = p.toLowerCase();
      if (!seen.has(lower)) {
        result.push(p);
        seen.add(lower);
      }
    }
    return result;
  }, [providers, priorities]);

  const configsMap = useMemo(() => {
    const map: Record<string, AIConfig> = {};
    for (const c of configs) {
      if (c && c.llm_provider) {
        map[c.llm_provider.toLowerCase()] = c;
      }
    }
    return map;
  }, [configs]);

  const showFeedback = (
    type: "success" | "error" | "info",
    message: string,
    durationMs = 4000
  ) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setFeedback({ type, message });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const handleDismissBanner = () => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setFeedback(null);
    setDismissedQueryError(true);
  };

  const handleRefresh = async () => {
    setDismissedQueryError(false);
    await Promise.all([
      refetchProviders(),
      refetchPriorities(),
      refetchConfigs(),
      refetchEngineWorkers(),
    ]);
    showFeedback("info", "Synchronized latest Engine workers & AI configurations from Vault.");
  };

  const handleSavePriorities = async (newOrder: string[]) => {
    await updatePrioritiesMutation.mutateAsync(newOrder);
    showFeedback("success", "LLM provider priority sequence updated and saved in Vault.");
  };

  const handleSaveEngineWorkers = async (updates: EngineWorkersUpdateRequest) => {
    await updateEngineMutation.mutateAsync(updates);
    showFeedback("success", "Engine worker concurrency updated successfully in Vault.");
  };

  const handleAddKey = async (provider: string, newKey: string, makeActive: boolean) => {
    if (!provider) return;
    const config = configsMap[provider.toLowerCase()];
    const currentKeys = config?.keys ? [...config.keys] : [];
    const updatedKeys = [...currentKeys, newKey];
    const currentKeyIndex = config?.current_key ?? 0;
    const newActiveIndex = makeActive ? updatedKeys.length - 1 : currentKeyIndex;

    await updateMutation.mutateAsync({
      provider,
      updates: {
        keys: updatedKeys,
        current_key: newActiveIndex,
      },
    });

    showFeedback(
      "success",
      `New API key successfully encrypted and stored for ${provider}.`
    );
  };

  const handleUpdateKey = async (
    provider: string,
    index: number,
    updatedKeyValue: string
  ) => {
    const config = configsMap[provider.toLowerCase()];
    if (!config) return;
    const currentKeys = [...(config.keys || [])];
    if (index < 0 || index >= currentKeys.length) return;

    currentKeys[index] = updatedKeyValue;

    await updateMutation.mutateAsync({
      provider,
      updates: {
        keys: currentKeys,
        current_key: config.current_key ?? 0,
      },
    });

    showFeedback("success", `Key #${index + 1} updated successfully in Vault.`);
  };

  const handleRemoveKey = async (provider: string, index: number) => {
    const config = configsMap[provider.toLowerCase()];
    if (!config) return;
    const currentKeys = [...(config.keys || [])];
    if (index < 0 || index >= currentKeys.length) return;

    currentKeys.splice(index, 1);
    let newIndex = config.current_key ?? 0;
    if (currentKeys.length === 0) {
      newIndex = 0;
    } else if (newIndex >= currentKeys.length) {
      newIndex = currentKeys.length - 1;
    }

    await updateMutation.mutateAsync({
      provider,
      updates: {
        keys: currentKeys,
        current_key: newIndex,
      },
    });

    showFeedback("success", `API key removed from ${provider}.`);
  };

  const handleSetAsActive = async (provider: string, index: number) => {
    await updateMutation.mutateAsync({
      provider,
      updates: {
        current_key: index,
      },
    });

    showFeedback(
      "success",
      `Active key for ${provider} switched to Key #${index + 1}.`
    );
  };

  const handleScrollToAdd = (providerName: string) => {
    if (!providerName) return;
    const element = document.getElementById(`card-add-key-${providerName}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = document.getElementById("input-new-api-key");
      if (input) input.focus();
    }
  };

  const isLoading =
    isProvidersLoading || isConfigsLoading || isPrioritiesLoading || isEngineLoading;
  const isFetching =
    isProvidersFetching || isConfigsFetching || isPrioritiesFetching || isEngineFetching;

  const getProviderIcon = (providerName: string) => {
    const lower = providerName.toLowerCase();
    if (lower === "groq") return Zap;
    if (lower === "gemini") return Sparkles;
    return Cpu;
  };

  return (
    <div
      id="ai-configs-container"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="flex-none px-6 py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  AI Configs
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Vault Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Encrypted LLM inference API credentials, provider priorities, and Engine worker concurrency
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner">
              <button
                type="button"
                id="tab-btn-engine-workers"
                onClick={() => navigate("/ai-configs/engine-workers")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  isEngineTab
                    ? "bg-cyan-600 text-white shadow-sm font-semibold shadow-cyan-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Engine Workers</span>
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              {orderedProviders.map((p, index) => {
                const meta = getProviderMeta(p);
                const isActive = currentSubRoute === p.toLowerCase();
                const cfg = configsMap[p.toLowerCase()];
                const count = cfg?.total_keys ?? cfg?.keys?.length ?? 0;
                const Icon = getProviderIcon(p);

                return (
                  <button
                    key={p}
                    type="button"
                    id={`tab-btn-provider-${p.toLowerCase()}`}
                    onClick={() => navigate(`/ai-configs/${p.toLowerCase()}`)}
                    className={cn(
                      "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                      isActive
                        ? "bg-cyan-600 text-white shadow-sm font-semibold shadow-cyan-950/60"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1 rounded",
                        isActive ? "bg-cyan-700 text-cyan-100 font-bold" : "text-zinc-500"
                      )}
                    >
                      #{index + 1}
                    </span>
                    <Icon className="w-3.5 h-3.5" />
                    <span>{meta.name}</span>
                    <span
                      className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                        isActive
                          ? "bg-white/20 text-white font-bold"
                          : "bg-white/[0.06] text-zinc-400"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              id="btn-refresh-ai-configs"
              onClick={handleRefresh}
              disabled={isFetching}
              title="Refresh configurations from Vault"
              className="p-2 rounded-xl border border-white/[0.08] bg-zinc-900/80 hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={cn("w-4 h-4", isFetching && "animate-spin text-cyan-400")}
              />
            </button>
          </div>
        </div>
      </div>

      <div
        id="ai-configs-subpage-viewport"
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="max-w-7xl mx-auto space-y-6">
          {(feedback || (!dismissedQueryError && (providersError || prioritiesError || engineError))) && (
            <div
              id="ai-config-feedback-banner"
              className={`flex items-start justify-between gap-3 p-4 rounded-xl border backdrop-blur-md transition-all animate-in fade-in duration-200 ${
                (feedback?.type || "error") === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : (feedback?.type || "error") === "error"
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {(feedback?.type || "error") === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (feedback?.type || "error") === "error" ? (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                ) : (
                  <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
                )}
                <span className="text-xs sm:text-sm font-medium">
                  {feedback?.message ||
                    (providersError as any)?.response?.data?.detail?.message ||
                    (prioritiesError as any)?.response?.data?.detail?.message ||
                    (engineError as any)?.response?.data?.detail?.message ||
                    (providersError as Error)?.message ||
                    (prioritiesError as Error)?.message ||
                    (engineError as Error)?.message ||
                    "Could not connect to Vault to fetch AI configurations."}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDismissBanner}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isLoading && orderedProviders.length === 0 && !engineWorkers ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-16 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm text-zinc-400 font-mono">Synchronizing with Vault...</p>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/ai-configs/engine-workers" replace />} />
              <Route
                path="engine-workers"
                element={
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <EngineWorkersCard
                      config={engineWorkers}
                      isLoading={isEngineLoading}
                      onSave={handleSaveEngineWorkers}
                      disabled={updateEngineMutation.isPending}
                    />

                    <ProviderPriorityCard
                      providers={orderedProviders}
                      priorities={priorities}
                      configsMap={configsMap}
                      onSavePriorities={handleSavePriorities}
                      onSelectProvider={(p) => navigate(`/ai-configs/${p.toLowerCase()}`)}
                      activeProvider=""
                      disabled={updatePrioritiesMutation.isPending}
                    />
                  </div>
                }
              />
              <Route
                path=":provider"
                element={
                  <ProviderView
                    providers={orderedProviders}
                    configsMap={configsMap}
                    isLoading={isLoading}
                    onScrollToAdd={handleScrollToAdd}
                    onSetAsActive={handleSetAsActive}
                    onUpdateKey={handleUpdateKey}
                    onRemoveKey={handleRemoveKey}
                    onAddKey={handleAddKey}
                    isUpdating={updateMutation.isPending}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/ai-configs/engine-workers" replace />} />
            </Routes>
          )}

          <div className="pt-4 pb-2 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
            <span>MIRA Vault Engine</span>
            <span>•</span>
            <span>Worker Concurrency Manager</span>
            <span>•</span>
            <span>Encrypted LLM Keyring</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiConfigsPage;
