import { useState, useMemo, type FC } from "react";
import {
  useOperatorConfigQuery,
  useOperatorStatusQuery,
  useUpdateOperatorConfigMutation,
  useToggleCaptureMutation,
} from "../queries";
import { CaptureStatusHeader } from "./components/CaptureStatusHeader";
import { CaptureIntervalCard } from "./components/CaptureIntervalCard";
import { StoredDateRangeCard } from "./components/StoredDateRangeCard";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import type { CaptureStatus, StoredDataRange } from "../types";

const INITIAL_DEMO_RANGE: StoredDataRange = {
  startDate: "2026-10-14",
  endDate: "2026-10-20",
  totalDays: 7,
  hasData: true,
};

export const CaptureConfigurationsPage: FC = () => {
  // Query Vault configuration for Operator (CAPTURE_INTERVAL_SECS, AUTO_START)
  const { data: vaultConfig } = useOperatorConfigQuery();

  // Query Operator live status from cache (staleTime 15m, manual on-demand refresh)
  const { data: operatorStatus, isFetching: statusFetching, refetch: refetchStatus } = useOperatorStatusQuery();

  // Mutations for config updates and start/stop toggling
  const updateConfigMutation = useUpdateOperatorConfigMutation();
  const toggleCaptureMutation = useToggleCaptureMutation();

  // Derive active capturing execution status
  const status: CaptureStatus = useMemo(() => {
    if (!operatorStatus) return "Stopped";
    const isStarted = Boolean(
      operatorStatus.is_running ||
      operatorStatus.is_capturing ||
      (typeof operatorStatus.status === "string" && operatorStatus.status.toLowerCase() === "started")
    );
    return isStarted ? "Started" : "Stopped";
  }, [operatorStatus]);

  // Derive capture interval: prefer Vault config, fallback to Operator live status, default to 10s
  const intervalSecs = useMemo(() => {
    if (typeof vaultConfig?.CAPTURE_INTERVAL_SECS === "number") {
      return vaultConfig.CAPTURE_INTERVAL_SECS;
    }
    if (typeof operatorStatus?.capture_interval_secs === "number" && operatorStatus.capture_interval_secs >= 1) {
      return operatorStatus.capture_interval_secs;
    }
    return 10;
  }, [vaultConfig, operatorStatus]);

  // Derive autoStart setting from Vault
  const autoStart = Boolean(vaultConfig?.AUTO_START);
  const autoStartLoading = updateConfigMutation.isPending;

  // Stored captured data date range & days count
  const [storedRange, setStoredRange] = useState<StoredDataRange>(INITIAL_DEMO_RANGE);
  const [deletedSuccess, setDeletedSuccess] = useState<boolean>(false);

  // Modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Toggle capturing status: Started <-> Stopped directly via Operator mutation
  const handleToggleStatus = async () => {
    if (toggleCaptureMutation.isPending) return;
    const isCurrentlyStarted = status === "Started";
    const nextStatus: CaptureStatus = isCurrentlyStarted ? "Stopped" : "Started";
    await toggleCaptureMutation.mutateAsync(nextStatus);
  };

  // Toggle Auto-Start setting in Vault silently
  const handleToggleAutoStart = async () => {
    await updateConfigMutation.mutateAsync({ AUTO_START: !autoStart });
  };

  // Handle capture interval update in Vault and sync with Operator
  const handleUpdateInterval = async (newSecs: number) => {
    await updateConfigMutation.mutateAsync({ CAPTURE_INTERVAL_SECS: newSecs });
  };

  // Handle deletion of all captured data
  const handleExecuteDelete = () => {
    setStoredRange({
      startDate: "",
      endDate: "",
      totalDays: 0,
      hasData: false,
    });
    setDeletedSuccess(true);
  };

  return (
    <div
      id="subpage-capture-configurations"
      className="h-full w-full overflow-y-auto select-none bg-gradient-to-b from-[#080c14] via-[#090e18] to-[#04070d] text-zinc-100"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* Capturing Status Header with Started/Stopped Badge, Start/Stop Button, and Auto-Start Toggle */}
        <CaptureStatusHeader
          status={status}
          statusLoading={toggleCaptureMutation.isPending}
          autoStart={autoStart}
          autoStartLoading={autoStartLoading}
          onToggleStatus={handleToggleStatus}
          onToggleAutoStart={handleToggleAutoStart}
          onRefresh={() => refetchStatus()}
          refreshing={statusFetching}
        />

        {/* Capture Interval Configuration Card */}
        <CaptureIntervalCard
          intervalSecs={intervalSecs}
          onUpdateInterval={handleUpdateInterval}
          isCapturing={status === "Started"}
        />

        {/* Stored Captured Data Range */}
        <StoredDateRangeCard
          dataRange={storedRange}
          onRequestDeleteAll={() => setShowDeleteConfirm(true)}
          deletedSuccess={deletedSuccess}
        />

        {/* Subtle footer info */}
        <div className="pt-4 pb-6 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2 flex-wrap">
          <span>Operator Engine</span>
          <span>•</span>
          <span>Interval: {intervalSecs}s</span>
          <span>•</span>
          <span>Vault Auto-Start: {autoStart ? "Enabled (10s delay)" : "Disabled"}</span>
          <span>•</span>
          <span>Status: {status}</span>
        </div>
      </div>

      {/* Delete Confirmation Alert Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        totalDays={storedRange.totalDays}
        onExecuteDelete={handleExecuteDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default CaptureConfigurationsPage;
