import type { FC } from "react";
import {
  Brain,
  Cpu,
  ShieldCheck,
  Radio,
  Terminal,
  LayoutDashboard,
  Search,
  Mic,
  Lock,
  EyeOff,
  Database,
  Zap,
  Activity,
  CheckCircle2,
  HardDrive,
  Layers,
  Sparkles,
  Sun,
  ShieldAlert,
  Server,
  Play,
  ExternalLink,
} from "lucide-react";
import { YoutubeIcon } from "./SocialIcons";

/**
 * YouTube Demo & Review Video Configuration
 * (Update this constant anytime with a new YouTube watch/share URL)
 */
export const MIRA_DEMO_YOUTUBE_URL = "https://www.youtube.com/watch?v=vLdis3GiZoc";

/**
 * Helper to safely extract YouTube video ID from various standard YouTube URL formats
 */
const getYouTubeVideoId = (url: string): string => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : "vLdis3GiZoc";
};

export const MiraSection: FC = () => {
  const videoId = getYouTubeVideoId(MIRA_DEMO_YOUTUBE_URL);
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;

  // Four Core Pillars
  const pillars = [
    {
      title: "Memory",
      subtitle: "Continuous Digital Perception",
      desc: "Low-overhead screen capture via native Rust, OpenCV matrix diffing (0.008 threshold), multi-threaded Tesseract OCR, and active window UI context extraction.",
      icon: Brain,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      accentGlow: "shadow-[0_0_20px_rgba(168,85,247,0.15)]",
    },
    {
      title: "Intelligence",
      subtitle: "Hybrid Local / Cloud Reasoning",
      desc: "Multi-provider LLM orchestration (Google Gemini & Groq LPU) with dynamic failover, prompt minimization, and background activity summarization.",
      icon: Cpu,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      accentGlow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]",
    },
    {
      title: "Recall",
      subtitle: "Sub-Millisecond Semantic Search",
      desc: "Dense vector embeddings (Qwen/Qwen3-Embedding-0.6B) stored in local Qdrant vector collections for instant semantic recall across all past desktop work.",
      icon: Search,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      accentGlow: "shadow-[0_0_20px_rgba(6,182,212,0.15)]",
    },
    {
      title: "Assistant",
      subtitle: "Ambient Voice & Proactive OS",
      desc: "Bidirectional streaming conversational voice with awake follow-up window, gapless Web Audio synthesis, and native OS automation.",
      icon: Mic,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      accentGlow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]",
    },
  ];

  // Core Capabilities
  const capabilities = [
    {
      title: "Desktop Activity Perception & Screen Capture",
      desc: "Native Rust xcap operator captures screen frames with minimal CPU footprint (<1%). OpenCV matrix diffing compares consecutive frames to eliminate redundant processing when screens are idle.",
      icon: Terminal,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Local Semantic Search & Timeline Recall",
      desc: "Natural language query engine across your digital history: 'What was that API error yesterday?', 'Find the Docker command from terminal', or 'Show the design docs from Figma'.",
      icon: Search,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      title: "Ambient Conversational Voice Interface",
      desc: "Hands-free voice interaction powered by a tri-provider acoustic engine (Browser Speech API, ElevenLabs, and on-device Faster-Whisper) with conversational awake follow-up window and instant interruption.",
      icon: Mic,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      title: "Proactive Morning Cockpit & Workflow Continuity",
      desc: "Automated morning briefings analyzing prior day activities, structured task continuation checklists with interactive completion, local weather forecasts, and curated tech news reader.",
      icon: Sun,
      color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    },
    {
      title: "Multi-Session Conversational Hub",
      desc: "Full-featured chat workstation with multi-threaded sessions, optimistic UI bubbling, markdown formatting, syntax-highlighted code blocks, 1-click clipboard copy, and live WebSocket token streaming.",
      icon: LayoutDashboard,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      title: "Real-Time Telemetry & Worker Health Cockpit",
      desc: "Continuous health pings, worker heartbeats, Redis stream backlog tracking, queue depths, execution latencies, and dynamic port collision resolution.",
      icon: Activity,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
  ];

  // Microservices Architecture
  const modules = [
    {
      name: "Operator",
      port: "9003",
      tech: "Rust • Tokio • xcap",
      desc: "High-performance native screen capture engine and system interaction loop with per-app privacy boundary checks.",
      icon: Terminal,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      name: "Message Broker",
      port: "9002",
      tech: "FastAPI • Redis Streams",
      desc: "Low-latency pub/sub event pipeline with distributed consumer group management (XREADGROUP, XACK) and image cache.",
      icon: Radio,
      color: "text-red-400 bg-red-500/10 border-red-500/20",
    },
    {
      name: "Vault",
      port: "9001",
      tech: "FastAPI • SQLite • PyNaCl",
      desc: "PyNaCl SecretBox (XSalsa20-Poly1305) & AES-256-GCM encrypted persistence for configuration, secrets, and audit logs.",
      icon: ShieldCheck,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      name: "Client",
      port: "9004",
      tech: "Tauri v2 • React 19 • Tailwind v4",
      desc: "Hardware-accelerated dark-mode desktop workstation with real-time controls, morning cockpit, and voice sync.",
      icon: LayoutDashboard,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      name: "Memory",
      port: "9006",
      tech: "FastAPI • OpenCV • Qdrant",
      desc: "OpenCV frame diffing (0.008 threshold), multi-threaded Tesseract OCR, and dense vector embeddings in local Qdrant.",
      icon: Database,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      name: "Engine",
      port: "9007",
      tech: "FastAPI • Gemini • Groq • Whisper",
      desc: "Cognitive brain, multi-provider LLM orchestration, WebSocket streaming (/ws/chat), neural STT, and daily briefings.",
      icon: Brain,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
  ];

  // Privacy & Security Pillars
  const securityPillars = [
    {
      title: "100% Local-First Data Sovereignty",
      desc: "Because MIRA is built from the ground up as a strictly local-first operating assistant, we do not capture, harvest, collect, or store your personal data, screen captures, or voice recordings in the cloud. Your raw activity logs, OCR outputs, local databases, and Qdrant vector indexes live solely on your physical drive under your direct control.",
      icon: HardDrive,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Zero-Trust Encrypted Persistence",
      desc: "All SQLite databases (vault.db, audit_logs.db) and API credentials are cryptographically sealed with authenticated symmetric encryption (PyNaCl SecretBox / XSalsa20-Poly1305 and AES-256-GCM). The master 32-byte key is stored directly in host OS hardware credential vaults (Apple Keychain, Windows Credential Manager, Linux SecretService).",
      icon: Lock,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      title: "Context Minimization Gateway",
      desc: "MIRA enforces a strict architectural boundary between private storage and intelligence inference: MIRA never streams raw screenshots, entire databases, or full activity timelines to cloud LLMs. When answering a query, the Engine retrieves only the single most relevant 2-3 sentence semantic snippet from local Qdrant memory.",
      icon: EyeOff,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      title: "Granular Application Blacklisting & Masking",
      desc: "Users can configure application blacklists (e.g. password managers like 1Password/Bitwarden, banking windows, incognito tabs) to completely halt screen capturing whenever confidential windows are focused, ensuring sensitive credentials and personal data are never recorded.",
      icon: ShieldAlert,
      color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    },
    {
      title: "Air-Gapped & Local LLM Readiness",
      desc: "Engine natively supports routing prompts to local offline models via Ollama, vLLM, or llama.cpp for a 100% air-gapped, zero-internet personal AI operating system where no byte ever leaves your computer.",
      icon: Server,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Physical Machine Isolation & Zero Profiling",
      desc: "Your conversations, work habits, code edits, and documents are never collected for advertising, tracking, telemetry, or centralized AI model training. Nobody else—including the developers of MIRA—can view, intercept, or harvest your private data.",
      icon: ShieldCheck,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-8">
      {/* Subtle background ambient glows */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Title Header */}
      <div className="space-y-4 pb-6 border-b border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl overflow-hidden border border-white/20 bg-zinc-950 p-1.5 shadow-[0_0_20px_rgba(59,130,246,0.25)] shrink-0">
              <img
                src="/icons/favicon-96x96.png"
                alt="MIRA Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
                  MIRA — Memory, Intelligence, Recall, Assistant
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 font-mono mt-0.5">
                Autonomous, Context-Aware, Local-First Personal AI Operating System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
              v0.1.3
            </span>
            <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Local-First Sovereignty
            </span>
          </div>
        </div>

        {/* Short Summary Highlight Box */}
        <div className="relative rounded-2xl bg-gradient-to-r from-blue-950/40 via-zinc-950/80 to-purple-950/40 border border-blue-500/30 p-5 sm:p-6 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-blue-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Short Summary</span>
          </div>
          <p className="text-sm sm:text-base text-zinc-100 font-medium leading-relaxed italic">
            &ldquo;MIRA is a personal AI assistant that builds a private knowledge base from your digital activities, remembers important details, and enables intelligent recall through natural voice conversations.&rdquo;
          </p>
        </div>
      </div>

      {/* Visual System Architecture Banner */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-zinc-950/80 group">
        <img
          src="/icons/features-banner.png"
          alt="MIRA Multi-Agent System Architecture"
          className="w-full h-auto max-h-72 object-cover object-center group-hover:scale-[1.01] transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-zinc-300">
          <span>Decoupled Microservice Constellation</span>
          <span className="text-zinc-500 hidden sm:inline">Redis Streams • Native Rust • Qdrant Vectors</span>
        </div>
      </div>

      {/* MIRA Live Demo & Video Review */}
      <div className="space-y-4 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)] shrink-0">
              <YoutubeIcon className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  MIRA Demo & Architecture Review
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-red-500/30 bg-red-500/10 text-red-300">
                  Video Walkthrough
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Watch the end-to-end walkthrough, ambient voice demo, and system capabilities in action
              </p>
            </div>
          </div>

          <a
            href={MIRA_DEMO_YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30 transition-all active:scale-95 cursor-pointer w-fit"
          >
            <Play className="w-3.5 h-3.5 fill-red-400 text-red-400" />
            <span>Watch on YouTube</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>

        {/* Video Player Container */}
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.1] bg-zinc-950 shadow-2xl aspect-video w-full group">
          <iframe
            src={embedUrl}
            title="MIRA Demo and Review"
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Video Meta Tags */}
        <div className="flex items-center justify-between text-xs text-zinc-400 flex-wrap gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300">
              System Walkthrough
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300">
              Ambient Voice
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300">
              Vector Recall
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300">
              Local-First OS
            </span>
          </div>

          <a
            href={MIRA_DEMO_YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <span>{MIRA_DEMO_YOUTUBE_URL}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* The Four Pillars */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <h2 className="text-base font-bold text-white tracking-tight uppercase tracking-wider text-xs font-mono">
            The Four Pillars: M • I • R • A
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="p-5 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/15 transition-all space-y-3 flex flex-col justify-between group shadow-sm"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className={`p-2.5 rounded-xl border ${pillar.color} ${pillar.accentGlow}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                      Pillar
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors">
                      {pillar.title}
                    </h3>
                    <p className="text-xs font-medium text-zinc-400 mt-0.5">
                      {pillar.subtitle}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed pt-2 border-t border-white/[0.04]">
                  {pillar.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* What is MIRA? (Detailed Narrative) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
          <Cpu className="w-4 h-4 text-blue-400" />
          <h2 className="text-base font-bold text-white tracking-tight">
            What is MIRA? The Philosophy of a Local-First Personal OS
          </h2>
        </div>

        <div className="space-y-3.5 text-xs sm:text-sm text-zinc-300 leading-relaxed font-normal">
          <p>
            Traditional virtual assistants wait passively for explicit typed prompts, retain zero persistent context regarding your actual desktop workflow, and routinely transmit raw screen captures, keystrokes, and private documents to cloud data centers for centralized profiling and model training.
          </p>
          <p>
            <strong className="text-white font-semibold">MIRA</strong> reimagines the human-computer relationship. Operating as an autonomous, decentralized personal digital memory and ambient assistant, MIRA continuously captures your digital footprint—browsing sessions, code edits, reading materials, terminal outputs, and design projects—builds an encrypted, local semantic knowledge base, and uses intelligent background workers to anticipate your needs throughout the day.
          </p>
          <p>
            Rather than a monolithic process that consumes heavy resources, MIRA is architected as an event-driven constellation of decoupled microservices communicating across high-speed Redis Streams.
          </p>
        </div>

        {/* Two Operational Paradigms */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
              <Zap className="w-4 h-4" />
              <span>1. Reactive Assistance</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Instant, contextual recall of past activities, documents, decisions, terminal commands, and system queries issued via keyboard or natural ambient speech commands with sub-second response times.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>2. Proactive Intelligence</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Prepares structured daily agendas, personalized morning news briefs, relevant technical roadmaps, and project continuation summaries before you even ask, helping you resume complex workflows instantly.
            </p>
          </div>
        </div>
      </div>

      {/* What Can MIRA Do? (Capabilities in Detail) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold text-white tracking-tight">
            What Can MIRA Do? Core Capabilities in Detail
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/15 transition-all space-y-2 group shadow-sm"
              >
                <div className={`p-2 rounded-xl border w-fit ${cap.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                  {cap.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {cap.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Microservice Architecture Deep Dive */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Decoupled Microservice Constellation
            </h2>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            6 Autonomous Subsystems
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.name}
                className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-2.5 group shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-xl border ${mod.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                      Port {mod.port}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                      {mod.name}
                    </h3>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {mod.tech}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    {mod.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Privacy & Security Guarantees (In Depth) */}
      <div className="space-y-4 pt-4 border-t border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Privacy & Security Architecture
            </h2>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 w-fit">
            Zero Cloud Data Harvesting Guaranteed
          </span>
        </div>

        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
          MIRA is built upon the foundational axiom of <strong className="text-white">Physical Machine Sovereignty</strong>. Unlike conventional AI systems that monetize or inspect user telemetry, MIRA is engineered for enterprise-grade zero-trust isolation:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {securityPillars.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.title}
                className="p-5 rounded-2xl bg-zinc-950/70 border border-white/[0.08] hover:border-emerald-500/30 transition-all space-y-2.5 group"
              >
                <div className={`p-2.5 rounded-xl border w-fit ${sec.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                  {sec.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {sec.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MiraSection;
