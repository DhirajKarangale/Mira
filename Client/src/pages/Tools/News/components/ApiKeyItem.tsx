import { useState, type FC, type FormEvent } from "react";
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
  CheckCircle2,
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
      id={`gnews-api-key-item-${index}`}
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
              <span className="text-xs font-medium text-white">
                Key #{index + 1}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">
                Index: {index}
              </span>

              {isActive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                  <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                  <span>Active Key</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetAsActive(index)}
                  disabled={disabled}
                  className="text-[10px] text-zinc-400 hover:text-cyan-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title={`Set Key #${index + 1} (Index ${index}) as the active key`}
                >
                  <Radio className="w-3 h-3 text-zinc-500 hover:text-cyan-400" />
                  <span>Set as Active</span>
                </button>
              )}
            </div>

            {!isEditing && (
              <div className="mt-1 flex items-center gap-2 font-mono text-xs">
                <span className="text-zinc-300 select-all tracking-wider">
                  {showKey ? apiKey : maskKey(apiKey)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {!isEditing && !showConfirmDelete && (
          <div className="flex items-center gap-1.5 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              disabled={disabled}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title={showKey ? "Hide API key" : "View API key"}
            >
              {showKey ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer relative"
              title="Copy API key"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleStartEdit}
              disabled={disabled}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
              title="Edit API key"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              disabled={disabled}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Delete API key"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Inline Edit Form */}
      {isEditing && (
        <form onSubmit={handleSaveEdit} className="mt-3 pt-3 border-t border-white/[0.06]">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Enter replacement GNews API key..."
                disabled={isSaving}
                autoFocus
                className="flex-1 bg-zinc-900/90 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />

              <button
                type="submit"
                disabled={isSaving || !editValue.trim()}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Save</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 text-zinc-400 hover:text-white text-xs transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {error && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </form>
      )}

      {/* Delete Confirmation Warning */}
      {showConfirmDelete && (
        <div className="mt-3 pt-3 border-t border-rose-500/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Are you sure you want to delete Key #{index + 1}?</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              {isDeleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              <span>Delete</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmDelete(false)}
              disabled={isDeleting}
              className="px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/10 text-zinc-400 hover:text-white text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
