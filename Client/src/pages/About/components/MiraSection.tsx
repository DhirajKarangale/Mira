import type { FC } from "react";
import { Cpu, ShieldCheck, Radio, Terminal, Brain, LayoutDashboard } from "lucide-react";

export const MiraSection: FC = () => {
  const modules = [
    {
      name: "Operator",
      tech: "Rust",
      desc: "High-performance native screen capture engine and system interaction loop.",
      icon: Terminal,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      name: "Message Broker",
      tech: "Redis Streams",
      desc: "Low-latency pub/sub event pipeline with distributed consumer group management.",
      icon: Radio,
      color: "text-red-400 bg-red-500/10 border-red-500/20",
    },
    {
      name: "Vault",
      tech: "FastAPI / SQLite",
      desc: "AES-256-GCM encrypted persistence for configuration, secrets, and system logs.",
      icon: ShieldCheck,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      name: "Engine & Memory",
      tech: "Python / AI",
      desc: "Cognitive reasoning loops, agentic decision making, and long-term memory buffers.",
      icon: Brain,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      name: "Client",
      tech: "React / Tauri",
      desc: "Hardware-accelerated, dark-mode desktop workstation with real-time controls.",
      icon: LayoutDashboard,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      <div className="absolute top-0 left-1/3 w-80 h-80 bg-blue-500/5 rounded-full blur-[90px] pointer-events-none" />

      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">About MIRA</h2>
          <p className="text-xs text-zinc-400">
            Multi-agent Intelligent Robotic Assistant & Distributed Desktop Architecture
          </p>
        </div>
      </div>

      <div className="space-y-3 text-sm text-zinc-300 leading-relaxed font-normal">
        <p>
          <strong className="text-white font-semibold">MIRA</strong> is an autonomous, multi-agent AI architecture engineered to bridge local desktop automation, high-speed vision/operator loops, and intelligent reasoning engines. Rather than a monolithic process, MIRA is architected as an event-driven constellation of decoupled microservices communicating across low-latency streams.
        </p>
        <p>
          Each module operates independently with dedicated responsibilities—ranging from native Rust-driven screen capturing to zero-trust encrypted secret management in Vault—delivering an extensible, enterprise-grade foundation for next-generation Agentic AI assistants.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.name}
              className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-2 group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-xl border ${mod.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                  {mod.tech}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                  {mod.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {mod.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
