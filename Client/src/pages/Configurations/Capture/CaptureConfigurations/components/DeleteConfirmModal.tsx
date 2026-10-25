import { useState, useEffect, type FC } from "react";
import {
  AlertTriangle,
  Trash2,
  X,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export type DeleteModalStep = "confirm" | "deleting" | "success";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  totalDays: number;
  onExecuteDelete: () => Promise<void> | void;
  onClose: () => void;
}

export const DeleteConfirmModal: FC<DeleteConfirmModalProps> = ({
  isOpen,
  totalDays,
  onExecuteDelete,
  onClose,
}) => {
  const [step, setStep] = useState<DeleteModalStep>("confirm");

  useEffect(() => {
    if (isOpen) {
      setStep("confirm");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartDelete = async () => {
    setStep("deleting");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await onExecuteDelete();
    setStep("success");
  };

  const handleModalClose = () => {
    if (step === "deleting") return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={step !== "deleting" ? handleModalClose : undefined}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-white/[0.1] bg-zinc-950 p-6 sm:p-7 shadow-2xl space-y-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${step === "success" ? "bg-emerald-500/10" : "bg-rose-500/10"
            }`}
        />

        {step === "confirm" && (
          <div className="space-y-5 animate-in fade-in">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Delete All Activity Data?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Permanent deletion of {totalDays} {totalDays === 1 ? "day" : "days"} of stored records
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleModalClose}
                className="p-1.5 rounded-xl hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Important Privacy & Security Notice</span>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed font-normal">
                Your activity data is <strong className="text-white font-semibold">encrypted and highly secured</strong>, present <strong className="text-white font-semibold">locally on your device only</strong>. We are not taking it or storing it in the cloud.
              </p>
              <p className="text-xs text-amber-300 font-medium leading-relaxed pt-1 border-t border-amber-500/20">
                ⚠️ If this data is deleted, you will permanently lose all your previous work activity, visual timelines, and activity context. This action cannot be reversed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer"
              >
                Cancel (Keep Data)
              </button>
              <button
                type="button"
                id="btn-confirm-delete-captured-data"
                onClick={handleStartDelete}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 border border-rose-400/40 transition-all cursor-pointer active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete All Data</span>
              </button>
            </div>
          </div>
        )}

        {step === "deleting" && (
          <div className="py-8 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/25 text-rose-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(244,63,94,0.2)]">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Deleting Stored Activity Data...
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                Purging encrypted local screenshots and clearing activity timeline records. Please wait...
              </p>
            </div>

            <div className="w-48 h-1.5 bg-zinc-800 rounded-full mx-auto overflow-hidden">
              <div className="w-full h-full bg-rose-500 rounded-full animate-pulse" />
            </div>

            <p className="text-[11px] font-mono text-zinc-500">
              Processing local deletion (3s delay)...
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="py-4 text-center space-y-5 animate-in fade-in">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.25)]">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Data Deleted Successfully
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-md mx-auto leading-relaxed">
                All local screen activity records and visual history have been permanently deleted from your device.
              </p>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex justify-center">
              <button
                type="button"
                id="btn-close-delete-success-modal"
                onClick={handleModalClose}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-white border border-white/[0.1] shadow-lg transition-all cursor-pointer active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
