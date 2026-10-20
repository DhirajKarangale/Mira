export type NavTabId =
  | "mira"
  | "user"
  | "llm-configs"
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
    id: "user",
    label: "User",
    description: "User profiles, preferences, and identity settings",
    iconName: "User",
  },
  {
    id: "llm-configs",
    label: "LLM Configs",
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
    label: "About",
    description: "System version, architecture status, and metadata",
    iconName: "Info",
  },
] as const;
