import { useState, useMemo, type FC } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Scan,
} from "lucide-react";
import {
  useAppPermissionsQuery,
  useRefreshAppPermissionsMutation,
  useUpdateAppPermissionMutation,
} from "../queries";
import { AppsHeader } from "./components/AppsHeader";
import { AppsFilterBar } from "./components/AppsFilterBar";
import { AppPermissionCard } from "./components/AppPermissionCard";
import type { AppFilterType } from "../types";

export const CaptureAppsConfigurationsPage: FC = () => {
  const { data: apps = [], isLoading, isFetching, error } = useAppPermissionsQuery();
  const refreshMutation = useRefreshAppPermissionsMutation();
  const updateMutation = useUpdateAppPermissionMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<AppFilterType>("all");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Derived counts
  const totalCount = apps.length;
  const allowedCount = useMemo(() => apps.filter((a) => a.allowed_to_capture).length, [apps]);
  const restrictedCount = totalCount - allowedCount;

  // Filtered and searched application list
  const filteredApps = useMemo(() => {
    let result = apps;

    // Filter by allowed / restricted tab
    if (activeFilter === "allowed") {
      result = result.filter((a) => a.allowed_to_capture);
    } else if (activeFilter === "restricted") {
      result = result.filter((a) => !a.allowed_to_capture);
    }

    // Filter by search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (a) =>
          a.app_name.toLowerCase().includes(q) ||
          a.app_id.toLowerCase().includes(q)
      );
    }

    return result;
  }, [apps, activeFilter, searchQuery]);

  // Handle Refresh Apps action
  const handleRefreshApps = async () => {
    try {
      const res = await refreshMutation.mutateAsync();
      const count = res.total_apps || res.total || apps.length;
      setFeedback({
        type: "success",
        message: `App list refreshed successfully! ${count} applications synchronized.`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } }; message?: string })
          ?.response?.data?.detail?.message ||
        (err as Error)?.message ||
        "Failed to refresh system applications.";
      setFeedback({ type: "error", message: msg });
    }
  };

  // Handle Toggle Permission on individual app
  const handleTogglePermission = async (appId: string, currentAllowed: boolean) => {
    try {
      await updateMutation.mutateAsync({
        appId,
        allowedToCapture: !currentAllowed,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } }; message?: string })
          ?.response?.data?.detail?.message ||
        (err as Error)?.message ||
        "Failed to update app capture permission.";
      setFeedback({ type: "error", message: msg });
    }
  };

  return (
    <div
      id="subpage-capture-apps-configurations"
      className="h-full w-full overflow-y-auto px-6 py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Title, Stats Badges, and Refresh Button */}
        <AppsHeader
          totalApps={totalCount}
          allowedCount={allowedCount}
          restrictedCount={restrictedCount}
          onRefresh={handleRefreshApps}
          isRefreshing={refreshMutation.isPending || isFetching}
        />

        {/* Feedback Alert Toast */}
        {(feedback || error) && (
          <div
            id="apps-feedback-banner"
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
                {feedback?.message || (error as Error)?.message || "An error occurred with app permissions."}
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

        {/* Filter and Search Bar */}
        <AppsFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          totalCount={totalCount}
          allowedCount={allowedCount}
          restrictedCount={restrictedCount}
        />

        {/* Apps Grid / List Content */}
        {isLoading ? (
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-16 flex flex-col items-center justify-center gap-3 backdrop-blur-xl">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400 font-mono">Loading application permissions...</p>
          </div>
        ) : filteredApps.length > 0 ? (
          <div className="space-y-3">
            {filteredApps.map((app) => (
              <AppPermissionCard
                key={app.app_id}
                app={app}
                onTogglePermission={handleTogglePermission}
                isUpdating={updateMutation.isPending && updateMutation.variables?.appId === app.app_id}
              />
            ))}
          </div>
        ) : totalCount === 0 ? (
          /* Empty Discovered Apps State */
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-12 text-center backdrop-blur-xl shadow-xl flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(59,130,246,0.15)]">
              <Scan className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5">No Applications Discovered Yet</h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
              MIRA Operator has not yet scanned your system for installed applications. Click the button below to discover applications.
            </p>
            <button
              type="button"
              id="btn-empty-scan-apps"
              onClick={handleRefreshApps}
              disabled={refreshMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              <span>{refreshMutation.isPending ? "Scanning System..." : "Scan & Discover Apps"}</span>
            </button>
          </div>
        ) : (
          /* Empty Search / Filter State */
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-12 text-center backdrop-blur-xl shadow-xl flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-white/[0.08] text-zinc-400 flex items-center justify-center mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Matching Applications Found</h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-4">
              No applications match your search query &ldquo;{searchQuery}&rdquo; under the &ldquo;{activeFilter}&rdquo; filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveFilter("all");
              }}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-4 pb-6 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2 flex-wrap">
          <span>Application Capture Filter</span>
          <span>•</span>
          <span>Synchronized with Vault SQL & Operator Engine</span>
          <span>•</span>
          <span>{totalCount} Total Apps</span>
        </div>
      </div>
    </div>
  );
};

export default CaptureAppsConfigurationsPage;
