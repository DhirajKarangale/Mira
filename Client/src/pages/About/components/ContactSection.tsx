import { useState, type FC } from "react";
import { Mail, MessageSquare, Lightbulb, Bug, Users, Copy, Check, ExternalLink } from "lucide-react";

export const ContactSection: FC = () => {
  const [copied, setCopied] = useState(false);
  const email = "dakarangale02@gmail.com";

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const categories = [
    {
      title: "Suggestions & Ideas",
      desc: "Propose new features, interface enhancements, or architectural capabilities for MIRA.",
      icon: Lightbulb,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Collaborations",
      desc: "Partner on Agentic AI frameworks, enterprise tooling, or distributed systems research.",
      icon: Users,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      title: "Bug Reports",
      desc: "Report unexpected runtime errors, performance bottlenecks, or edge cases.",
      icon: Bug,
      color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Suggestions, Collaborations & Bug Reports
          </h2>
          <p className="text-xs text-zinc-400">
            Reach out for any suggestions, improvements, collaborative projects, or reporting bugs
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div
              key={cat.title}
              className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] space-y-2.5"
            >
              <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${cat.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{cat.title}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{cat.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-zinc-950/80 to-cyan-950/30 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 text-center sm:text-left">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 hidden sm:flex">
            <Mail className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider block">
              Direct Contact & Feedback
            </span>
            <p className="text-sm sm:text-base font-semibold text-white font-mono">
              {email}
            </p>
            <p className="text-xs text-zinc-400">
              Feel free to drop a line anytime—inquiries are typically answered within 24 hours.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-center">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-white/[0.08] transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Email Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy Email</span>
              </>
            )}
          </button>

          <a
            href={`mailto:${email}?subject=MIRA%20Feedback%20%2F%20Collaboration`}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 border border-emerald-400/30 transition-all cursor-pointer active:scale-95"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Email</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>
      </div>
    </div>
  );
};
