import type { FC } from "react";
import {
  AlertTriangle,
  Trash2,
  X,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  BrainCircuit,
} from "lucide-react";

interface DeleteUserKnowledgeBaseModalProps {
  isOpen: boolean;
  itemCount: number;
  onConfirmDelete: () => Promise<void> | void;
  onClose: () => void;
  isDeleting: boolean;
}

export const DeleteUserKnowledgeBaseModal: FC<DeleteUserKnowledgeBaseModalProps> = ({
  isOpen,
  itemCount,
  onConfirmDelete,
  onClose,
  isDeleting,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={!isDeleting ? onClose : undefined}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-white/[0.1] bg-zinc-950 p-5 sm:p-6 shadow-2xl space-y-4 overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none bg-rose-500/10" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Delete User Knowledge Base?
              </h3>
              <p className="text-xs text-zinc-400">
                Permanent deletion of extracted personal context
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={!isDeleting ? onClose : undefined}
            disabled={isDeleting}
            className="p-1.5 rounded-xl hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Details Card */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-200">
              <BrainCircuit className="w-4 h-4 text-purple-400 shrink-0" />
              <span>User Knowledge Base (Encrypted)</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {itemCount} {itemCount === 1 ? "fact" : "facts"} recorded
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 font-normal leading-relaxed">
            All distilled personal preferences, favorite music, viewing interests, sports teams, and current project activities will be wiped from the local encrypted database.
          </p>
        </div>

        {/* Permanent Deletion & Security Warning */}
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-rose-300 text-[11px]">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Permanent Deletion Warning</span>
          </div>

          <p className="text-xs text-rose-100/90 leading-relaxed font-normal">
            This action is <strong className="text-white font-medium">irreversible</strong>. The encrypted store will be immediately purged and re-initialized as a blank encrypted database.
          </p>

          <div className="pt-2 border-t border-rose-500/20 flex items-start gap-2 text-[11px] text-zinc-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-snug">
              Protected by XChaCha20-Poly1305 encryption on your local machine. Never uploaded to external servers.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-confirm-delete-user-kb"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 border border-rose-400/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting Data...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete User Knowledge Base</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
