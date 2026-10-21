import { useState, useEffect, type FC, type ChangeEvent } from "react";
import {
  Database,
  Server,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Radio,
  Minus,
  Plus,
} from "lucide-react";
import { useRedisConfigQuery, useUpdateRedisConfigMutation } from "../queries";
import type { RedisConfig } from "../types";
import { useRefreshAnimation } from "@/hooks/useRefreshAnimation";
import { cn } from "@/lib/utils";

const DEFAULT_CONFIG: RedisConfig = {
  REDIS_HOST: "localhost",
  REDIS_PORT: 6379,
  REDIS_DB: 0,
  REDIS_PASSWORD: null,
  REDIS_PROTOCOL: 2,
  REDIS_DECODE_RESPONSES: true,
  SERVER_HOST: "127.0.0.1",
  SERVER_RELOAD: false,
};

export const RedisConfigCard: FC = () => {
  const { data: config = DEFAULT_CONFIG, isLoading, isFetching, refetch } = useRedisConfigQuery();
  const updateMutation = useUpdateRedisConfigMutation();

  const { isRefreshing, handleRefresh } = useRefreshAnimation(() => refetch(), { minDurationMs: 650 });
  const isBusy = isLoading || isFetching || isRefreshing;

  const [draft, setDraft] = useState<RedisConfig>(config);
  const [portInput, setPortInput] = useState<string>("6379");
  const [dbInput, setDbInput] = useState<string>("0");
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (config) {
      setDraft(config);
      setPortInput(String(config.REDIS_PORT ?? 6379));
      setDbInput(String(config.REDIS_DB ?? 0));
    }
  }, [config]);

  const saving = updateMutation.isPending;

  const hasChanges = JSON.stringify(config) !== JSON.stringify(draft);

  const handleTextChange = (field: keyof RedisConfig) => (e: ChangeEvent<HTMLInputElement>) => {
    setDraft((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handlePortChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits === "") {
      setPortInput("");
      return;
    }
    const val = parseInt(digits, 10);
    const clamped = Math.min(65535, Math.max(1, val));
    setPortInput(String(clamped));
    setDraft((prev) => ({
      ...prev,
      REDIS_PORT: clamped,
    }));
  };

  const handlePortBlur = () => {
    if (!portInput || portInput.trim() === "") {
      const fallback = 6379;
      setPortInput(String(fallback));
      setDraft((prev) => ({ ...prev, REDIS_PORT: fallback }));
      return;
    }
    const val = parseInt(portInput, 10);
    const clamped = Math.min(65535, Math.max(1, isNaN(val) ? 6379 : val));
    setPortInput(String(clamped));
    setDraft((prev) => ({ ...prev, REDIS_PORT: clamped }));
  };

  const handlePortStep = (delta: number) => {
    const current = draft.REDIS_PORT || 6379;
    const next = Math.min(65535, Math.max(1, current + delta));
    setPortInput(String(next));
    setDraft((prev) => ({ ...prev, REDIS_PORT: next }));
  };

  const handleDbChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits === "") {
      setDbInput("");
      return;
    }
    const val = parseInt(digits, 10);
    const clamped = Math.min(15, Math.max(0, val));
    setDbInput(String(clamped));
    setDraft((prev) => ({
      ...prev,
      REDIS_DB: clamped,
    }));
  };

  const handleDbBlur = () => {
    if (!dbInput || dbInput.trim() === "") {
      setDbInput("0");
      setDraft((prev) => ({ ...prev, REDIS_DB: 0 }));
      return;
    }
    const val = parseInt(dbInput, 10);
    const clamped = Math.min(15, Math.max(0, isNaN(val) ? 0 : val));
    setDbInput(String(clamped));
    setDraft((prev) => ({ ...prev, REDIS_DB: clamped }));
  };

  const handleDbStep = (delta: number) => {
    const current = draft.REDIS_DB ?? 0;
    const next = Math.min(15, Math.max(0, current + delta));
    setDbInput(String(next));
    setDraft((prev) => ({ ...prev, REDIS_DB: next }));
  };

  const handleToggle = (field: "REDIS_DECODE_RESPONSES" | "SERVER_RELOAD") => () => {
    setDraft((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setStatusMessage(null);

    const validPort = Math.min(65535, Math.max(1, Number(draft.REDIS_PORT) || 6379));
    const validDb = Math.min(15, Math.max(0, Number(draft.REDIS_DB) || 0));

    try {
      const payload: Partial<RedisConfig> = {
        REDIS_HOST: draft.REDIS_HOST.trim(),
        REDIS_PORT: validPort,
        REDIS_DB: validDb,
        REDIS_PASSWORD: draft.REDIS_PASSWORD ? draft.REDIS_PASSWORD.trim() : null,
        REDIS_PROTOCOL: Number(draft.REDIS_PROTOCOL),
        REDIS_DECODE_RESPONSES: Boolean(draft.REDIS_DECODE_RESPONSES),
        SERVER_HOST: draft.SERVER_HOST.trim(),
        SERVER_RELOAD: Boolean(draft.SERVER_RELOAD),
      };

      const updated = await updateMutation.mutateAsync(payload);
      setDraft(updated);
      setPortInput(String(updated.REDIS_PORT ?? 6379));
      setDbInput(String(updated.REDIS_DB ?? 0));
      setStatusMessage({
        type: "success",
        text: "Redis configurations saved to Vault successfully.",
      });

      setTimeout(() => {
        setStatusMessage((current) => (current?.type === "success" ? null : current));
      }, 4000);
    } catch (err: any) {
      console.error("Failed to save Redis config:", err);
      setStatusMessage({
        type: "error",
        text: err?.response?.data?.detail?.message || "Failed to update configurations in Vault.",
      });
    }
  };

  const handleDiscard = () => {
    setDraft(config);
    setPortInput(String(config.REDIS_PORT ?? 6379));
    setDbInput(String(config.REDIS_DB ?? 0));
    setStatusMessage(null);
  };

  return (
    <div className="w-full space-y-6">
      {statusMessage && (
        <div
          className={cn(
            "flex items-center gap-3 p-4 rounded-xl border text-sm animate-in fade-in slide-in-from-top-1 duration-200",
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              : "bg-red-500/10 border-red-500/30 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
          )}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="flex-1 font-medium">{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-75 hover:opacity-100 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-2xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-3" />
          <p className="text-sm text-zinc-400 font-medium">Fetching Redis configuration from Vault...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-md p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-red-500/5 rounded-full blur-[80px] pointer-events-none" />

            <div className="flex items-center justify-between pb-5 mb-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Redis Connection Settings</h3>
                  <p className="text-xs text-zinc-400">
                    Connection parameters used by Message Broker and services to connect to Redis
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-white/[0.04] border border-white/[0.08] text-zinc-400">
                Vault Synced
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  REDIS_HOST
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={draft.REDIS_HOST}
                    onChange={handleTextChange("REDIS_HOST")}
                    placeholder="localhost or IP address"
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-white/[0.1] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">Hostname or IPv4/IPv6 address of the Redis server</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    REDIS_PORT
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Range: 1 - 65535
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      id="input-redis-port"
                      value={portInput}
                      onChange={(e) => handlePortChange(e.target.value)}
                      onBlur={handlePortBlur}
                      placeholder="6379"
                      className="w-full h-10 pl-3.5 pr-20 rounded-xl bg-zinc-950/70 border border-white/[0.1] text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {draft.REDIS_PORT === 6379 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="flex items-center bg-zinc-950/80 border border-white/[0.1] rounded-xl p-0.5 shadow-inner">
                    <button
                      type="button"
                      id="btn-port-decrement"
                      onClick={() => handlePortStep(-1)}
                      disabled={draft.REDIS_PORT <= 1}
                      title="Decrease Port (-1)"
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      id="btn-port-increment"
                      onClick={() => handlePortStep(1)}
                      disabled={draft.REDIS_PORT >= 65535}
                      title="Increase Port (+1)"
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {draft.REDIS_PORT !== 6379 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPortInput("6379");
                        setDraft((prev) => ({ ...prev, REDIS_PORT: 6379 }));
                      }}
                      className="px-2.5 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Reset to Redis standard default port 6379"
                    >
                      6379
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">TCP port number (automatically clamped between 1 and 65535)</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    REDIS_DB
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Range: 0 - 15
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      id="input-redis-db"
                      value={dbInput}
                      onChange={(e) => handleDbChange(e.target.value)}
                      onBlur={handleDbBlur}
                      placeholder="0"
                      className="w-full h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-white/[0.1] text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  <div className="flex items-center bg-zinc-950/80 border border-white/[0.1] rounded-xl p-0.5 shadow-inner">
                    <button
                      type="button"
                      id="btn-db-decrement"
                      onClick={() => handleDbStep(-1)}
                      disabled={(draft.REDIS_DB ?? 0) <= 0}
                      title="Decrease DB index (-1)"
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      id="btn-db-increment"
                      onClick={() => handleDbStep(1)}
                      disabled={(draft.REDIS_DB ?? 0) >= 15}
                      title="Increase DB index (+1)"
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((dbNum) => (
                      <button
                        key={dbNum}
                        type="button"
                        onClick={() => {
                          setDbInput(String(dbNum));
                          setDraft((prev) => ({ ...prev, REDIS_DB: dbNum }));
                        }}
                        className={cn(
                          "w-7 h-9 rounded-xl border text-[11px] font-mono transition-colors cursor-pointer flex items-center justify-center",
                          draft.REDIS_DB === dbNum
                            ? "bg-red-500/20 border-red-500/40 text-red-300 font-semibold"
                            : "bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] text-zinc-400 hover:text-white"
                        )}
                        title={`Select DB ${dbNum}`}
                      >
                        {dbNum}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">Database index number (0 to 15, default: 0)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  REDIS_PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={draft.REDIS_PASSWORD ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        REDIS_PASSWORD: e.target.value === "" ? null : e.target.value,
                      }))
                    }
                    placeholder="None (Leave empty for no password)"
                    className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-zinc-950/70 border border-white/[0.1] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">Authentication password for protected Redis instances</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  REDIS_PROTOCOL
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, REDIS_PROTOCOL: 2 }))}
                    className={cn(
                      "h-10 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer",
                      draft.REDIS_PROTOCOL === 2
                        ? "bg-red-500/15 border-red-500/40 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.15)] font-semibold"
                        : "bg-zinc-950/50 border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    )}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    RESP2 (v2 Protocol)
                  </button>

                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, REDIS_PROTOCOL: 3 }))}
                    className={cn(
                      "h-10 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer",
                      draft.REDIS_PROTOCOL === 3
                        ? "bg-red-500/15 border-red-500/40 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.15)] font-semibold"
                        : "bg-zinc-950/50 border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    )}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    RESP3 (v3 Protocol)
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Select RESP2 for Redis 5.x / older versions, RESP3 for Redis 6.0+
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  REDIS_DECODE_RESPONSES
                </label>
                <div className="h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-white/[0.1] flex items-center justify-between">
                  <span className="text-xs text-zinc-300">Decode stream responses to UTF-8 strings</span>
                  <button
                    type="button"
                    onClick={handleToggle("REDIS_DECODE_RESPONSES")}
                    className={cn(
                      "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      draft.REDIS_DECODE_RESPONSES ? "bg-red-600" : "bg-zinc-700"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                        draft.REDIS_DECODE_RESPONSES ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  When enabled, byte returns are automatically decoded to UTF-8
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-md p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-5 mb-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Message Broker Server Settings</h3>
                  <p className="text-xs text-zinc-400">
                    Host binding and auto-reload parameters for the Message Broker service
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  SERVER_HOST
                </label>
                <input
                  type="text"
                  value={draft.SERVER_HOST}
                  onChange={handleTextChange("SERVER_HOST")}
                  placeholder="127.0.0.1"
                  className="w-full h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-white/[0.1] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-colors"
                />
                <p className="text-[11px] text-zinc-500">Interface host address for Message Broker (e.g. 127.0.0.1 or 0.0.0.0)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  SERVER_RELOAD
                </label>
                <div className="h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-white/[0.1] flex items-center justify-between">
                  <span className="text-xs text-zinc-300">Auto-reload server on code changes</span>
                  <button
                    type="button"
                    onClick={handleToggle("SERVER_RELOAD")}
                    className={cn(
                      "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      draft.SERVER_RELOAD ? "bg-orange-600" : "bg-zinc-700"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                        draft.SERVER_RELOAD ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">Enable hot reload in development environments</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-refresh-redis-config"
                onClick={handleRefresh}
                disabled={isBusy || saving}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors outline-none",
                  isBusy || saving
                    ? "bg-white/[0.02] border-white/[0.05] text-zinc-500 cursor-not-allowed opacity-60"
                    : "text-zinc-400 hover:text-zinc-200 bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] cursor-pointer"
                )}
                title={isBusy ? "Refreshing config from Vault..." : "Refresh from Vault"}
              >
                <RotateCcw className={cn("w-3.5 h-3.5", isBusy && "animate-spin text-red-400")} />
                <span>{isBusy ? "Refreshing..." : "Refresh from Vault"}</span>
              </button>

              {hasChanges && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={saving}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Discard Changes
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-xs text-amber-400 font-medium animate-pulse flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Unsaved changes
                </span>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                  hasChanges
                    ? "bg-red-600 hover:bg-red-500 text-white shadow-red-950/50"
                    : "bg-white/[0.05] text-zinc-500 border border-white/[0.05]"
                )}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Configurations
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
