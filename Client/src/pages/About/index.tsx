import type { FC } from "react";
import { ProfileHero } from "./components/ProfileHero";
import { AboutSection } from "./components/AboutSection";
import { AchievementsSection } from "./components/AchievementsSection";
import { TechStackSection } from "./components/TechStackSection";
import { LinksSection } from "./components/LinksSection";

export const AboutPage: FC = () => {
  return (
    <div
      id="page-content-about"
      className="h-full w-full overflow-y-auto select-none bg-gradient-to-b from-[#080c14] via-[#090e18] to-[#04070d] text-zinc-100"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Profile Hero Header */}
        <ProfileHero />

        {/* Narrative About Me Section */}
        <AboutSection />

        {/* Achievements & Recognitions Grid */}
        <AchievementsSection />

        {/* Core Technologies & Architecture */}
        <TechStackSection />

        {/* External Connect & Social Links */}
        <LinksSection />

        {/* Bottom subtle copyright / branding footer */}
        <div className="pt-4 pb-8 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
          <span>MIRA System</span>
          <span>•</span>
          <span>Designed & Built by Dhiraj Karangale</span>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
