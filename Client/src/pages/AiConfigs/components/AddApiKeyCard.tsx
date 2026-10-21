import { useState, type FC, type FormEvent, type ChangeEvent } from "react";
import { Key, Eye, EyeOff, Plus, Loader2, AlertCircle } from "lucide-react";
import { getProviderMeta } from "../types";
import { cn } from "@/lib/utils";

interface AddApiKeyCardProps {
  provider: string;
  onAddKey: (key: string, makeActive: boolean) => Promise<void>;
  existingKeys: string[];
  disabled?: boolean;
}

export const AddApiKeyCard: FC<AddApiKeyCardProps> = ({
  provider,
  onAddKey,
  existingKeys,
  disabled = false,
}) => {
  const meta = getProviderMeta(provider);
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [makeActive, setMakeActive] = useState(existingKeys.length === 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey.trim();

    if (!cleanKey) {
      setError("Please enter a valid API key.");
      return;
    }

    if (existingKeys.includes(cleanKey)) {
      setError("This API key is already configured for this provider.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onAddKey(cleanKey, makeActive);
      setNewKey("");
      setShowKey(false);
      setMakeActive(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || "Failed to add API key.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id={`card-add-key-${provider}`}
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden"
    >
      {/* Card Header matching LogConfigCard */}
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <Key className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Add New API Key
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Securely encrypt and store a new {meta.name} access credential in Vault
          </p>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="input-new-api-key"
              className="block text-xs font-mono font-medium text-zinc-300"
            >
              API Key Token
            </label>

            <div className="relative flex items-center">
              <input
                id="input-new-api-key"
                type={showKey ? "text" : "password"}
                value={newKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setNewKey(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={meta.placeholder}
                disabled={disabled || isSubmitting}
                autoComplete="off"
                spellCheck="false"
                className={cn(
                  "w-full h-10 pl-3.5 pr-12 rounded-xl bg-zinc-950/70 border text-xs font-mono text-white placeholder-zinc-500 transition-all focus:outline-none focus:ring-1",
                  error
                    ? "border-rose-500/50 focus:ring-rose-500"
                    : "border-white/10 hover:border-white/20 focus:border-cyan-500/50 focus:ring-cyan-500/40"
                )}
              />

              <button
                type="button"
                id="btn-toggle-new-key-visibility"
                onClick={() => setShowKey((prev) => !prev)}
                title={showKey ? "Mask key" : "Show key in plain text"}
                className="absolute right-3 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-mono flex items-center gap-1.5 pt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                id="checkbox-make-active-key"
                checked={makeActive}
                onChange={(e) => setMakeActive(e.target.checked)}
                disabled={disabled || isSubmitting}
                className="w-4 h-4 rounded border-white/20 bg-zinc-950 text-cyan-500 focus:ring-cyan-400 focus:ring-offset-0 focus:ring-1 cursor-pointer"
              />
              <span className="text-xs text-zinc-300 font-medium">
                Set as current active key for {meta.name}
              </span>
            </label>

            <button
              type="submit"
              id="btn-submit-add-key"
              disabled={disabled || isSubmitting || !newKey.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:via-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-cyan-500/20 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Encrypting & Storing...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Key</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
