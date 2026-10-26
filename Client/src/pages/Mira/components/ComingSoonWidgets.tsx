import { type FC } from "react";
import { Music, Film, Sparkles, Clock } from "lucide-react";

export const MusicWidget: FC = () => {
  return (
    <div
      id="mira-music-widget"
      className="relative flex flex-col justify-between p-4 rounded-2xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-xl shadow-lg overflow-hidden group hover:border-purple-500/25 transition-all duration-300"
    >
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-purple-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/15 transition-all duration-500" />

      <div className="flex items-center justify-between gap-2 mb-2 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Music className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">Music & Focus</h3>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-purple-500/10 border border-purple-500/30 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.15)]">
          <Clock className="w-2.5 h-2.5" />
          <span>Coming Soon</span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5 py-2 z-10">
        <p className="text-xs text-zinc-300 font-medium">
          Personalized Soundscapes & Playlists
        </p>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          AI-curated focus tracks, ambient background flows, and study playlists synchronized with your daily work sessions.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04] text-[11px] text-purple-400/80 font-medium z-10">
        <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
        <span>Integration with your local music and streaming libraries</span>
      </div>
    </div>
  );
};

export const EntertainmentWidget: FC = () => {
  return (
    <div
      id="mira-entertainment-widget"
      className="relative flex flex-col justify-between p-4 rounded-2xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-xl shadow-lg overflow-hidden group hover:border-pink-500/25 transition-all duration-300"
    >
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-pink-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-pink-500/15 transition-all duration-500" />

      <div className="flex items-center justify-between gap-2 mb-2 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <Film className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">Entertainment Picks</h3>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-pink-500/10 border border-pink-500/30 text-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.15)]">
          <Clock className="w-2.5 h-2.5" />
          <span>Coming Soon</span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5 py-2 z-10">
        <p className="text-xs text-zinc-300 font-medium">
          Downtime, Cinema & Reading Recommendations
        </p>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Tailored movie recommendations, trending series, and weekend leisure ideas matching your personal taste.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04] text-[11px] text-pink-400/80 font-medium z-10">
        <Sparkles className="w-3 h-3 text-pink-400 shrink-0" />
        <span>Weekend plans and relaxation suggestions</span>
      </div>
    </div>
  );
};
