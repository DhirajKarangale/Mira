import type { FC } from "react";
import { Camera } from "lucide-react";

export const CapturedDataPage: FC = () => {
  return (
    <div
      id="history-subpage-captured-data"
      className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden select-none"
    >
      {/* Subtle ambient lighting */}
      <div className="absolute w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="flex flex-col items-center gap-4 text-center z-10 px-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.15)] mb-1">
          <Camera className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          Captured Data
        </h1>
      </div>
    </div>
  );
};

export default CapturedDataPage;
