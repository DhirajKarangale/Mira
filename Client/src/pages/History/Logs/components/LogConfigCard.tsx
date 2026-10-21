import { useState, useEffect, type FC } from "react";
import {
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  Database,
  Cpu,
  Monitor,
  Radio,
  Layers,
  Sparkles,
  Minus,
  Plus,
} from "lucide-react";
import { useLogConfigQuery, useSaveLogConfigMutation } from "../queries";
import type { LogConfig } from "../types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogConfigCardProps {
  onSaved?: () => void;
}

const MODULE_DEFINITIONS = [
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

  const [config, setConfig] = useState<LogConfig | null>(serverConfig ?? null);
  const [originalConfig, setOriginalConfig] = useState<LogConfig | null>(serverConfig ?? null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Synchronize draft state when serverConfig resolves or updates
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

  // Master Toggle for "Show in Console" across all 5 modules
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

  // Master Toggle for "Persist to Vault" across all 5 modules
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
    // If empty or tried to reduce below 1 digit, set to 1
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
      setFeedback(null);
      const updated = await saveMutation.mutateAsync(config);
      setConfig(updated);
      setOriginalConfig(updated);
      setFeedback({
        type: "success",
        message: "Log configurations successfully updated in Vault",
      });
      onSaved?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to update log configurations";
      setFeedback({ type: "error", message: errMsg });
    }
  };

  const handleReset = () => {
    if (originalConfig) {
      setConfig({ ...originalConfig });
      setFeedback(null);
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
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Log Retention & Module Stream Settings
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage automatic log pruning and enable/disable real-time display and storage per module.
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

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2.5 p-3 rounded-lg text-xs font-medium border transition-all ${
            feedback.type === "success"
              ? "bg-emerald-950/60 text-emerald-200 border-emerald-500/30"
              : "bg-rose-950/60 text-rose-200 border-rose-500/30"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 1. Retention Period Control with Custom Number Stepper */}
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

        {/* Custom Stepper (No white native arrows) + Quick Presets */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Custom Styled Number Stepper */}
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

          {/* Quick preset chips */}
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

      {/* 2. Module Logs Configuration Grid with Master Toggles */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Module Log Routing & Capture Toggles</span>
          </h3>

          {/* Master Toggles: Show All & Store All */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Master Show in Console */}
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

            {/* Master Store to Disk */}
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
                {/* Module Header */}
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

                {/* Toggles */}
                <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                  {/* Show Logs Toggle */}
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
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isShowActive ? "bg-cyan-500" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isShowActive ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Store Logs Toggle */}
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
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isStoreActive ? "bg-cyan-500" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isStoreActive ? "translate-x-4" : "translate-x-0"
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
    </div>
  );
};
