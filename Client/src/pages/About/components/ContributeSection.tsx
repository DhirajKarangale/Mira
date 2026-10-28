import type { FC } from "react";
import {
  Star,
  GitFork,
  Bug,
  FileText,
  ExternalLink,
  Code2,
  Terminal,
  Brain,
  ShieldCheck,
  Radio,
  Sparkles,
  Heart,
} from "lucide-react";
import { GithubIcon } from "./SocialIcons";

export const ContributeSection: FC = () => {
  const repoUrl = "https://github.com/DhirajKarangale/Mira";

  const contributionAreas = [
    {
      title: "Native Rust Operator",
      desc: "Screen capture optimization, multi-monitor display scaling, OpenCV diffing, and cross-platform automation.",
      tech: "Rust • Tokio • xcap",
      icon: Terminal,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Cognitive Engine & Reasoning",
      desc: "LLM orchestration, prompt minimization, on-device Whisper STT, and autonomous background workers.",
      tech: "Python • FastAPI • Gemini • Groq",
      icon: Brain,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      title: "Perceptual Memory & Vectors",
      desc: "Qdrant vector collections, dense semantic embeddings, and multi-threaded Tesseract OCR enhancements.",
      tech: "Qdrant • OpenCV • Tesseract",
      icon: Code2,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      title: "Vault Cryptography & Security",
      desc: "Zero-trust encrypted persistence, OS hardware keyring derivation, and security audit hardening.",
      tech: "PyNaCl • AES-256-GCM • Keyring",
      icon: ShieldCheck,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Redis Streams Message Fabric",
      desc: "Consumer group balancing, zero-lag streaming event pipelines, and real-time telemetry metrics.",
      tech: "Redis Streams • Pub/Sub",
      icon: Radio,
      color: "text-red-400 bg-red-500/10 border-red-500/20",
    },
    {
      title: "Desktop Client & Ambient Voice",
      desc: "React 19 UI widgets, Tauri v2 shell, bidirectional voice, and dark-mode glassmorphic styling.",
      tech: "Tauri v2 • React 19 • Tailwind v4",
      icon: Sparkles,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-emerald-500/5 rounded-full blur-[90px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.08)]">
            <GithubIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Contribute to MIRA
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-blue-500/30 bg-blue-500/10 text-blue-300">
                Open Source
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Help build the future of local-first, privacy-respecting personal AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
            MIT License
          </span>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
            <Heart className="w-3 h-3 text-emerald-400" />
            PRs Welcome
          </span>
        </div>
      </div>

      {/* Hero Repo Banner / Callout Card */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-zinc-950 via-zinc-900/90 to-zinc-950 p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400">
              <GithubIcon className="w-4 h-4 text-white" />
              <span>DhirajKarangale / Mira</span>
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight">
              Shape the Next Generation of Local AI Workstations
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              MIRA is completely open-source and architected as a modular, decentralized constellation of microservices. Whether you want to optimize native Rust screen capturing, fine-tune dense vector embeddings, integrate local offline LLMs, or craft intuitive React 19 desktop experiences—every contribution makes a meaningful impact!
            </p>
            <div className="pt-1 flex items-center gap-2 text-xs text-zinc-400 font-mono">
              <span className="text-zinc-500">Repository:</span>
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2 flex items-center gap-1"
              >
                {repoUrl}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 min-w-[200px]">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <GithubIcon className="w-4 h-4" />
              <span>View Repository</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>

            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-all active:scale-95 cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
              <span>Star on GitHub</span>
            </a>

            <a
              href={`${repoUrl}/fork`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-all active:scale-95 cursor-pointer"
            >
              <GitFork className="w-3.5 h-3.5 text-zinc-300" />
              <span>Fork & Contribute</span>
            </a>

            <a
              href={`${repoUrl}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-all active:scale-95 cursor-pointer"
            >
              <Bug className="w-3.5 h-3.5 text-rose-400" />
              <span>Report Issue</span>
            </a>
          </div>
        </div>
      </div>

      {/* Contribution Domains */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider">
          Key Areas Where You Can Contribute
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {contributionAreas.map((area) => {
            const Icon = area.icon;
            return (
              <div
                key={area.title}
                className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-xl border ${area.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                    {area.tech}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                    {area.title}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    {area.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* How to get started footer */}
      <div className="p-4 rounded-2xl bg-zinc-950/40 border border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            Check out the official{" "}
            <a
              href={`${repoUrl}/blob/main/CONTRIBUTING.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-blue-300 underline underline-offset-2 font-medium"
            >
              CONTRIBUTING.md
            </a>{" "}
            guide for environment setup, code conventions, and pull request workflows.
          </span>
        </div>
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono text-[11px]"
        >
          <span>github.com/DhirajKarangale/Mira</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default ContributeSection;

