import type { FC } from "react";
import { Trophy, Award, Flame, Sparkles } from "lucide-react";

export const AchievementsSection: FC = () => {
  const achievements = [
    {
      title: "LeetCode Knight",
      subtitle: "2,012 rating, 1K+ problems solved, top 2.45% globally.",
      badge: "Top 2.45%",
      icon: Trophy,
      iconColor: "text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]",
    },
    {
      title: "Push to Prod 2026",
      subtitle: "Selected as 1 of 150 builders from 5K+ applicants for Anthropic Claude hackathon.",
      badge: "Anthropic Claude",
      icon: Sparkles,
      iconColor: "text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
    },
    {
      title: "HackWithInfy Finalist",
      subtitle: "National premier competitive programming championship finalist by Infosys.",
      badge: "National Finalist",
      icon: Award,
      iconColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]",
    },
    {
      title: "Active Hackathon Participant",
      subtitle: "Consistently building agentic and developer tooling across competitive engineering forums.",
      badge: "Continuous Builder",
      icon: Flame,
      iconColor: "text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
          <Trophy className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Achievements & Recognitions</h2>
          <p className="text-xs text-zinc-400">Competitive programming, hackathons, and builder honors</p>
        </div>
      </div>

      {/* Grid of Achievements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {achievements.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/15 transition-all flex items-start gap-3.5 group"
            >
              <div
                className={`flex items-center justify-center w-11 h-11 rounded-xl border shrink-0 ${item.iconColor}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.08]">
                    {item.badge}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {item.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
