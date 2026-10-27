import { useState, type FC, type FormEvent, type ChangeEvent } from "react";
import { Key, Eye, EyeOff, Plus, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ElevenLabsAddApiKeyCardProps {
  onAddKey: (key: string, makeActive: boolean) => Promise<void>;
  existingKeys: string[];
  disabled?: boolean;
}

export const ElevenLabsAddApiKeyCard: FC<ElevenLabsAddApiKeyCardProps> = ({
  onAddKey,
  existingKeys,
  disabled = false,
}) => {
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [makeActive, setMakeActive] = useState(existingKeys.length === 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey.trim();

    if (!cleanKey) {
      setError("Please enter a valid ElevenLabs API key.");
      return;
    }

    if (existingKeys.includes(cleanKey)) {
      setError("This API key is already configured for ElevenLabs.");
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
      id="card-add-key-elevenlabs"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden"
    >
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
          <Key className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Add New API Key
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Securely encrypt and store a new ElevenLabs access credential in Vault
          </p>
        </div>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="input-new-elevenlabs-api-key"
              className="block text-xs font-mono font-medium text-zinc-300"
            >
              API Key Token
            </label>

            <div className="relative flex items-center">
              <input
                id="input-new-elevenlabs-api-key"
                type={showKey ? "text" : "password"}
                value={newKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setNewKey(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="xi-api-key or sk_..."
                disabled={disabled || isSubmitting}
                autoComplete="off"
                spellCheck="false"
                className={cn(
                  "w-full h-10 pl-3.5 pr-12 rounded-xl bg-zinc-950/70 border text-xs font-mono text-white placeholder-zinc-500 transition-all focus:outline-none focus:ring-1",
                  error
                    ? "border-rose-500/50 focus:ring-rose-500"
                    : "border-white/10 hover:border-white/20 focus:border-sky-500/50 focus:ring-sky-500/40"
                )}
              />

              <button
                type="button"
                id="btn-toggle-new-elevenlabs-key-visibility"
                onClick={() => setShowKey((prev) => !prev)}
                disabled={disabled || isSubmitting || !newKey}
                className="absolute right-2.5 p-1 rounded-md text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4 text-sky-400" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 pt-0.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                id="checkbox-make-active-elevenlabs"
                checked={makeActive}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setMakeActive(e.target.checked)
                }
                disabled={disabled || isSubmitting}
                className="w-4 h-4 rounded border-white/20 bg-zinc-900 text-sky-600 focus:ring-sky-500/40 focus:ring-offset-0 transition-colors"
              />
              <span className="text-xs text-zinc-300 font-medium">
                Make this key active immediately for speech synthesis
              </span>
            </label>

            <button
              type="submit"
              id="btn-submit-elevenlabs-key"
              disabled={disabled || isSubmitting || !newKey.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-lg shadow-sky-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Encrypting & Storing...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add ElevenLabs API Key</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2 border-t border-white/[0.04] flex items-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              All voice model API credentials are AES-256 encrypted at rest in local Vault storage.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
