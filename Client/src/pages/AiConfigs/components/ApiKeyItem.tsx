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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyItemProps {
  index: number;
  apiKey: string;
  isActive: boolean;
  onSetAsActive: (index: number) => void;
  onUpdateKey: (index: number, newKey: string) => Promise<void>;
  onRemoveKey: (index: number) => Promise<void>;
  disabled?: boolean;
}

export const ApiKeyItem: FC<ApiKeyItemProps> = ({
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
      id={`api-key-item-${index}`}
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-200 backdrop-blur-md group",
        isActive
          ? "border-cyan-500/40 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.08)]"
          : "border-white/[0.08] bg-zinc-950/40 hover:border-white/15 hover:bg-zinc-950/60"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg text-xs font-mono font-bold shrink-0",
              isActive
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "bg-white/[0.04] text-zinc-400 border border-white/10"
            )}
          >
            #{index + 1}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">
                Key #{index + 1}
              </span>

              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                  <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                  <span>CURRENT KEY: <strong className="text-white underline decoration-cyan-400">#{index + 1}</strong></span>
                </span>
              ) : (
                <button
                  type="button"
                  id={`btn-set-active-key-${index}`}
                  disabled={disabled || isEditing || isDeleting}
                  onClick={() => onSetAsActive(index)}
                  className="text-[11px] font-medium text-zinc-500 hover:text-cyan-400 hover:underline underline-offset-4 cursor-pointer transition-colors disabled:opacity-50"
                >
                  Set as active key
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {copied && (
            <span className="text-[11px] font-mono text-emerald-400 mr-1 animate-in fade-in">
              Copied!
            </span>
          )}

          <button
            type="button"
            id={`btn-copy-key-${index}`}
            onClick={handleCopy}
            title="Copy key"
            className="p-1.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {!isEditing && (
            <button
              type="button"
              id={`btn-edit-key-${index}`}
              disabled={disabled || isDeleting}
              onClick={handleStartEdit}
              title="Edit key"
              className="p-1.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/10 text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {!showConfirmDelete ? (
            <button
              type="button"
              id={`btn-delete-key-${index}`}
              disabled={disabled || isEditing || isDeleting}
              onClick={() => setShowConfirmDelete(true)}
              title="Delete key"
              className="p-1.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 hover:border-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-500/30 rounded-lg p-0.5 animate-in fade-in">
              <button
                type="button"
                id={`btn-confirm-delete-key-${index}`}
                disabled={isDeleting}
                onClick={handleDelete}
                className="px-2 py-1 rounded text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                {isDeleting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span>Delete</span>
                )}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowConfirmDelete(false)}
                className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Cancel deletion"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="space-y-2">
            <div className="relative flex items-center">
              <input
                type={showKey ? "text" : "password"}
                value={editValue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                placeholder="Enter updated API key..."
                autoFocus
                className="w-full h-9 pl-3 pr-24 rounded-lg bg-zinc-900 border border-cyan-500/40 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
              />

              <div className="absolute right-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  title={showKey ? "Mask key" : "Show key"}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {showKey ? (
                    <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Save</span>}
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Cancel edit"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{error}</span>
              </p>
            )}
          </form>
        ) : (
          <div className="relative flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-white/5">
            <span className="font-mono text-xs text-zinc-300 truncate select-all">
              {showKey ? apiKey : maskKey(apiKey)}
            </span>

            <button
              type="button"
              id={`btn-toggle-key-visibility-${index}`}
              onClick={() => setShowKey((prev) => !prev)}
              title={showKey ? "Mask key" : "Show key"}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
            >
              {showKey ? (
                <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
