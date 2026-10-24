import { useState, type FC, type ReactNode } from "react";
import { AlertTriangle, Trash2, Sparkles, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  requiresKeyword?: string;
  isLoading?: boolean;
}

export const ConfirmModal: FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  requiresKeyword,
  isLoading = false,
}) => {
  const [keywordInput, setKeywordInput] = useState("");

  if (!isOpen) return null;

  const isConfirmedAllowed = requiresKeyword
    ? keywordInput.trim().toUpperCase() === requiresKeyword.toUpperCase()
    : true;

  const handleConfirm = async () => {
    if (!isConfirmedAllowed || isLoading) return;
    await onConfirm();
    setKeywordInput("");
  };

  const handleClose = () => {
    if (isLoading) return;
    setKeywordInput("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-900/95 p-6 shadow-2xl shadow-black/80 text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div
            className={cn(
              "flex items-center justify-center w-11 h-11 rounded-xl border",
              variant === "danger" &&
                "bg-red-500/10 border-red-500/25 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]",
              variant === "warning" &&
                "bg-amber-500/10 border-amber-500/25 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]",
              variant === "default" &&
                "bg-cyan-500/10 border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
            )}
          >
            {variant === "danger" ? (
              <Trash2 className="w-5 h-5" />
            ) : variant === "warning" ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="text-lg font-semibold tracking-tight text-white mb-2">
          {title}
        </h3>
        <div className="text-sm text-zinc-400 mb-5 leading-relaxed">
          {description}
        </div>

        {requiresKeyword && (
          <div className="mb-5 space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Type{" "}
              <span className="font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-red-300 font-semibold">
                {requiresKeyword}
              </span>{" "}
              to confirm:
            </label>
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={requiresKeyword}
              disabled={isLoading}
              className="w-full h-9 px-3 rounded-lg bg-zinc-950/80 border border-white/[0.1] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isConfirmedAllowed || isLoading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
              variant === "danger" &&
                "bg-red-600 hover:bg-red-500 active:bg-red-700 shadow-red-950/50",
              variant === "warning" &&
                "bg-amber-600 hover:bg-amber-500 active:bg-amber-700 shadow-amber-950/50",
              variant === "default" &&
                "bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 shadow-cyan-950/50"
            )}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
