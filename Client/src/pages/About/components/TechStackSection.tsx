import type { FC } from "react";
import { Server, Bot, Layout, Database, Code2 } from "lucide-react";

export const TechStackSection: FC = () => {
  const categories = [
    {
      title: "Backend & DevOps",
      icon: Server,
      accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]",
      badgeColor: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:border-emerald-500/40",
      skills: [
        "Java",
        "Spring Boot",
        "Node.js",
        "REST APIs",
        "gRPC",
        "WebSockets",
        "Docker",
        "Jenkins CI/CD",
        "JUnit",
      ],
    },
    {
      title: "AI & LLMs",
      icon: Bot,
      accent: "text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
      badgeColor: "bg-purple-500/10 text-purple-300 border-purple-500/20 hover:border-purple-500/40",
      skills: [
        "Agentic AI",
        "LangGraph",
        "LangChain",
        "RAG",
        "Text-to-SQL",
        "Vector Embeddings",
        "pgvector",
      ],
    },
    {
      title: "Frontend",
      icon: Layout,
      accent: "text-sky-400 bg-sky-500/10 border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.15)]",
      badgeColor: "bg-sky-500/10 text-sky-300 border-sky-500/20 hover:border-sky-500/40",
      skills: [
        "React",
        "TypeScript",
        "Redux Toolkit",
        "Micro-frontends",
      ],
    },
    {
      title: "Databases & Cloud",
      icon: Database,
      accent: "text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]",
      badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/20 hover:border-amber-500/40",
      skills: [
        "PostgreSQL",
        "MySQL",
        "Redis",
        "MongoDB",
        "AWS",
        "GCP",
      ],
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <Code2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Core Technologies</h2>
          <p className="text-xs text-zinc-400">Architecture domains, languages, distributed systems, and AI frameworks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div
              key={cat.title}
              className="p-5 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/15 transition-all space-y-3.5 group"
            >
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-9 h-9 rounded-xl border shrink-0 ${cat.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  {cat.title}
                </h3>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {cat.skills.map((skill) => (
                  <span
                    key={skill}
                    className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${cat.badgeColor}`}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
