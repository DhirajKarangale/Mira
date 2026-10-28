import type { FC } from "react";
import {
  Activity,
  Cpu,
  Clock,
  Radio,
  Sliders,
  Languages,
} from "lucide-react";

interface MicrophoneDeviceCardProps {
  isOn: boolean;
  autoStart: boolean;
}

export const MicrophoneDeviceCard: FC<MicrophoneDeviceCardProps> = ({
  isOn,
  autoStart,
}) => {
  return (
    <div
      id="microphone-device-card"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-xl shadow-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
          <Sliders className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-white">
            Audio Stream & Hardware Configuration
          </h2>
          <p className="text-xs text-zinc-400">
            Real-time pipeline metrics, English speech recognition, and operating parameters managed by MIRA Operator
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-1.5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Radio className="w-3.5 h-3.5 text-violet-400" />
            <span>Capture Stream</span>
          </div>
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isOn ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            {isOn ? "Active Streaming" : "Standby (Muted)"}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            {isOn ? "Sampling at 16kHz Mono" : "Zero hardware polling"}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-1.5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>Wake-Word Engine</span>
          </div>
          <div className="text-sm font-semibold text-white">
            Keyword: "Mira"
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Local acoustic matcher
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-1.5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Languages className="w-3.5 h-3.5 text-sky-400" />
            <span>Language</span>
          </div>
          <div className="text-sm font-semibold text-white">
            English Only (en)
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Strict recognition constraint
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-1.5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Startup Lifecycle</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {autoStart ? "Auto-Start (Enabled)" : "Manual Trigger"}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            {autoStart ? "Activated on module boot" : "Starts only on user click"}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 space-y-1.5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Processing Location</span>
          </div>
          <div className="text-sm font-semibold text-white">
            100% On-Device
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Zero cloud egress verified
          </div>
        </div>
      </div>
    </div>
  );
};
