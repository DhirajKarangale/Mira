import type { FC } from "react";
import { vaultService } from "@/services";
import {
  Newspaper,
  ShieldCheck,
  RefreshCw,
  Globe,
  Lock,
  Loader2,
} from "lucide-react";
import {
  useGNewsConfigQuery,
  useUpdateGNewsConfigMutation,
  useUserDetailsQuery,
} from "./queries";
import { NewsOverviewCard } from "./components/NewsOverviewCard";
import { ApiKeyList } from "./components/ApiKeyList";
import { AddApiKeyCard } from "./components/AddApiKeyCard";
import { toast } from "@/components";
import { cn } from "@/lib/utils";

export const NewsToolPage: FC = () => {
  const {
    data: gnewsConfig,
    isLoading: isLoadingConfig,
    isRefetching,
    refetch: refetchConfig,
  } = useGNewsConfigQuery();

  const { data: userDetails } = useUserDetailsQuery();
  const updateMutation = useUpdateGNewsConfigMutation();

  const keys = gnewsConfig?.keys || [];
  const currentKeyIndex = gnewsConfig?.current_key ?? 0;
  const userCountry = userDetails?.country?.trim() || "Not configured (Defaults to United States)";

  const handleRefresh = async () => {
    try {
      await vaultService.syncEnvKeys();
    } catch {
      // Best effort sync from .env / environment
    }
    await refetchConfig();
    toast.info("Synchronized latest GNews credentials from Vault.", {
      title: "Vault Synchronized",
    });
  };

  const handleScrollToAdd = () => {
    const element = document.getElementById("card-add-key-gnews");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleSetAsActive = async (index: number) => {
    await updateMutation.mutateAsync({
      current_key: index,
    });

    toast.success(`Active key for GNews switched to Key #${index + 1}.`, {
      title: "GNews Configuration",
    });
  };

  const handleAddKey = async (newKey: string, makeActive: boolean) => {
    const currentKeys = gnewsConfig?.keys ? [...gnewsConfig.keys] : [];
    const updatedKeys = [...currentKeys, newKey];
    const activeIndex = gnewsConfig?.current_key ?? 0;
    const newActiveIndex = makeActive ? updatedKeys.length - 1 : activeIndex;

    await updateMutation.mutateAsync({
      keys: updatedKeys,
      current_key: newActiveIndex,
    });

    toast.success("New API key successfully encrypted and stored for GNews.", {
      title: "GNews Configuration",
    });
  };

  const handleUpdateKey = async (index: number, updatedKeyValue: string) => {
    const currentKeys = [...(gnewsConfig?.keys || [])];
    if (index < 0 || index >= currentKeys.length) return;

    currentKeys[index] = updatedKeyValue;

    await updateMutation.mutateAsync({
      keys: currentKeys,
      current_key: gnewsConfig?.current_key ?? 0,
    });

    toast.success(`Key #${index + 1} updated successfully in Vault.`, {
      title: "GNews Configuration",
    });
  };

  const handleRemoveKey = async (index: number) => {
    const currentKeys = [...(gnewsConfig?.keys || [])];
    if (index < 0 || index >= currentKeys.length) return;

    currentKeys.splice(index, 1);
    let newIndex = gnewsConfig?.current_key ?? 0;
    if (currentKeys.length === 0) {
      newIndex = 0;
    } else if (newIndex >= currentKeys.length) {
      newIndex = currentKeys.length - 1;
    }

    await updateMutation.mutateAsync({
      keys: currentKeys,
      current_key: newIndex,
    });

    toast.success("API key removed from GNews.", {
      title: "GNews Configuration",
    });
  };

  return (
    <div
      id="page-tools-news-container"
      className="h-full w-full overflow-y-auto no-scrollbar p-3.5 sm:p-6 space-y-5 sm:space-y-6"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  News Configuration
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  GNews Provider
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                MIRA uses <strong className="text-zinc-200">GNews</strong> to retrieve real-time breaking headlines and personalized topic briefings.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          id="btn-refresh-news-configs"
          onClick={handleRefresh}
          disabled={isLoadingConfig || isRefetching}
          className="p-2 rounded-xl border border-white/[0.08] bg-zinc-900/80 hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          title="Refresh credentials from Vault"
        >
          <RefreshCw
            className={cn("w-4 h-4", (isLoadingConfig || isRefetching) && "animate-spin text-cyan-400")}
          />
        </button>
      </div>

      {/* PRIVACY INFORMATION SECTION */}
      <div
        id="news-privacy-notice"
        className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-zinc-950/70 to-cyan-950/30 p-5 backdrop-blur-xl shadow-lg"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 shrink-0 mt-0.5 shadow-[0_0_12px_rgba(99,102,241,0.25)]">
            <ShieldCheck className="w-4 h-4" />
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 font-mono">
                Privacy Notice & Data Security
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <Lock className="w-2.5 h-2.5" />
                Zero Personal Data Leakage
              </span>
            </div>

            {/* MANDATORY EXACT PRIVACY STATEMENT */}
            <p className="text-xs leading-relaxed text-zinc-200 font-medium">
              "MIRA uses your selected country to retrieve relevant news through GNews. Your personal data is not sent to GNews; only the country information required for the news request is used."
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/[0.06] text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>Selected Country:</span>
                <span className="text-zinc-200 font-medium font-mono">
                  {userCountry}
                </span>
              </div>
              <span className="text-zinc-600">•</span>
              <span>Personal identifiers, screen activities, and coordinates are never transmitted.</span>
            </div>
          </div>
        </div>
      </div>

      {isLoadingConfig && !gnewsConfig ? (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-16 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-sm text-zinc-400 font-mono">Synchronizing GNews config with Vault...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview Card (Matching Groq pattern) */}
          <NewsOverviewCard
            config={gnewsConfig}
            onAddNewKeyClick={handleScrollToAdd}
          />

          {/* Configured Credentials List (Matching Groq pattern) */}
          <ApiKeyList
            keys={keys}
            currentKeyIndex={currentKeyIndex}
            onSetAsActive={handleSetAsActive}
            onUpdateKey={handleUpdateKey}
            onRemoveKey={handleRemoveKey}
            onAddNewKeyClick={handleScrollToAdd}
            disabled={updateMutation.isPending}
          />

          {/* Add API Key Card (Matching Groq pattern) */}
          <AddApiKeyCard
            onAddKey={handleAddKey}
            existingKeys={keys}
            disabled={updateMutation.isPending}
          />
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 pb-2 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
        <span>MIRA Vault Engine</span>
        <span>•</span>
        <span>GNews Integration</span>
        <span>•</span>
        <span>Multi-Key Redundancy</span>
      </div>
    </div>
  );
};

export default NewsToolPage;
