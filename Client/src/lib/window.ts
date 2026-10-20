import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export const isTauriEnvironment = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

/**
 * Minimizes the current desktop window.
 */
export async function minimizeWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    console.info("[WindowControls] Running in browser preview; minimize requested.");
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  } catch (error) {
    console.warn("[WindowControls] API minimize failed, falling back to command:", error);
    try {
      await invoke("minimize_window");
    } catch (cmdError) {
      console.error("[WindowControls] Command minimize failed:", cmdError);
    }
  }
}

/**
 * Toggles maximize / restore on the current desktop window.
 * Returns true if maximized, false if restored.
 */
export async function toggleMaximizeWindow(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    console.info("[WindowControls] Running in browser preview; toggle maximize requested.");
    return false;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    return await appWindow.isMaximized();
  } catch (error) {
    console.warn("[WindowControls] API toggleMaximize failed, falling back to command:", error);
    try {
      return await invoke<boolean>("toggle_maximize_window");
    } catch (cmdError) {
      console.error("[WindowControls] Command toggle_maximize failed:", cmdError);
      return false;
    }
  }
}

/**
 * Checks if the window is currently maximized.
 */
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
 * Closes the application window.
 */
export async function closeWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    console.info("[WindowControls] Running in browser preview; close requested.");
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  } catch (error) {
    console.warn("[WindowControls] API close failed, falling back to command:", error);
    try {
      await invoke("close_window");
    } catch (cmdError) {
      console.error("[WindowControls] Command close failed:", cmdError);
    }
  }
}
