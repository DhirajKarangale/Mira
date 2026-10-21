export interface AIProviderMeta {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  placeholder: string;
  docsUrl: string;
  colorClass: string;
  glowClass: string;
  borderClass: string;
  activeClass: string;
}

export const PROVIDER_METADATA: Record<string, Partial<AIProviderMeta>> = {
  groq: {
    id: "groq",
    name: "Groq",
    tagline: "Ultra-fast LPU inference engine for open-weights models",
    badge: "LPU Ultra-Speed",
    placeholder: "gsk_...",
    docsUrl: "https://console.groq.com/keys",
    colorClass: "text-amber-400",
    glowClass: "shadow-[0_0_20px_rgba(245,158,11,0.25)]",
    borderClass: "border-amber-500/30",
    activeClass: "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.18)]",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    tagline: "Advanced multimodal reasoning & long-context processing",
    badge: "Multimodal AI",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    colorClass: "text-cyan-400",
    glowClass: "shadow-[0_0_20px_rgba(6,182,212,0.25)]",
    borderClass: "border-cyan-500/30",
    activeClass: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.18)]",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "Industry standard GPT-4o and advanced reasoning models",
    badge: "GPT Series",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    colorClass: "text-emerald-400",
    glowClass: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
    borderClass: "border-emerald-500/30",
    activeClass: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.18)]",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    tagline: "Frontier reasoning, analysis, and nuanced generation",
    badge: "Claude 3.5",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    colorClass: "text-purple-400",
    glowClass: "shadow-[0_0_20px_rgba(168,85,247,0.25)]",
    borderClass: "border-purple-500/30",
    activeClass: "bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.18)]",
  },
};

export function getProviderMeta(providerId: string): AIProviderMeta {
  const normalized = providerId.trim().toLowerCase();
  const known = PROVIDER_METADATA[normalized];
  if (known) {
    return {
      id: normalized,
      name: known.name || providerId,
      tagline: known.tagline || "Configured LLM inference provider",
      badge: known.badge || "AI Provider",
      placeholder: known.placeholder || "Enter API Key...",
      docsUrl: known.docsUrl || "",
      colorClass: known.colorClass || "text-indigo-400",
      glowClass: known.glowClass || "shadow-[0_0_20px_rgba(99,102,241,0.2)]",
      borderClass: known.borderClass || "border-indigo-500/30",
      activeClass: known.activeClass || "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]",
    };
  }

  const capitalized = providerId.charAt(0).toUpperCase() + providerId.slice(1);
  return {
    id: normalized,
    name: capitalized,
    tagline: "Custom LLM inference provider",
    badge: "Custom LLM",
    placeholder: "Enter API Key...",
    docsUrl: "",
    colorClass: "text-indigo-400",
    glowClass: "shadow-[0_0_20px_rgba(99,102,241,0.2)]",
    borderClass: "border-indigo-500/30",
    activeClass: "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]",
  };
}

export interface FeedbackNotification {
  type: "success" | "error" | "info";
  message: string;
}
