import type { FC } from "react";
import { Briefcase, Terminal, Sparkles } from "lucide-react";

export const ProfileHero: FC = () => {
  return (
    <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/80 via-zinc-900/50 to-zinc-950/80 p-4 sm:p-6 lg:p-8 backdrop-blur-xl shadow-2xl overflow-hidden">
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="relative shrink-0 group">
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 shadow-[0_0_35px_rgba(16,185,129,0.25)] ring-1 ring-white/10 bg-zinc-950">
            <img
              src="/Profile_DK.png"
              alt="Dhiraj Karangale"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-500 text-zinc-950 shadow-md">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="space-y-3 text-center sm:text-left flex-1">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
              Dhiraj Karangale
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Software Engineer
            </span>
          </div>

          <p className="text-xs sm:text-sm text-zinc-300 font-medium leading-relaxed max-w-4xl">
            Software Engineer | 1.4M+ App & 5.1K+ npm Downloads | Agentic AI • React • Node.js • TypeScript • Python | HackWithInfy Finalist
          </p>

          <div className="flex items-center justify-center sm:justify-start gap-3 text-xs text-zinc-400 pt-1 flex-wrap">
            <span className="flex items-center gap-1.5 font-medium text-zinc-300">
              <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
              Infosys
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              Full-Stack & Agentic AI Architect
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
