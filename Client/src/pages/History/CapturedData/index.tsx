import { useState, useEffect, useCallback, type FC } from "react";
import {
  fetchOperatorConfig,
  updateOperatorConfig,
  fetchOperatorStatus,
  startCapture,
  stopCapture,
} from "./api";
import { CaptureStatusHeader } from "./components/CaptureStatusHeader";
import { CaptureIntervalCard } from "./components/CaptureIntervalCard";
import { StoredDateRangeCard } from "./components/StoredDateRangeCard";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import type { CaptureStatus, StoredDataRange } from "./types";

const INITIAL_DEMO_RANGE: StoredDataRange = {
  startDate: "2026-10-14",
  endDate: "2026-10-20",
  totalDays: 7,
  hasData: true,
};

export const CapturedDataPage: FC = () => {
  // Capturing execution status: Started vs Stopped (determined by Operator live status)
  const [status, setStatus] = useState<CaptureStatus>("Stopped");

  // Capture interval in seconds from Vault (default 10s)
  const [intervalSecs, setIntervalSecs] = useState<number>(10);

  // Auto-start configuration from Vault
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [autoStartLoading, setAutoStartLoading] = useState<boolean>(false);

  // Stored captured data date range & days count (dummy for now)
  const [storedRange, setStoredRange] = useState<StoredDataRange>(INITIAL_DEMO_RANGE);
  const [deletedSuccess, setDeletedSuccess] = useState<boolean>(false);

  // Modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Toggle in-progress state to prevent double-clicks
  const [isToggling, setIsToggling] = useState<boolean>(false);

  // Poll Operator status to keep frontend live and reactive to Operator state changes
  const syncOperatorStatus = useCallback(async () => {
    try {
      const opStatus = await fetchOperatorStatus();
      const isCapturing = Boolean(
        opStatus.is_running ||
        opStatus.is_capturing ||
        (typeof opStatus.status === "string" && opStatus.status.toLowerCase() === "started")
      );
      setStatus(isCapturing ? "Started" : "Stopped");
      if (typeof opStatus.capture_interval_secs === "number" && opStatus.capture_interval_secs >= 1) {
        setIntervalSecs((prev) => prev || opStatus.capture_interval_secs!);
      }
    } catch {
      setStatus("Stopped");
    }
  }, []);

  // Load initial operator configurations from Vault & Operator status directly from Operator service
  const loadInitialConfigs = useCallback(async () => {
    try {
      const vaultConfig = await fetchOperatorConfig();
      if (typeof vaultConfig.AUTO_START === "boolean") {
        setAutoStart(vaultConfig.AUTO_START);
      }
      if (typeof vaultConfig.CAPTURE_INTERVAL_SECS === "number") {
        setIntervalSecs(vaultConfig.CAPTURE_INTERVAL_SECS);
      }
    } catch (err) {
      console.warn("Could not fetch operator configuration from Vault:", err);
    }
    await syncOperatorStatus();
  }, [syncOperatorStatus]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("mira_capture_status");
    }
    loadInitialConfigs();

    // Heartbeat: sync status from Operator every 2.5s so changes are immediately visible
    const timer = setInterval(() => {
      syncOperatorStatus();
    }, 2500);

    return () => clearInterval(timer);
  }, [loadInitialConfigs, syncOperatorStatus]);

  // Toggle capturing status: Started <-> Stopped directly via Operator service
  const handleToggleStatus = async () => {
    if (isToggling) return;
    setIsToggling(true);

    const isCurrentlyStarted = status === "Started";
    const nextStatus: CaptureStatus = isCurrentlyStarted ? "Stopped" : "Started";
    setStatus(nextStatus);

    try {
      if (nextStatus === "Started") {
        await startCapture();
      } else {
        await stopCapture();
      }
      // Re-verify immediately from Operator with a small buffer for process state transition
      setTimeout(() => {
        syncOperatorStatus();
      }, 300);
    } catch (err) {
      console.warn("Could not toggle capturing status:", err);
      // Re-sync with actual Operator state on error
      await syncOperatorStatus();
    } finally {
      setIsToggling(false);
    }
  };

  // Toggle Auto-Start setting in Vault silently
  const handleToggleAutoStart = async () => {
    const nextVal = !autoStart;
    setAutoStartLoading(true);
    try {
      await updateOperatorConfig({ AUTO_START: nextVal });
      setAutoStart(nextVal);
    } catch (err: any) {
      console.error("Failed to update auto start config in Vault:", err);
      setAutoStart(nextVal);
    } finally {
      setAutoStartLoading(false);
    }
  };

  // Handle capture interval update in Vault and sync with Operator
  const handleUpdateInterval = async (newSecs: number) => {
    await updateOperatorConfig({ CAPTURE_INTERVAL_SECS: newSecs });
    setIntervalSecs(newSecs);
  };

  // Handle deletion of all captured data (called after 3s in-modal processing)
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
      id="history-subpage-captured-data"
      className="h-full w-full overflow-y-auto select-none bg-gradient-to-b from-[#080c14] via-[#090e18] to-[#04070d] text-zinc-100"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* Capturing Status Header with Started/Stopped Badge, Start/Stop Button, and Auto-Start Toggle */}
        <CaptureStatusHeader
          status={status}
          statusLoading={isToggling}
          autoStart={autoStart}
          autoStartLoading={autoStartLoading}
          onToggleStatus={handleToggleStatus}
          onToggleAutoStart={handleToggleAutoStart}
        />

        {/* Capture Interval Configuration Card */}
        <CaptureIntervalCard
          intervalSecs={intervalSecs}
          onUpdateInterval={handleUpdateInterval}
          isCapturing={status === "Started"}
        />

        {/* Stored Captured Data Range (Clean non-repetitive showcase + Delete All button) */}
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

      {/* Delete Confirmation Alert Modal with Privacy Warning & In-Modal Deletion/Success States */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        totalDays={storedRange.totalDays}
        onExecuteDelete={handleExecuteDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default CapturedDataPage;
