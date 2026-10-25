import type { FC } from "react";
import { UserCheck } from "lucide-react";
import { AboutSection } from "./AboutSection";
import { TechStackSection } from "./TechStackSection";
import { AchievementsSection } from "./AchievementsSection";
import { LinksSection } from "./LinksSection";
import { ContactSection } from "./ContactSection";

export const AllMyInfoSection: FC = () => {
  return (
    <div id="section-all-my-info" className="space-y-6">
      {/* Section Header: All My Info */}
      <div className="flex items-center gap-3.5 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
          <UserCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white">All My Info</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Developer Profile
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Engineering background, enterprise AI architecture, tech stack, achievements, and contact channels
          </p>
        </div>
      </div>

      {/* Subsections under All My Info */}
      <div className="space-y-6">
        <AboutSection />
        <TechStackSection />
        <AchievementsSection />
        <LinksSection />
        <ContactSection />
      </div>
    </div>
  );
};

export default AllMyInfoSection;
