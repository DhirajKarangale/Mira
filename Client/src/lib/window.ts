import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export const isTauriEnvironment = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

export async function minimizeWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  } catch {
    try {
      await invoke("minimize_window");
    } catch {
      return;
    }
  }
}

export async function toggleMaximizeWindow(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return false;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    return await appWindow.isMaximized();
  } catch {
    try {
      return await invoke<boolean>("toggle_maximize_window");
    } catch {
      return false;
    }
  }
}

export async function checkIsMaximized(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return false;
  }

  try {
    const appWindow = getCurrentWindow();
    return await appWindow.isMaximized();
  } catch {
    try {
      return await invoke<boolean>("is_window_maximized");
    } catch {
      return false;
    }
  }
}

/**
 * Hides the window to the system tray (notification area).
 * Background capturing, LLMs, mic, and voice remain fully active.
 */
export async function closeWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.hide();
  } catch {
    try {
      await invoke("close_window");
    } catch {
      return;
    }
  }
}

/**
 * Shows and brings the window to the foreground.
 */
export async function showWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.show();
    await appWindow.unminimize();
    await appWindow.setFocus();
  } catch {
    try {
      await invoke("show_window");
    } catch {
      return;
    }
  }
}

/**
 * Completely terminates the application and stops all background microservices.
 */
export async function exitApp(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    await invoke("exit_app");
  } catch (err) {
    console.warn("Failed to invoke exit_app:", err);
  }
}

/**
 * Checks whether Windows auto-start on computer boot is registered.
 */
export async function checkIsAutostartEnabled(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return false;
  }

  try {
    return await invoke<boolean>("is_autostart_enabled");
  } catch {
    return false;
  }
}

/**
 * Enables or disables Windows auto-start on computer boot.
 */
export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return false;
  }

  try {
    await invoke("set_autostart_enabled", { enabled });
    return true;
  } catch (e) {
    console.warn("Failed to set autostart:", e);
    return false;
  }
}
