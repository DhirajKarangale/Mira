import { useState, type FC, type ChangeEvent, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Edit2,
  Trash2,
  Radio,
  X,
  Loader2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ElevenLabsApiKeyItemProps {
  index: number;
  apiKey: string;
  isActive: boolean;
  onSetAsActive: (index: number) => void;
  onUpdateKey: (index: number, newKey: string) => Promise<void>;
  onRemoveKey: (index: number) => Promise<void>;
  disabled?: boolean;
}

export const ElevenLabsApiKeyItem: FC<ElevenLabsApiKeyItemProps> = ({
  index,
  apiKey,
  isActive,
  onSetAsActive,
  onUpdateKey,
  onRemoveKey,
  disabled = false,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(apiKey);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
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

  const handleStartEdit = () => {
    setEditValue(apiKey);
    setIsEditing(true);
    setShowKey(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditValue(apiKey);
    setIsEditing(false);
    setError(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanKey = editValue.trim();
    if (!cleanKey) {
      setError("API key cannot be empty.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await onUpdateKey(index, cleanKey);
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || "Failed to update key.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await onRemoveKey(index);
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || "Failed to remove key.");
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div
      id={`key-item-elevenlabs-${index}`}
      className={cn(
        "group relative rounded-xl border p-4 transition-all duration-200",
        isActive
          ? "border-sky-500/40 bg-gradient-to-r from-sky-950/20 via-zinc-900/60 to-zinc-900/40 shadow-[0_0_20px_rgba(14,165,233,0.08)]"
          : "border-white/[0.06] bg-zinc-950/40 hover:border-white/15 hover:bg-zinc-900/40"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left Side: Badges & Key representation */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Index Pill */}
          <div
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg text-xs font-mono font-bold shrink-0",
              isActive
                ? "bg-sky-500/20 border border-sky-500/30 text-sky-300"
                : "bg-white/[0.04] border border-white/10 text-zinc-400"
            )}
          >
            #{index + 1}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 border border-sky-500/30 text-sky-300 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
                  <Radio className="w-2.5 h-2.5 animate-pulse text-sky-400" />
                  <span>ACTIVE VOICE KEY</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.08]">
                  <span>STANDBY</span>
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                <Lock className="w-2.5 h-2.5" />
                <span>Encrypted in Vault</span>
              </span>
            </div>

            {/* Key Value / Edit Input */}
            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="flex items-center gap-2 pt-1 max-w-lg">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                  placeholder="xi-api-key or sk_..."
                  disabled={isSaving}
                  autoFocus
                  className="flex-1 h-8 px-2.5 rounded-lg bg-zinc-950 border border-sky-500/50 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-2.5 h-8 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-2.5 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-300 tracking-wide select-all truncate">
                  {showKey ? apiKey : maskKey(apiKey)}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Action Controls */}
        {!isEditing && (
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            {/* Set as Active Button */}
            {!isActive && (
              <button
                type="button"
                id={`btn-set-active-elevenlabs-${index}`}
                onClick={() => onSetAsActive(index)}
                disabled={disabled}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/[0.04] hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
              >
                Set as Active
              </button>
            )}

            {/* Toggle Mask/Reveal */}
            <button
              type="button"
              id={`btn-reveal-elevenlabs-${index}`}
              onClick={() => setShowKey((prev) => !prev)}
              title={showKey ? "Mask key" : "Reveal key"}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              {showKey ? <EyeOff className="w-4 h-4 text-sky-400" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Copy Button */}
            <button
              type="button"
              id={`btn-copy-elevenlabs-${index}`}
              onClick={handleCopy}
              title="Copy to clipboard"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Edit Button */}
            <button
              type="button"
              id={`btn-edit-elevenlabs-${index}`}
              onClick={handleStartEdit}
              disabled={disabled}
              title="Edit key token"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            {/* Remove Button / Confirm Prompt */}
            {showConfirmDelete ? (
              <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-500/40 rounded-lg p-1 animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  <span>Confirm</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  disabled={isDeleting}
                  className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                id={`btn-delete-elevenlabs-${index}`}
                onClick={() => setShowConfirmDelete(true)}
                disabled={disabled}
                title="Remove key"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
