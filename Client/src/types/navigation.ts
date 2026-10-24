export type NavTabId =
  | "mira"
  | "chats"
  | "user"
  | "configurations"
  | "about";

export interface NavItem {
  id: NavTabId;
  label: string;
  description: string;
  iconName: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "chats",
    label: "Chats",
    description: "Conversation threads, agent dialogues, and active sessions",
    iconName: "MessageSquare",
  },
  {
    id: "configurations",
    label: "Configurations",
    description: "System parameters, AI provider credentials, worker concurrency, and telemetry",
    iconName: "Sliders",
  },
  {
    id: "user",
    label: "Me",
    description: "User profiles, preferences, and identity settings",
    iconName: "User",
  },
  {
    id: "about",
    label: "About us",
    description: "System version, architecture status, and metadata",
    iconName: "Info",
  },
] as const;

