import type { FC } from "react";
import { User, Cpu, Sparkles } from "lucide-react";

export const AboutSection: FC = () => {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-5">
      {/* Subtle glowing accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <User className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">About Me</h2>
          <p className="text-xs text-zinc-400">Engineering journey, recent architecture, and open-source contributions</p>
        </div>
      </div>

      {/* Body Paragraphs */}
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed font-normal">
        <p>
          Software Engineer with <strong className="text-white font-semibold">2+ years of experience</strong> building scalable backend architectures, full-stack applications, and Agentic AI products using <span className="text-cyan-300 font-mono text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">Java (Spring Boot)</span>, <span className="text-emerald-300 font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">Node.js</span>, <span className="text-sky-300 font-mono text-xs px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">React</span>, and <span className="text-amber-300 font-mono text-xs px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Python</span>.
        </p>

        <p>
          Currently at <strong className="text-white font-semibold">Infosys</strong>, I design and deploy enterprise-grade applications and AI-powered solutions. My recent work includes architecting a centralized AI Knowledge Base using <span className="text-white font-medium">RAG, Text-to-SQL, and pgvector</span>; building an AI platform that generates Process Design Documents in under 5 minutes; containerizing microservices with <span className="text-white font-medium">Docker and Jenkins CI/CD</span>; and leading system design for React micro-frontends using <span className="text-white font-medium">Webpack Module Federation</span>.
        </p>

        <p>
          I also build open-source AI and developer tools, including <strong className="text-cyan-300 font-semibold">SatyaMark</strong> and <strong className="text-purple-300 font-semibold">Jobora</strong>. My published npm libraries have achieved <span className="text-white font-semibold">5.1K+ downloads</span>, and my Android applications have achieved over <span className="text-white font-semibold">1.4M+ Play Store downloads</span>.
        </p>
      </div>

      {/* Feature highlights bar */}
      <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-2xl bg-zinc-950/50 border border-white/[0.06] flex items-center gap-2.5">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs text-zinc-300">Enterprise AI & Knowledge Bases</span>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-950/50 border border-white/[0.06] flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-xs text-zinc-300">Agentic Workflows & Tooling</span>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-950/50 border border-white/[0.06] flex items-center gap-2.5">
          <User className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs text-zinc-300">High-Impact Open Source Builder</span>
        </div>
      </div>
    </div>
  );
};
