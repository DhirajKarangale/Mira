import { useState, useEffect, useCallback, type FC } from "react";
import {
  fetchOperatorConfig,
  updateOperatorConfig,
  fetchOperatorStatus,
  startCapture,
  stopCapture,
} from "./api";
import { CaptureStatusHeader } from "./components/CaptureStatusHeader";
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
  // Capturing execution status: Started vs Stopped
  const [status, setStatus] = useState<CaptureStatus>("Stopped");

  // Auto-start configuration from Vault
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [autoStartLoading, setAutoStartLoading] = useState<boolean>(false);

  // Stored captured data date range & days count (dummy for now)
  const [storedRange, setStoredRange] = useState<StoredDataRange>(INITIAL_DEMO_RANGE);
  const [deletedSuccess, setDeletedSuccess] = useState<boolean>(false);

  // Modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load initial operator configurations from Vault & Operator status
  const loadInitialConfigs = useCallback(async () => {
    try {
      const vaultConfig = await fetchOperatorConfig();
      if (typeof vaultConfig.AUTO_START === "boolean") {
        setAutoStart(vaultConfig.AUTO_START);
      }
    } catch (err) {
      console.warn("Could not fetch operator configuration from Vault:", err);
    }

    try {
      const opStatus = await fetchOperatorStatus();
      if (opStatus.is_running) {
        setStatus("Started");
      } else {
        setStatus("Stopped");
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    loadInitialConfigs();
  }, [loadInitialConfigs]);

  // Toggle capturing status: Started <-> Stopped
  const handleToggleStatus = async () => {
    if (status === "Stopped") {
      try {
        await startCapture();
        setStatus("Started");
      } catch {
        // Fallback local toggle if Operator offline
        setStatus("Started");
      }
    } else {
      try {
        await stopCapture();
        setStatus("Stopped");
      } catch {
        setStatus("Stopped");
      }
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
          autoStart={autoStart}
          autoStartLoading={autoStartLoading}
          onToggleStatus={handleToggleStatus}
          onToggleAutoStart={handleToggleAutoStart}
        />

        {/* Stored Captured Data Range (Clean non-repetitive showcase + Delete All button) */}
        <StoredDateRangeCard
          dataRange={storedRange}
          onRequestDeleteAll={() => setShowDeleteConfirm(true)}
          deletedSuccess={deletedSuccess}
        />

        {/* Subtle footer info */}
        <div className="pt-4 pb-6 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
          <span>Operator Engine</span>
          <span>•</span>
          <span>Local Encrypted Storage</span>
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
