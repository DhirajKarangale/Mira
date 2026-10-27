import { useState, useEffect, useRef, type FC } from "react";
import { Loader2 } from "lucide-react";
import { useUserDetailsQuery } from "./queries";
import { UserHero } from "./components/UserHero";
import { UserDetailsView } from "./components/UserDetailsView";
import { UserDetailsForm } from "./components/UserDetailsForm";
import type { UserDetails, UserPageMode } from "./types";
import { toast } from "@/components";

export const UserPage: FC = () => {
  const { data: details = null, isLoading, isFetching, refetch, error } = useUserDetailsQuery();
  const [mode, setMode] = useState<UserPageMode>("view");
  const lastErrorRef = useRef<string | null>(null);

  const queryErrorMessage = error
    ? (error as any)?.response?.data?.detail?.message ||
      error.message ||
      "Could not retrieve user details from Vault."
    : null;

  useEffect(() => {
    if (queryErrorMessage && queryErrorMessage !== lastErrorRef.current) {
      lastErrorRef.current = queryErrorMessage;
      toast.error(queryErrorMessage, { title: "Vault Sync Error" });
    }
  }, [queryErrorMessage]);

  const handleSaveSuccess = (updated: UserDetails) => {
    setMode("view");
    const msg =
      updated.message ||
      (mode === "add"
        ? "User details created and stored securely in Vault!"
        : "User details updated successfully in Vault!");
    toast.success(msg, { title: "User Profile" });
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
          details.country ||
          details.address ||
          details.postal_code ||
          details.latitude != null ||
          details.longitude != null)
    );

  return (
    <div
      id="page-content-user"
      className="h-full w-full overflow-y-auto px-3.5 sm:px-6 py-4 sm:py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <UserHero
          mode={mode}
          loading={isLoading || isFetching}
          onRefresh={() => refetch()}
          hasDetails={hasDetails}
        />

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
