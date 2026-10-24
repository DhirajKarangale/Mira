import { useState, useEffect, type FC } from "react";
import {
  Save,
  RotateCcw,
  AlertCircle,
  Clock,
  Terminal,
  Database,
  Cpu,
  Monitor,
  Radio,
  Layers,
  Sparkles,
  Shield,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useLogConfigQuery,
  useSaveLogConfigMutation,
  useDeleteLogsMutation,
} from "../queries";
import type { LogConfig } from "../types";
import { LogDeleteConfirmModal } from "./LogDeleteConfirmModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

interface LogConfigCardProps {
  onSaved?: () => void;
}

const MODULE_DEFINITIONS = [
  {
    id: "vault",
    name: "Vault",
    showKey: "show_logs_vault" as const,
    storeKey: "store_logs_vault" as const,
    icon: Shield,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  },
  {
    id: "operator",
    name: "Operator",
    showKey: "show_logs_operator" as const,
    storeKey: "store_logs_operator" as const,
    icon: Monitor,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
  {
    id: "engine",
    name: "Engine",
    showKey: "show_logs_engine" as const,
    storeKey: "store_logs_engine" as const,
    icon: Cpu,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  },
  {
    id: "memory",
    name: "Memory",
    showKey: "show_logs_memory" as const,
    storeKey: "store_logs_memory" as const,
    icon: Database,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  {
    id: "client",
    name: "Client",
    showKey: "show_logs_client" as const,
    storeKey: "store_logs_client" as const,
    icon: Sparkles,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  },
  {
    id: "message_broker",
    name: "Message Broker",
    showKey: "show_logs_message_broker" as const,
    storeKey: "store_logs_message_broker" as const,
    icon: Radio,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  },
];

const PRESET_DAYS = [7, 14, 30, 60, 90, 180, 365];

export const LogConfigCard: FC<LogConfigCardProps> = ({ onSaved }) => {
  const { data: serverConfig, isLoading: loading, refetch: reloadConfig } = useLogConfigQuery();
  const saveMutation = useSaveLogConfigMutation();
  const deleteMutation = useDeleteLogsMutation();

  const [config, setConfig] = useState<LogConfig | null>(serverConfig ?? null);
  const [originalConfig, setOriginalConfig] = useState<LogConfig | null>(serverConfig ?? null);

  // Manual Log Deletion state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeDeleteTarget, setActiveDeleteTarget] = useState<{ id: string; name: string }>({
    id: "all",
    name: "All Modules",
  });

  useEffect(() => {
    if (serverConfig) {
      setConfig(serverConfig);
      setOriginalConfig(serverConfig);
    }
  }, [serverConfig]);

  const saving = saveMutation.isPending;

  const handleToggle = (key: keyof LogConfig) => {
    if (!config) return;
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: !prev[key],
      };
    });
  };

  const allShowActive = Boolean(
    config && MODULE_DEFINITIONS.every((m) => config[m.showKey])
  );
  const handleToggleAllShow = () => {
    if (!config) return;
    const targetState = !allShowActive;
    setConfig((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const m of MODULE_DEFINITIONS) {
        (updated as any)[m.showKey] = targetState;
      }
      return updated;
    });
  };

  const allStoreActive = Boolean(
    config && MODULE_DEFINITIONS.every((m) => config[m.storeKey])
  );
  const handleToggleAllStore = () => {
    if (!config) return;
    const targetState = !allStoreActive;
    setConfig((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const m of MODULE_DEFINITIONS) {
        (updated as any)[m.storeKey] = targetState;
      }
      return updated;
    });
  };

  const handleRetentionChange = (days: number) => {
    if (!config) return;
    const clamped = Math.max(1, Math.min(365, days || 1));
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        retention_period: clamped,
      };
    });
  };

  const handleRetentionInputChange = (raw: string) => {
    if (!config) return;
    const cleaned = raw.replace(/[^0-9]/g, "");
    if (cleaned === "" || cleaned === "0") {
      handleRetentionChange(1);
      return;
    }
    const val = parseInt(cleaned, 10);
    if (!isNaN(val)) {
      if (val < 1) {
        handleRetentionChange(1);
      } else if (val > 365) {
        handleRetentionChange(365);
      } else {
        handleRetentionChange(val);
      }
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      const updated = await saveMutation.mutateAsync(config);
      setConfig(updated);
      setOriginalConfig(updated);
      toast.success("Log configurations successfully updated in Vault", {
        title: "Log Configurations",
      });
      onSaved?.();
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to update log configurations";
      toast.error(errMsg, { title: "Configuration Error" });
    }
  };

  const handleReset = () => {
    if (originalConfig) {
      setConfig({ ...originalConfig });
    }
  };

  // Manual Delete Handlers
  const handleOpenDeleteModal = (moduleId: string, moduleName: string) => {
    setActiveDeleteTarget({ id: moduleId, name: moduleName });
    setIsDeleteModalOpen(true);
  };

  const handleExecuteDelete = async () => {
    try {
      const result = await deleteMutation.mutateAsync(
        activeDeleteTarget.id === "all" ? undefined : activeDeleteTarget.id
      );
      toast.success(result.message || "Logs successfully deleted from Vault", {
        title: "Log Purge Complete",
      });
      setIsDeleteModalOpen(false);
      onSaved?.();
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to delete logs from Vault";
      toast.error(errMsg, { title: "Log Deletion Failed" });
    }
  };

  const isDirty =
    Boolean(config && originalConfig) &&
    JSON.stringify(config) !== JSON.stringify(originalConfig);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
        <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-3" />
        <p className="text-xs tracking-wide">Loading configurations from Vault...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6 text-center text-zinc-400">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <p className="text-sm">Unable to connect to Vault configuration service.</p>
        <Button onClick={() => reloadConfig()} size="sm" variant="outline" className="mt-4">
          Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-0">
      {/* Top Header with Discard and Save */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Log Retention & Module Stream Settings
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage automatic log pruning, manual telemetry deletion, and real-time capture per module.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="text-xs gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Discard
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="text-xs gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)] font-semibold"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving to Vault..." : "Save Configurations"}
          </Button>
        </div>
      </div>

      {/* 1: Retention Period Card */}
      <div className="p-4 rounded-xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-sm space-y-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Retention Period (Days)
            </h3>
            <p className="text-xs text-zinc-400">
              Vault automatically prunes and deletes encrypted log archives older than this threshold.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="inline-flex items-center bg-zinc-950 border border-white/15 rounded-lg p-0.5 shadow-inner">
            <button
              type="button"
              id="btn-decrement-retention"
              onClick={() =>
                handleRetentionChange(Math.max(1, (config.retention_period || 1) - 1))
              }
              disabled={config.retention_period <= 1}
              title="Decrease days (-1)"
              className="flex items-center justify-center w-7 h-7 rounded text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              id="input-retention-period"
              value={config.retention_period}
              onChange={(e) => handleRetentionInputChange(e.target.value)}
              onBlur={(e) => handleRetentionInputChange(e.target.value)}
              className="w-14 text-center text-xs font-mono font-bold bg-transparent text-cyan-300 focus:outline-none"
            />

            <button
              type="button"
              id="btn-increment-retention"
              onClick={() =>
                handleRetentionChange(Math.min(365, (config.retention_period || 1) + 1))
              }
              disabled={config.retention_period >= 365}
              title="Increase days (+1)"
              className="flex items-center justify-center w-7 h-7 rounded text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs text-zinc-400">days (range: 1 - 365)</span>

          <div className="h-4 w-px bg-white/10 hidden sm:block mx-1" />

          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_DAYS.map((preset) => {
              const isActive = config.retention_period === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleRetentionChange(preset)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer border",
                    isActive
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                      : "bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border-white/5"
                  )}
                >
                  {preset}d
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2: Manual Log Purge Section - Positioned directly below Retention container */}
      <div
        id="card-manual-log-deletion"
        className="p-5 rounded-xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Manual Log Purge
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-rose-500/30 bg-rose-500/10 text-rose-300">
                  Storage Cleanup
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Permanently delete encrypted logs across all modules or selectively for an individual module
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-delete-all-logs"
            onClick={() => handleOpenDeleteModal("all", "All Modules")}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all cursor-pointer active:scale-95 shrink-0 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete All Logs</span>
          </button>
        </div>

        {/* 6 Module Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULE_DEFINITIONS.map((mod) => {
            const ModIcon = mod.icon;
            return (
              <div
                key={`purge-${mod.id}`}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-white/[0.08] bg-zinc-950/40 hover:border-white/15 transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-lg border shrink-0 ${mod.color}`}
                  >
                    <ModIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 truncate">
                    <span className="text-xs font-bold text-zinc-100 block truncate">
                      {mod.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono block">
                      {mod.id}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  id={`btn-delete-module-${mod.id}`}
                  onClick={() => handleOpenDeleteModal(mod.id, mod.name)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-600 transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3: Module Log Routing & Capture Toggles */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Module Log Routing & Capture Toggles</span>
          </h3>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-white/10 shadow-sm">
              <span className="text-xs text-zinc-300 font-medium">Show All:</span>
              <button
                type="button"
                role="switch"
                id="master-toggle-show-all"
                aria-checked={allShowActive}
                onClick={handleToggleAllShow}
                title={
                  allShowActive
                    ? "Turn off 'Show in Console' for all modules"
                    : "Turn on 'Show in Console' for all modules"
                }
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none",
                  allShowActive ? "bg-cyan-500" : "bg-zinc-800"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    allShowActive ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-white/10 shadow-sm">
              <span className="text-xs text-zinc-300 font-medium">Store All:</span>
              <button
                type="button"
                role="switch"
                id="master-toggle-store-all"
                aria-checked={allStoreActive}
                onClick={handleToggleAllStore}
                title={
                  allStoreActive
                    ? "Turn off 'Persist to Vault' for all modules"
                    : "Turn on 'Persist to Vault' for all modules"
                }
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none",
                  allStoreActive ? "bg-cyan-500" : "bg-zinc-800"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    allStoreActive ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODULE_DEFINITIONS.map((mod) => {
            const ModIcon = mod.icon;
            const isShowActive = config[mod.showKey];
            const isStoreActive = config[mod.storeKey];

            return (
              <div
                key={mod.id}
                className="p-4 rounded-xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-sm space-y-3.5 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex items-center justify-center w-7 h-7 rounded-lg border ${mod.color}`}
                    >
                      <ModIcon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-zinc-100">
                        {mod.name}
                      </span>
                      <span className="block text-[10px] text-zinc-500 font-mono">
                        {mod.id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex flex-col">
                      <span className="text-zinc-200 font-medium">Show in Console</span>
                      <span className="text-[10px] text-zinc-500">
                        Real-time stdout display
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isShowActive}
                      id={`toggle-${mod.showKey}`}
                      onClick={() => handleToggle(mod.showKey)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isShowActive ? "bg-cyan-500" : "bg-zinc-800"
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isShowActive ? "translate-x-4" : "translate-x-0"
                          }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex flex-col">
                      <span className="text-zinc-200 font-medium">Persist to Vault</span>
                      <span className="text-[10px] text-zinc-500">
                        Encrypted database retention
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isStoreActive}
                      id={`toggle-${mod.storeKey}`}
                      onClick={() => handleToggle(mod.storeKey)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isStoreActive ? "bg-cyan-500" : "bg-zinc-800"
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isStoreActive ? "translate-x-4" : "translate-x-0"
                          }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer Spacer */}
      <div className="pt-6 pb-2 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
        <span>MIRA Vault Engine</span>
        <span>•</span>
        <span>Telemetry & Log Retention</span>
        <span>•</span>
        <span>Encrypted Audit Trail</span>
      </div>

      {/* Confirmation Modal */}
      <LogDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleExecuteDelete}
        targetModule={activeDeleteTarget.id}
        moduleName={activeDeleteTarget.name}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
};

export default LogConfigCard;
