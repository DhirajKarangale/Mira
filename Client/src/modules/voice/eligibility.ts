import { useVoiceStore } from "@/store/useVoiceStore";

/**
 * Determines whether the current path is within the chats area.
 */
export function isChatsRoute(targetRoute?: string): boolean {
  const path = targetRoute || (typeof window !== "undefined" ? window.location.pathname : "");
  const normalized = path.toLowerCase().replace(/\/+$/, "") || "/";
  return normalized === "/chats" || normalized.startsWith("/chats/");
}

/**
 * Determines whether voice playback is allowed:
 * - If `voice_enable_master` is disabled, returns `false`.
 * - If `voice_enable_master` is enabled and the current route is `/chats`, returns `false` when `voice_enable_while_typing` is disabled.
 * - Otherwise, returns `true`.
 */
export function canPlayVoice(targetRoute?: string): boolean {
  const { voiceEnableMaster, voiceEnableWhileTyping } = useVoiceStore.getState();

  // 1. Master kill-switch check
  if (!voiceEnableMaster) {
    return false;
  }

  // 2. Chat route typing suppression check
  if (isChatsRoute(targetRoute)) {
    if (!voiceEnableWhileTyping) {
      return false;
    }
  }

  return true;
}
