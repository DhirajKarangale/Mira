export type NavTabId =
  | "mira"
  | "chats"
  | "user"
  | "ai-configs"
  | "history"
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
    id: "user",
    label: "Me",
    description: "User profiles, preferences, and identity settings",
    iconName: "User",
  },
  {
    id: "ai-configs",
    label: "AI Configs",
    description: "Model parameters, providers, and reasoning settings",
    iconName: "Cpu",
  },
  {
    id: "history",
    label: "History",
    description: "Temporal activity logs, recalled memories, and sessions",
    iconName: "History",
  },
  {
    id: "about",
    label: "About us",
    description: "System version, architecture status, and metadata",
    iconName: "Info",
  },
] as const;
