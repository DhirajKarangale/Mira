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

export async function closeWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  } catch {
    try {
      await invoke("close_window");
    } catch {
      return;
    }
  }
}
