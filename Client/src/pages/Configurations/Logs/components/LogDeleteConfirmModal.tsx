import { useState, useEffect, type FC } from "react";
import { Trash2, AlertTriangle, X, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  targetModule: string;
  moduleName: string;
  isDeleting: boolean;
}

export const LogDeleteConfirmModal: FC<LogDeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetModule,
  moduleName,
  isDeleting,
}) => {
  const [keywordInput, setKeywordInput] = useState("");
  const isAll = targetModule.toLowerCase() === "all";
  const requiredKeyword = "DELETE";

  useEffect(() => {
    if (isOpen) {
      setKeywordInput("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmedAllowed = isAll
    ? keywordInput.trim().toUpperCase() === requiredKeyword
    : true;

  const handleConfirm = async () => {
    if (!isConfirmedAllowed || isDeleting) return;
    await onConfirm();
  };

  const handleClose = () => {
    if (isDeleting) return;
    setKeywordInput("");
    onClose();
  };

  return (
    <div
      id="modal-log-delete-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        id="modal-log-delete-container"
        className="relative w-full max-w-md rounded-2xl border border-rose-500/30 bg-zinc-900/95 p-6 shadow-2xl shadow-black/80 text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.25)]">
            <Trash2 className="w-5 h-5" />
          </div>

          <button
            type="button"
            id="btn-close-delete-modal"
            onClick={handleClose}
            disabled={isDeleting}
            title="Cancel"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-white">
              {isAll ? "Permanently Delete All Logs?" : `Delete ${moduleName} Logs?`}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
              Irreversible
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            {isAll ? (
              <>
                You are about to permanently purge <strong className="text-white">all encrypted log files across all system modules</strong> from the Vault database. Once deleted, this telemetry and audit trail cannot be recovered.
              </>
            ) : (
              <>
                Are you sure you want to delete all stored logs for the{" "}
                <strong className="text-white">{moduleName}</strong> module? Log files for all other modules will remain completely untouched.
              </>
            )}
          </p>
        </div>

        {isAll ? (
          <div className="mb-5 p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/20 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Safety Confirmation Required</span>
            </div>
            <label className="block text-[11px] text-zinc-300">
              Type <span className="font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-rose-300 font-bold">DELETE</span> to confirm system-wide log purge:
            </label>
            <input
              type="text"
              id="input-confirm-delete-all"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="DELETE"
              disabled={isDeleting}
              autoFocus
              className="w-full h-9 px-3 rounded-lg bg-zinc-950/90 border border-rose-500/30 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 font-mono tracking-wider"
            />
          </div>
        ) : (
          <div className="mb-5 p-3.5 rounded-xl border border-white/[0.08] bg-zinc-950/50 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs text-zinc-400">
              Target Module: <span className="text-white font-semibold font-mono">{moduleName} ({targetModule})</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            id="btn-cancel-log-delete"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            id="btn-confirm-log-delete"
            onClick={handleConfirm}
            disabled={!isConfirmedAllowed || isDeleting}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95",
              "bg-rose-600 hover:bg-rose-500 active:bg-rose-700 shadow-rose-950/60"
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting Logs...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAll ? "Purge All Logs" : `Delete ${moduleName} Logs`}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
