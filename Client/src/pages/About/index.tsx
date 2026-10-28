import type { FC } from "react";
import { ProfileHero } from "./components/ProfileHero";
import { MiraSection } from "./components/MiraSection";
import { ContributeSection } from "./components/ContributeSection";
import { AllMyInfoSection } from "./components/AllMyInfoSection";

export const AboutPage: FC = () => {
  return (
    <div
      id="page-content-about"
      className="h-full w-full overflow-y-auto px-3.5 sm:px-6 py-4 sm:py-6 select-none bg-zinc-950/40 text-zinc-100"
    >
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Section 1: Hero (Small hero section about me) */}
        <section id="section-hero" aria-label="About Creator Hero">
          <ProfileHero />
        </section>

        {/* Section 2: MIRA (Every detail about MIRA, 4 pillars, capabilities, privacy & security) */}
        <section id="section-mira" aria-label="MIRA Details">
          <MiraSection />
        </section>

        {/* Section 3: Contribute to MIRA (GitHub repository, ways to contribute) */}
        <section id="section-contribute" aria-label="Contribute to MIRA">
          <ContributeSection />
        </section>

        {/* Section 4: Start about me again (Detailed bio, tech stack, achievements, links, contact) */}
        <section id="section-all-my-info" aria-label="Creator Deep Dive & Profile">
          <AllMyInfoSection />
        </section>

        <div className="pt-4 pb-8 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
          <span>MIRA System</span>
          <span>•</span>
          <span>Memory • Intelligence • Recall • Assistant</span>
          <span>•</span>
          <span>Designed & Built by Dhiraj Karangale</span>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
