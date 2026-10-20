import type { FC } from "react";
import { Globe, ExternalLink, Link2 } from "lucide-react";
import { GithubIcon, LinkedinIcon, NpmIcon } from "./SocialIcons";

export const LinksSection: FC = () => {
  const links = [
    {
      title: "Portfolio",
      subtitle: "Personal projects, writings, and engineering showcases",
      url: "https://dhirajkarangale.vercel.app/",
      displayUrl: "dhirajkarangale.vercel.app",
      icon: Globe,
      accent: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 group-hover:bg-cyan-500/20",
      borderHover: "hover:border-cyan-500/40",
    },
    {
      title: "LinkedIn",
      subtitle: "Professional network, experience, and career milestones",
      url: "https://www.linkedin.com/in/dhiraj-karangale-464ab91bb/",
      displayUrl: "linkedin.com/in/dhiraj-karangale-464ab91bb",
      icon: LinkedinIcon,
      accent: "text-sky-400 bg-sky-500/10 border-sky-500/20 group-hover:bg-sky-500/20",
      borderHover: "hover:border-sky-500/40",
    },
    {
      title: "GitHub",
      subtitle: "Open-source repositories, agentic architectures, and tools",
      url: "https://github.com/DhirajKarangale",
      displayUrl: "github.com/DhirajKarangale",
      icon: GithubIcon,
      accent: "text-zinc-200 bg-white/[0.06] border-white/10 group-hover:bg-white/10",
      borderHover: "hover:border-white/30",
    },
    {
      title: "NPM",
      subtitle: "Published npm libraries and developer utilities (5.1K+ downloads)",
      url: "https://www.npmjs.com/~dhirajkarangale",
      displayUrl: "npmjs.com/~dhirajkarangale",
      icon: NpmIcon,
      accent: "text-red-400 bg-red-500/10 border-red-500/20 group-hover:bg-red-500/20",
      borderHover: "hover:border-red-500/40",
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <Link2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Connect & Explore Links</h2>
          <p className="text-xs text-zinc-400">External profiles, developer footprints, and portfolio resources</p>
        </div>
      </div>

      {/* Grid of Link Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.title}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] ${link.borderHover} transition-all flex items-center justify-between gap-4 group cursor-pointer shadow-sm hover:shadow-md`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex items-center justify-center w-11 h-11 rounded-xl border shrink-0 transition-colors ${link.accent}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                      {link.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-1">
                    {link.subtitle}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-500 group-hover:text-zinc-400 transition-colors truncate">
                    {link.displayUrl}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.03] group-hover:bg-white/[0.08] text-zinc-400 group-hover:text-white transition-all shrink-0">
                <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
