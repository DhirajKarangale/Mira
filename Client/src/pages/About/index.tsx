import type { FC } from "react";
import { ProfileHero } from "./components/ProfileHero";
import { AboutSection } from "./components/AboutSection";
import { MiraSection } from "./components/MiraSection";
import { AchievementsSection } from "./components/AchievementsSection";
import { TechStackSection } from "./components/TechStackSection";
import { LinksSection } from "./components/LinksSection";
import { ContactSection } from "./components/ContactSection";

export const AboutPage: FC = () => {
  return (
    <div
      id="page-content-about"
      className="h-full w-full overflow-y-auto px-6 py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <ProfileHero />
        <AboutSection />
        <MiraSection />
        <AchievementsSection />
        <TechStackSection />
        <LinksSection />
        <ContactSection />

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
