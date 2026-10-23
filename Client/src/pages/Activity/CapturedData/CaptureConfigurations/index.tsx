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
import { toast } from "@/components";

const INITIAL_DEMO_RANGE: StoredDataRange = {
  startDate: "2026-10-14",
  endDate: "2026-10-20",
  totalDays: 7,
  hasData: true,
};

export const CaptureConfigurationsPage: FC = () => {
  const { data: vaultConfig } = useOperatorConfigQuery();
  const { data: operatorStatus, isFetching: statusFetching, refetch: refetchStatus } = useOperatorStatusQuery();
  const updateConfigMutation = useUpdateOperatorConfigMutation();
  const toggleCaptureMutation = useToggleCaptureMutation();

  const status: CaptureStatus = useMemo(() => {
    if (!operatorStatus) return "Stopped";
    const isStarted = Boolean(
      operatorStatus.is_running ||
      operatorStatus.is_capturing ||
      (typeof operatorStatus.status === "string" && operatorStatus.status.toLowerCase() === "started")
    );
    return isStarted ? "Started" : "Stopped";
  }, [operatorStatus]);

  const intervalSecs = useMemo(() => {
    if (typeof vaultConfig?.CAPTURE_INTERVAL_SECS === "number") {
      return vaultConfig.CAPTURE_INTERVAL_SECS;
    }
    if (typeof operatorStatus?.capture_interval_secs === "number" && operatorStatus.capture_interval_secs >= 1) {
      return operatorStatus.capture_interval_secs;
    }
    return 10;
  }, [vaultConfig, operatorStatus]);

  const autoStart = Boolean(vaultConfig?.AUTO_START);
  const autoStartLoading = updateConfigMutation.isPending;

  const [storedRange, setStoredRange] = useState<StoredDataRange>(INITIAL_DEMO_RANGE);
  const [deletedSuccess, setDeletedSuccess] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleToggleStatus = async () => {
    if (toggleCaptureMutation.isPending) return;
    const isCurrentlyStarted = status === "Started";
    const nextStatus: CaptureStatus = isCurrentlyStarted ? "Stopped" : "Started";
    try {
      await toggleCaptureMutation.mutateAsync(nextStatus);
      toast.success(
        nextStatus === "Started"
          ? "Screen capture started successfully."
          : "Screen capture paused/stopped.",
        { title: "Operator Capture" }
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update capture status.";
      toast.error(msg, { title: "Capture Error" });
    }
  };

  const handleToggleAutoStart = async () => {
    const nextVal = !autoStart;
    try {
      await updateConfigMutation.mutateAsync({ AUTO_START: nextVal });
      toast.success(
        nextVal ? "Vault Auto-Start enabled (10s delay)." : "Vault Auto-Start disabled.",
        { title: "Vault Configuration" }
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update AUTO_START.";
      toast.error(msg, { title: "Configuration Error" });
    }
  };

  const handleUpdateInterval = async (newSecs: number) => {
    try {
      await updateConfigMutation.mutateAsync({ CAPTURE_INTERVAL_SECS: newSecs });
      toast.success(`Capture interval updated to ${newSecs}s in Vault.`, {
        title: "Vault Configuration",
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to update interval.";
      toast.error(msg, { title: "Interval Update Error" });
    }
  };

  const handleExecuteDelete = () => {
    setStoredRange({
      startDate: "",
      endDate: "",
      totalDays: 0,
      hasData: false,
    });
    setDeletedSuccess(true);
    toast.success("All stored screen capture data has been permanently cleared.", {
      title: "Data Cleared",
    });
  };

  return (
    <div
      id="subpage-capture-configurations"
      className="h-full w-full overflow-y-auto px-6 py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-6">
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

        <CaptureIntervalCard
          intervalSecs={intervalSecs}
          onUpdateInterval={handleUpdateInterval}
          isCapturing={status === "Started"}
        />

        <StoredDateRangeCard
          dataRange={storedRange}
          onRequestDeleteAll={() => setShowDeleteConfirm(true)}
          deletedSuccess={deletedSuccess}
        />

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
