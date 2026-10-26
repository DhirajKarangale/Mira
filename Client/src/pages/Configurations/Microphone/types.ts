export type MicrophoneState = "on" | "off";

export interface MicrophonePrivacyItem {
  id: string;
  title: string;
  description: string;
  iconName: "EyeOff" | "Sparkles" | "Trash2" | "CheckCircle2" | "CloudOff" | "Lock";
  badge: string;
}

export const MICROPHONE_PRIVACY_ITEMS: readonly MicrophonePrivacyItem[] = [
  {
    id: "no-unrelated-data",
    title: "Zero Unrelated Collection",
    description: "MIRA does not collect unrelated user data through the microphone. Passive audio is never harvested or scanned.",
    iconName: "EyeOff",
    badge: "Restricted",
  },
  {
    id: "wake-word-trigger",
    title: "Wake Word Triggered Only",
    description: "Audio is captured for MIRA only after the wake word \"Mira\" is detected. Prior conversations are ignored.",
    iconName: "Sparkles",
    badge: "Wake Word: Mira",
  },
  {
    id: "immediate-deletion",
    title: "Immediate Deletion After Processing",
    description: "Audio data is deleted after processing. Transient voice commands are wiped once transcribed and executed.",
    iconName: "Trash2",
    badge: "Zero Retention",
  },
  {
    id: "purpose-limitation",
    title: "Dedicated Single-Purpose Use",
    description: "Audio data is not used for other purposes, advertising, user profiling, or third-party sharing.",
    iconName: "CheckCircle2",
    badge: "Single Purpose",
  },
  {
    id: "local-only",
    title: "No Cloud Transmission",
    description: "Audio data is not sent to the cloud. All capture pipelines execute locally on your physical device.",
    iconName: "CloudOff",
    badge: "100% Local",
  },
  {
    id: "encrypted-storage",
    title: "Protected & Encrypted Local Storage",
    description: "Audio data is stored locally and protected with encryption and access controls via MIRA Vault.",
    iconName: "Lock",
    badge: "Vault Encrypted",
  },
] as const;
