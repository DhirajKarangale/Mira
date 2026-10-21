import { useState, type FC } from "react";
import { Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useUserDetailsQuery } from "./queries";
import { UserHero } from "./components/UserHero";
import { UserDetailsView } from "./components/UserDetailsView";
import { UserDetailsForm } from "./components/UserDetailsForm";
import type { UserDetails, UserPageMode } from "./types";

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

export const UserPage: FC = () => {
  const { data: details = null, isLoading, isFetching, refetch, error } = useUserDetailsQuery();
  const [mode, setMode] = useState<UserPageMode>("view");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const queryErrorMessage = error
    ? (error as any)?.response?.data?.detail?.message ||
      error.message ||
      "Could not retrieve user details from Vault."
    : null;

  const handleSaveSuccess = (updated: UserDetails) => {
    setMode("view");
    setFeedback({
      type: "success",
      message:
        updated.message ||
        (mode === "add"
          ? "User details created and stored securely in Vault!"
          : "User details updated successfully in Vault!"),
    });

    setTimeout(() => {
      setFeedback((prev) => (prev?.type === "success" ? null : prev));
    }, 5000);
  };

  const hasDetails =
    Boolean(details?.exists) ||
    Boolean(
      details &&
        (details.user_name ||
          details.email ||
          details.phone_number ||
          details.city ||
          details.state ||
          details.country)
    );

  return (
    <div
      id="page-content-user"
      className="h-full w-full overflow-y-auto px-6 py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <UserHero
          mode={mode}
          loading={isLoading || isFetching}
          onRefresh={() => refetch()}
          hasDetails={hasDetails}
        />

        {(feedback || queryErrorMessage) && (
          <div
            id="user-page-feedback-banner"
            className={`flex items-start justify-between gap-3 p-4 rounded-xl border backdrop-blur-md transition-all animate-in fade-in ${
              (feedback?.type || "error") === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {(feedback?.type || "error") === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span className="text-sm font-medium">
                {feedback?.message || queryErrorMessage}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-1 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-16 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400 font-mono">Synchronizing with Vault...</p>
          </div>
        ) : mode === "view" ? (
          <UserDetailsView
            details={details}
            onEdit={() => setMode("edit")}
            onAdd={() => setMode("add")}
          />
        ) : (
          <UserDetailsForm
            initialData={details}
            mode={mode}
            onSaveSuccess={handleSaveSuccess}
            onCancel={() => setMode("view")}
          />
        )}

        <div className="pt-6 pb-4 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
          <span>MIRA Vault Engine</span>
          <span>•</span>
          <span>Encrypted Profile Storage</span>
          <span>•</span>
          <span>SQLite / AES-256</span>
        </div>
      </div>
    </div>
  );
};

export default UserPage;
