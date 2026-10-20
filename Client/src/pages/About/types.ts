export interface AchievementItem {
  title: string;
  subtitle: string;
  highlight?: string;
  iconType: "trophy" | "flame" | "award" | "sparkles";
}

export interface TechCategory {
  title: string;
  category: "backend" | "ai" | "frontend" | "cloud";
  iconType: "server" | "bot" | "layout" | "database";
  skills: string[];
}

export interface SocialLink {
  title: string;
  subtitle: string;
  url: string;
  type: "portfolio" | "linkedin" | "github" | "npm";
}
