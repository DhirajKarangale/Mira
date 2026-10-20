import { vaultApi, operatorApi } from "@/lib/api";
import type { OperatorConfigResponse, OperatorStatusResponse } from "./types";

/**
 * Fetch Operator configuration from Vault (e.g. CAPTURE_INTERVAL_SECS, AUTO_START).
 */
export async function fetchOperatorConfig(): Promise<OperatorConfigResponse> {
  const response = await vaultApi.get<OperatorConfigResponse>("/config/operator");
  return response.data;
}

/**
 * Update Operator configuration in Vault (e.g. toggle AUTO_START).
 */
export async function updateOperatorConfig(
  updates: Partial<OperatorConfigResponse>
): Promise<OperatorConfigResponse> {
  const response = await vaultApi.post<OperatorConfigResponse>("/config/operator", updates);
  return response.data;
}

/**
 * Fetch current Operator capturing status directly from Operator service.
 */
export async function fetchOperatorStatus(): Promise<OperatorStatusResponse> {
  // 1. Primary: Try Axios operatorApi instance
  try {
    const response = await operatorApi.get<OperatorStatusResponse>("/status");
    const data = response.data;
    if (data && (typeof data.is_running === "boolean" || typeof data.is_capturing === "boolean" || data.status)) {
      const isCapturing = Boolean(
        data.is_running ||
        data.is_capturing ||
        (typeof data.status === "string" && data.status.toLowerCase() === "started")
      );
      return {
        ...data,
        is_running: isCapturing,
        is_capturing: isCapturing,
        status: isCapturing ? "started" : "stopped",
      };
    }
  } catch (err) {
    console.warn("operatorApi.get('/status') failed, trying direct browser fallbacks...", err);
  }

  // 2. Secondary: Fallback to direct fetch in browser (resolving host dynamically)
  const currentHost =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "127.0.0.1";

  const candidateUrls = Array.from(
    new Set([
      `http://${currentHost}:8002/status`,
      "http://127.0.0.1:8002/status",
      "http://localhost:8002/status",
    ])
  );

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        const isCapturing = Boolean(
          data.is_running ||
          data.is_capturing ||
          (typeof data.status === "string" && data.status.toLowerCase() === "started")
        );
        return {
          ...data,
          is_running: isCapturing,
          is_capturing: isCapturing,
          status: isCapturing ? "started" : "stopped",
        };
      }
    } catch {
      // try next candidate
    }
  }

  return {
    status: "stopped",
    is_running: false,
    is_capturing: false,
    auto_start: false,
    capture_interval_secs: 10,
  };
}

/**
 * Start screen capture loop in Operator service.
 */
export async function startCapture(): Promise<void> {
  try {
    await operatorApi.get("/start");
    return;
  } catch {
    // fallback to direct fetch
  }

  const currentHost =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "127.0.0.1";

  for (const url of [`http://${currentHost}:8002/start`, "http://127.0.0.1:8002/start", "http://localhost:8002/start"]) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // try next
    }
  }
}

/**
 * Stop screen capture loop in Operator service.
 */
export async function stopCapture(): Promise<void> {
  try {
    await operatorApi.get("/stop");
    return;
  } catch {
    // fallback to direct fetch
  }

  const currentHost =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "127.0.0.1";

  for (const url of [`http://${currentHost}:8002/stop`, "http://127.0.0.1:8002/stop", "http://localhost:8002/stop"]) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // try next
    }
  }
}
