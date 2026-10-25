import type { FC } from "react";
import { ProfileHero } from "./components/ProfileHero";
import { MiraSection } from "./components/MiraSection";
import { AllMyInfoSection } from "./components/AllMyInfoSection";

export const AboutPage: FC = () => {
  return (
    <div
      id="page-content-about"
      className="h-full w-full overflow-y-auto px-6 py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Section 1: Hero */}
        <section id="section-hero" aria-label="Hero">
          <ProfileHero />
        </section>

        {/* Section 2: MIRA */}
        <section id="section-mira" aria-label="MIRA">
          <MiraSection />
        </section>

        {/* Section 3: All My Info */}
        <section id="section-all-my-info" aria-label="All My Info">
          <AllMyInfoSection />
        </section>

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
