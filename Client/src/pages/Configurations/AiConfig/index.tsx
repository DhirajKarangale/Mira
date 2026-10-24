import { useEffect, useRef, useMemo, type FC } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Cpu,
  Zap,
  Sparkles,
  RefreshCw,
  Loader2,
  Workflow,
} from "lucide-react";
import {
  useAIProvidersQuery,
  useAIConfigsQuery,
  useUpdateAIConfigMutation,
  useAIPrioritiesQuery,
  useUpdateAIPrioritiesMutation,
} from "./queries";
import { ProviderOverviewCard } from "./components/ProviderOverviewCard";
import { AddApiKeyCard } from "./components/AddApiKeyCard";
import { ApiKeyList } from "./components/ApiKeyList";
import { LlmManagementView } from "./components/LlmManagementView";
import { getProviderMeta } from "./types";
import type { AIConfig } from "@/services";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

interface ProviderTabContentProps {
  provider: string;
  config: AIConfig | null;
  onScrollToAdd: (provider: string) => void;
  onSetAsActive: (provider: string, index: number) => Promise<void>;
  onUpdateKey: (provider: string, index: number, updatedKeyValue: string) => Promise<void>;
  onRemoveKey: (provider: string, index: number) => Promise<void>;
  onAddKey: (provider: string, newKey: string, makeActive: boolean) => Promise<void>;
  isUpdating: boolean;
}

const ProviderTabContent: FC<ProviderTabContentProps> = ({
  provider,
  config,
  onScrollToAdd,
  onSetAsActive,
  onUpdateKey,
  onRemoveKey,
  onAddKey,
  isUpdating,
}) => {
  const activeKeys = config?.keys || [];
  const currentKeyIndex = config?.current_key ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <ProviderOverviewCard
        provider={provider}
        config={config}
        onAddNewKeyClick={() => onScrollToAdd(provider)}
      />

      <ApiKeyList
        provider={provider}
        keys={activeKeys}
        currentKeyIndex={currentKeyIndex}
        onSetAsActive={(idx) => onSetAsActive(provider, idx)}
        onUpdateKey={(idx, val) => onUpdateKey(provider, idx, val)}
        onRemoveKey={(idx) => onRemoveKey(provider, idx)}
        onAddNewKeyClick={() => onScrollToAdd(provider)}
        disabled={isUpdating}
      />

      <AddApiKeyCard
        provider={provider}
        onAddKey={(key, makeActive) => onAddKey(provider, key, makeActive)}
        existingKeys={activeKeys}
        disabled={isUpdating}
      />
    </div>
  );
};

export const AiConfigPage: FC = () => {
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
    error: configsError,
  } = useAIConfigsQuery();

  const updateMutation = useUpdateAIConfigMutation();
  const updatePrioritiesMutation = useUpdateAIPrioritiesMutation();
  const lastErrorRef = useRef<string | null>(null);

  const pathSegments = location.pathname.split("/").filter(Boolean);
  // URL pattern: /configurations/ai-config/:tab (e.g. management, groq, gemini)
  const currentSubTab = (pathSegments[2] || "management").toLowerCase();
  const isManagementActive = currentSubTab === "management" || currentSubTab === "llm-management";
  const isGroqActive = currentSubTab === "groq";
  const isGeminiActive = currentSubTab === "gemini";

  const queryError = providersError || prioritiesError || configsError;
  const queryErrorMessage = queryError
    ? (queryError as any)?.response?.data?.detail?.message ||
      (queryError as Error)?.message ||
      "Could not connect to Vault to fetch AI configurations."
    : null;

  useEffect(() => {
    if (queryErrorMessage && queryErrorMessage !== lastErrorRef.current) {
      lastErrorRef.current = queryErrorMessage;
      toast.error(queryErrorMessage, { title: "Vault Synchronization Error" });
    }
  }, [queryErrorMessage]);

  const configsMap = useMemo(() => {
    const map: Record<string, AIConfig> = {};
    for (const c of configs) {
      if (c && c.llm_provider) {
        map[c.llm_provider.toLowerCase()] = c;
      }
    }
    return map;
  }, [configs]);

  const orderedProviders = useMemo(() => {
    const baseList = ["groq", "gemini"];
    const allProviders = Array.from(
      new Set([...baseList, ...providers.map((p) => p.toLowerCase())])
    );

    if (!priorities || priorities.length === 0) return allProviders;

    const result: string[] = [];
    const seen = new Set<string>();

    for (const p of priorities) {
      const lower = p.toLowerCase();
      if (allProviders.includes(lower) && !seen.has(lower)) {
        result.push(lower);
        seen.add(lower);
      }
    }

    for (const p of allProviders) {
      if (!seen.has(p)) {
        result.push(p);
        seen.add(p);
      }
    }

    return result;
  }, [providers, priorities]);

  const otherProviders = useMemo(() => {
    return orderedProviders.filter((p) => p !== "groq" && p !== "gemini");
  }, [orderedProviders]);

  const showFeedback = (
    type: "success" | "error" | "info",
    message: string,
    durationMs = 5000
  ) => {
    if (type === "success") {
      toast.success(message, { duration: durationMs, title: "AI Configuration" });
    } else if (type === "error") {
      toast.error(message, { duration: durationMs, title: "Configuration Error" });
    } else {
      toast.info(message, { duration: durationMs, title: "Vault Status" });
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetchProviders(),
      refetchPriorities(),
      refetchConfigs(),
    ]);
    showFeedback("info", "Synchronized latest AI credentials from Vault.");
  };

  const handleSavePriorities = async (newOrder: string[]) => {
    await updatePrioritiesMutation.mutateAsync(newOrder);
    showFeedback("success", "Global LLM provider priority sequence updated and saved in Vault.");
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

    const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
    showFeedback(
      "success",
      `New API key successfully encrypted and stored for ${displayName}.`
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

    const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
    showFeedback("success", `API key removed from ${displayName}.`);
  };

  const handleSetAsActive = async (provider: string, index: number) => {
    await updateMutation.mutateAsync({
      provider,
      updates: {
        current_key: index,
      },
    });

    const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
    showFeedback(
      "success",
      `Active key for ${displayName} switched to Key #${index + 1}.`
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

  const isLoading = isProvidersLoading || isConfigsLoading || isPrioritiesLoading;
  const isFetching = isProvidersFetching || isConfigsFetching || isPrioritiesFetching;

  const groqConfig = configsMap["groq"];
  const groqKeysCount = groqConfig?.keys?.length ?? 0;

  const geminiConfig = configsMap["gemini"];
  const geminiKeysCount = geminiConfig?.keys?.length ?? 0;

  return (
    <div
      id="configurations-subpage-ai-config"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40 text-zinc-100"
    >
      {/* Top Header Bar */}
      <div className="flex-none px-6 py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  AI Config
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Vault Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Encrypted LLM inference API credentials, global priority sequence, and failover management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Top Sub-Tabs Bar: LLM Management first, followed by individual LLM tabs */}
            <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner">
              {/* Separate LLM Management Tab */}
              <button
                type="button"
                id="tab-btn-llm-management"
                onClick={() => navigate("/configurations/ai-config/management")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  isManagementActive
                    ? "bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm font-semibold shadow-cyan-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>LLM Management</span>
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                    isManagementActive
                      ? "bg-white/20 text-white font-bold"
                      : "bg-white/[0.06] text-zinc-400"
                  )}
                >
                  {orderedProviders.length}
                </span>
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Individual LLM Tab: Groq */}
              <button
                type="button"
                id="tab-btn-groq"
                onClick={() => navigate("/configurations/ai-config/groq")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  isGroqActive
                    ? "bg-amber-600 text-white shadow-sm font-semibold shadow-amber-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Groq</span>
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                    isGroqActive
                      ? "bg-white/20 text-white font-bold"
                      : "bg-white/[0.06] text-zinc-400"
                  )}
                >
                  {groqKeysCount}
                </span>
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Individual LLM Tab: Gemini */}
              <button
                type="button"
                id="tab-btn-gemini"
                onClick={() => navigate("/configurations/ai-config/gemini")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  isGeminiActive
                    ? "bg-cyan-600 text-white shadow-sm font-semibold shadow-cyan-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gemini</span>
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                    isGeminiActive
                      ? "bg-white/20 text-white font-bold"
                      : "bg-white/[0.06] text-zinc-400"
                  )}
                >
                  {geminiKeysCount}
                </span>
              </button>

              {/* Any additional dynamically registered providers */}
              {otherProviders.map((provider) => {
                const meta = getProviderMeta(provider);
                const isActive = currentSubTab === provider.toLowerCase();
                const count = configsMap[provider.toLowerCase()]?.keys?.length ?? 0;
                return (
                  <div key={provider} className="flex items-center">
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    <button
                      type="button"
                      id={`tab-btn-${provider}`}
                      onClick={() => navigate(`/configurations/ai-config/${provider.toLowerCase()}`)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm font-semibold shadow-indigo-950/60"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      )}
                    >
                      <Cpu className="w-3.5 h-3.5" />
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
                  </div>
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

      {/* Main Content Viewport */}
      <div
        id="ai-config-subpage-viewport"
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="max-w-7xl mx-auto space-y-6">
          {isLoading && configs.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-16 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm text-zinc-400 font-mono">Synchronizing with Vault...</p>
            </div>
          ) : (
            <Routes>
              {/* Default redirect to the new LLM Management tab */}
              <Route path="/" element={<Navigate to="management" replace />} />
              {/* Global LLM Management View */}
              <Route
                path="management"
                element={
                  <LlmManagementView
                    providers={orderedProviders}
                    priorities={priorities}
                    configsMap={configsMap}
                    onSavePriorities={handleSavePriorities}
                    onSelectProvider={(p) => navigate(`/configurations/ai-config/${p.toLowerCase()}`)}
                    isUpdating={updatePrioritiesMutation.isPending}
                  />
                }
              />
              <Route
                path="llm-management"
                element={<Navigate to="../management" replace />}
              />
              {/* Individual Model Configuration: Groq */}
              <Route
                path="groq"
                element={
                  <ProviderTabContent
                    provider="groq"
                    config={groqConfig}
                    onScrollToAdd={handleScrollToAdd}
                    onSetAsActive={handleSetAsActive}
                    onUpdateKey={handleUpdateKey}
                    onRemoveKey={handleRemoveKey}
                    onAddKey={handleAddKey}
                    isUpdating={updateMutation.isPending}
                  />
                }
              />
              {/* Individual Model Configuration: Gemini */}
              <Route
                path="gemini"
                element={
                  <ProviderTabContent
                    provider="gemini"
                    config={geminiConfig}
                    onScrollToAdd={handleScrollToAdd}
                    onSetAsActive={handleSetAsActive}
                    onUpdateKey={handleUpdateKey}
                    onRemoveKey={handleRemoveKey}
                    onAddKey={handleAddKey}
                    isUpdating={updateMutation.isPending}
                  />
                }
              />
              {/* Dynamic routes for any additional providers */}
              {otherProviders.map((p) => (
                <Route
                  key={p}
                  path={p}
                  element={
                    <ProviderTabContent
                      provider={p}
                      config={configsMap[p]}
                      onScrollToAdd={handleScrollToAdd}
                      onSetAsActive={handleSetAsActive}
                      onUpdateKey={handleUpdateKey}
                      onRemoveKey={handleRemoveKey}
                      onAddKey={handleAddKey}
                      isUpdating={updateMutation.isPending}
                    />
                  }
                />
              ))}
              <Route path="*" element={<Navigate to="management" replace />} />
            </Routes>
          )}

          <div className="pt-4 pb-2 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
            <span>MIRA Vault Engine</span>
            <span>•</span>
            <span>Global LLM Management</span>
            <span>•</span>
            <span>Multi-Model Keyring Security</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiConfigPage;
