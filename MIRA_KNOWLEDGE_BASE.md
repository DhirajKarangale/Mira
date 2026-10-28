# MIRA Master Knowledge Base (Systematic Architecture & Reference Manual)

> **The comprehensive, single-source-of-truth knowledge base for the entire MIRA ecosystem: synthesizing all microservices, code architectures, network communication protocols, cryptographic foundations, data pipelines, orchestration workflows, user persona models, and complete end-user guides.**

---

> 📖 **Primary Project Overview**: For high-level project highlights, feature carousels, and rapid introductory guides, refer to the root **[Main MIRA README (README.md)](README.md)**. This Knowledge Base serves as the exhaustive, technical, architectural, and operational manual.

---

<a id="table-of-contents"></a>
## Table of Contents
- [1. What Is MIRA? & Executive Overview](#1-what-is-mira--executive-overview)
  - [1.1 The Definition & Core Concept of MIRA](#11-the-definition--core-concept-of-mira)
  - [1.2 Why MIRA? (The Philosophy, Problem & Motivation)](#12-why-mira-the-philosophy-problem--motivation)
  - [1.3 The Four Pillars: Memory, Intelligence, Recall, Assistant](#13-the-four-pillars-memory-intelligence-recall-assistant)
  - [1.4 Reference to the Main MIRA Project Overview](#14-reference-to-the-main-mira-project-overview)
- [2. Microservice Architecture Matrix & Subsystem Directory Links](#2-microservice-architecture-matrix--subsystem-directory-links)
- [3. Subsystem Deep Dives, Code Architecture & Operations Manuals](#3-subsystem-deep-dives--code-architecture)
  - [3.1 Client Module (Desktop GUI & Multi-Session Chat)](#31-client-module-desktop-gui--multi-session-chat)
  - [3.2 Engine Module (LLM Reasoning & Neural STT)](#32-engine-module-llm-reasoning--neural-stt)
  - [3.3 Memory Module (Perceptual Vision & Qdrant Store)](#33-memory-module-perceptual-vision--qdrant-store)
  - [3.4 Operator Module (Native Rust Screen Capture)](#34-operator-module-native-rust-screen-capture)
  - [3.5 Vault Module (Encrypted Secrets & Authority)](#35-vault-module-encrypted-secrets--authority)
  - [3.6 Message Broker Module (Redis Streams Fabric)](#36-message-broker-module-redis-streams-fabric)
  - [3.7 Scripts & Orchestration Toolkit](#37-scripts--orchestration-toolkit)
- [4. Inter-Service Communication & Network Topology](#4-inter-service-communication--network-topology)
  - [4.1 Port Map & Dynamic Allocation](#41-port-map--dynamic-allocation)
  - [4.2 Redis Streams Event Bus](#42-redis-streams-event-bus)
  - [4.3 Real-Time WebSocket Channels](#43-real-time-websocket-channels)
- [5. Security, Cryptography & Privacy Blueprint](#5-security-cryptography--privacy-blueprint)
- [6. End-to-End Data Flow Pipelines](#6-end-to-end-data-flow-pipelines)
  - [6.1 Continuous Visual Perception Pipeline](#61-continuous-visual-perception-pipeline)
  - [6.2 Multi-Turn Conversational Reasoning Pipeline](#62-multi-turn-conversational-reasoning-pipeline)
  - [6.3 Proactive Daily Briefing Pipeline](#63-proactive-daily-briefing-pipeline)
  - [6.4 Zero-Downtime Configuration Sync Pipeline](#64-zero-downtime-configuration-sync-pipeline)
- [7. Master Technology Stack](#7-master-technology-stack)
- [8. Unified Installation & Quickstart](#8-unified-installation--quickstart)
- [9. Comprehensive End-User Guide & Operations Manual](#9-comprehensive-end-user-guide--operations-manual)
  - [9.1 The MIRA User Model & Persona Customization System](#91-the-mira-user-model--persona-customization-system)
    - [9.1.1 Core Philosophy & Cognitive Grounding](#911-core-philosophy--cognitive-grounding)
    - [9.1.2 The Five Core Dimensions in Granular Detail](#912-the-five-core-dimensions-in-granular-detail)
    - [9.1.3 Cognitive Tone & Communication Mode Comparison](#913-cognitive-tone--communication-mode-comparison)
    - [9.1.4 Cryptographic Storage & Zero-Knowledge Architecture](#914-cryptographic-storage--zero-knowledge-architecture)
    - [9.1.5 LangGraph Cognitive Runtime Injection Pipeline](#915-langgraph-cognitive-runtime-injection-pipeline)
    - [9.1.6 Step-by-Step UI Guide: Configuring Your Persona](#916-step-by-step-ui-guide-configuring-your-persona)
    - [9.1.7 Ready-to-Use Developer Persona Templates](#917-ready-to-use-developer-persona-templates)
  - [9.2 Morning Dashboard & Briefing Cockpit (`/mira`)](#92-morning-dashboard--briefing-cockpit-mira)
  - [9.3 Multi-Session Conversational Chat (`/chats`)](#93-multi-session-conversational-chat-chats)
  - [9.4 Technical News Reader & Explorer (`/tools/news`)](#94-technical-news-reader--explorer-toolsnews)
  - [9.5 Daily Suggestions & Task Management](#95-daily-suggestions--task-management)
  - [9.6 Managing AI Providers & API Keys (Zero-Code Guide)](#96-managing-ai-providers--api-keys-zero-code-guide)
    - [9.6.1 Google Gemini Setup](#961-google-gemini-setup)
    - [9.6.2 Groq LPU Setup](#962-groq-lpu-setup)
    - [9.6.3 ElevenLabs API Keys & Quota Rotation Walkthrough](#963-elevenlabs-api-keys--quota-rotation-walkthrough)
    - [9.6.4 Provider Priority & Automatic Failover Mechanics](#964-provider-priority--automatic-failover-mechanics)
  - [9.7 Privacy Boundaries & Screen Capture Blacklisting](#97-privacy-boundaries--screen-capture-blacklisting)
  - [9.8 Ambient Voice & Wake-Word Controls](#98-ambient-voice--wake-word-controls)
  - [9.9 Worker Concurrency & Redis Telemetry](#99-worker-concurrency--redis-telemetry)
  - [9.10 User Troubleshooting & Frequently Asked Questions (FAQ)](#910-user-troubleshooting--frequently-asked-questions-faq)
- [10. Detailed Future Scope & System Roadmap](#10-detailed-future-scope--system-roadmap)
  - [10.1 On-Device Multimodal Small Language Models (SLMs)](#101-on-device-multimodal-small-language-models-slms)
  - [10.2 Autonomous OS Automation & Desktop Sub-Agents](#102-autonomous-os-automation--desktop-sub-agents)
  - [10.3 Peer-to-Peer Encrypted Multi-Device Sync](#103-peer-to-peer-encrypted-multi-device-sync)
  - [10.4 Predictive Context Anticipation & Workspace Preparation](#104-predictive-context-anticipation--workspace-preparation)
  - [10.5 Full-Duplex Low-Latency Conversational Voice Streaming](#105-full-duplex-low-latency-conversational-voice-streaming)
  - [10.6 Extensible Skill Plugin Ecosystem & Model Context Protocol (MCP)](#106-extensible-skill-plugin-ecosystem--model-context-protocol-mcp)
- [11. Repository Documentation Sitemap](#11-repository-documentation-sitemap)

---

<a id="1-what-is-mira--executive-overview"></a>
## 1. What Is MIRA? & Executive Overview

<a id="11-the-definition--core-concept-of-mira"></a>
### 1.1 The Definition & Core Concept of MIRA

**MIRA** (**M**emory, **I**ntelligence, **R**ecall, **A**ssistant) is an autonomous, decentralized, privacy-first personal AI operating system and ambient digital memory companion. 

Rather than functioning as a passive chatbot locked inside a browser tab waiting for manual prompts, MIRA operates locally across a suite of decoupled background microservices. It unobtrusively observes your desktop workflow, indexes meaningful digital context into hardware-encrypted semantic vector storage, and proactively assists you throughout your workday—from synthesizing morning executive agendas to recalling forgotten code snippets, terminal commands, or research articles you viewed days ago.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MIRA PERSONAL OS CORE                           │
├───────────────────┬───────────────────┬────────────────────────────────┤
│      MEMORY       │   INTELLIGENCE    │             RECALL             │
│ Continuous Vision │ LangGraph Agents  │ Zero-Latency Qdrant Semantic   │
│ & Ephemeral OCR   │ & Dynamic Quota   │ Vector Citations with Context  │
│ Desktop Indexing  │ Engine Failover   │ Minimization Privacy Shield    │
├───────────────────┴───────────────────┴────────────────────────────────┤
│                           ASSISTANT COCKPIT                            │
│ Real-Time Streaming Chat • Proactive Morning Briefings • Ambient Voice │
└────────────────────────────────────────────────────────────────────────┘
```

---

<a id="12-why-mira-the-philosophy-problem--motivation"></a>
### 1.2 Why MIRA? (The Philosophy, Problem & Motivation)

Modern knowledge workers and software engineers suffer from two massive, compounding crises: **Cognitive Fragmentation** and **Privacy Erosion**.

#### 1. The Crisis of Cognitive Fragmentation
- **The Modern Digital Reality**: On any given day, an engineer or researcher navigates across dozens of browser tabs, IDE projects, Slack threads, terminal buffers, PDF papers, and issue trackers.
- **Context Switching Tax**: Studies indicate it takes upwards of 23 minutes to regain deep focus after an interruption. Searching for *"Where did I see that curl command?"* or *"What was the exact formula from that blog post on Tuesday?"* derails deep focus and wastes hours every week.
- **Passive Chatbots Fail**: Tools like standard ChatGPT or Claude are completely isolated from your workstation. They possess zero awareness of what you actually built yesterday, what documentation you read this morning, or what errors you encountered in your terminal. You are forced to spend minutes manually copying and pasting context into every prompt.

#### 2. The Nightmare of Cloud Screen Recording
- Recent commercial attempts at desktop memory (such as Microsoft Recall or cloud-tethered screen recorders) force a terrible bargain: they upload unencrypted screenshots, user keystrokes, and proprietary source code to centralized corporate cloud servers.
- For developers writing proprietary code, handling production secrets, or reading personal messages, cloud surveillance is unacceptable.

#### 3. The MIRA Solution & Core Architectural Axioms
MIRA was created to solve cognitive fragmentation **without compromising privacy**:
1. **Local-First Machine Sovereignty**: Screen captures, OCR text, activity summaries, user profiles, and vector databases reside strictly on your physical machine. No screenshots or documents are ever uploaded to remote servers.
2. **Context Minimization**: When conversational reasoning requires cloud LLM intelligence (Google Gemini, Groq), MIRA searches its local vector memory first, extracts only the minimal relevant 2-3 sentence context excerpt, and transmits that snippet alone—preventing raw desktop history from ever leaving the machine.
3. **Zero-Trust Encrypted Persistence**: All databases (`vault.db`, `audit_logs.db`) and credentials are cryptographically sealed with authenticated symmetric encryption (**PyNaCl** SecretBox / XSalsa20-Poly1305). The master 32-byte key is derived from the host OS hardware credential store (Apple Keychain, Windows Credential Manager, Linux SecretService).
4. **Proactive vs Reactive Assistance**: MIRA doesn't wait for prompts. It wakes up with you, aggregates yesterday's progress, and prepares your morning agenda with actionable tasks and curated technical news.

---

<a id="13-the-four-pillars-memory-intelligence-recall-assistant"></a>
### 1.3 The Four Pillars: Memory, Intelligence, Recall, Assistant

MIRA is architected around four synergistic pillars:

| Pillar | Subsystem Role | Practical User Benefit |
| :--- | :--- | :--- |
| **M**emory | Continuous, low-overhead desktop vision, frame diffing (`0.008` threshold), and multi-threaded Tesseract OCR. | Eliminates manual note-taking; automatically indexes what you read and code without slowing down your computer. |
| **I**ntelligence | LangGraph multi-agent cognitive graph, on-device Faster-Whisper neural STT, and dynamic quota failover across Gemini & Groq. | Provides deep reasoning tailored to your experience level, with automatic 50ms failover if rate limits occur. |
| **R**ecall | Embedded date-partitioned Qdrant vector database with sub-millisecond HNSW cosine similarity search. | Instantly finds forgotten code snippets, links, terminal logs, or configuration steps with semantic precision. |
| **A**ssistant | Tauri v2 desktop GUI, React 19 / Tailwind v4 dashboard, ambient hands-free voice, and proactive morning briefings. | Delivers an executive briefing every morning, streams token-by-token code answers, and provides 1-click privacy controls. |

---

<a id="14-reference-to-the-main-mira-project-overview"></a>
### 1.4 Reference to the Main MIRA Project Overview

> [!TIP]
> 📖 **Master Project Readme**: For introductory project banners, visual architecture summaries, quickstart steps, and community contribution links, view the **[Root MIRA README (README.md)](README.md)**.
> 
> Use this Knowledge Base whenever you need in-depth operational instructions, subsystem reference links, cryptographic specifications, or user model customization guides.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="2-microservice-architecture-matrix--subsystem-directory-links"></a>
## 2. Microservice Architecture Matrix & Subsystem Directory Links

> [!TIP]
> **Single-Document In-Page Navigation & Dedicated Readmes**: Click any **Dedicated Module Readme** link to open that subsystem's dedicated repository documentation. For complete operational guides directly within this Knowledge Base, click the **In-Page Knowledge Base Guide** link.

| Module | Default Port | Technology | Primary Role | Dedicated Module Readme | In-Page Knowledge Base Guide | GitHub Source |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| **Client** | `9004` | Tauri v2, React 19, TypeScript, Tailwind v4 | Desktop GUI, multi-session chat, morning dashboard, privacy controls, ambient voice. | [`Client/README.md`](Client/README.md) | [🖥️ Client Guide & Operations](#31-client-module-desktop-gui--multi-session-chat) | [Client on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Client) |
| **Engine** | `9007` | Python 3.11, FastAPI, Faster-Whisper, Gemini, Groq | Cognitive brain, WebSocket streaming (`/ws/chat`), on-device neural STT, daily briefing. | [`Engine/README.md`](Engine/README.md) | [⚙️ Engine Guide & Operations](#32-engine-module-llm-reasoning--neural-stt) | [Engine on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Engine) |
| **Memory** | `9006` | Python 3.11, FastAPI, OpenCV, Tesseract, Qdrant | OpenCV frame diffing (`0.008` threshold), Tesseract OCR, local Qdrant vector database. | [`Memory/README.md`](Memory/README.md) | [🧠 Memory Guide & Operations](#33-memory-module-perceptual-vision--qdrant-store) | [Memory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Memory) |
| **Operator** | `9003` | Rust (2021), Tokio, Axum, `xcap` | Low-latency native desktop screen capture, window tracking, per-app privacy guard. | [`Operator/README.md`](Operator/README.md) | [🦀 Operator Guide & Operations](#34-operator-module-native-rust-screen-capture) | [Operator on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Operator) |
| **Vault** | `9001` | Python 3.11, FastAPI, SQLite, PyNaCl | Cryptographic authority, hardware keyring, encrypted configs, chat history, user model, audit logs. | [`Vault/README.md`](Vault/README.md) | [🔒 Vault Guide & Operations](#35-vault-module-encrypted-secrets--authority) | [Vault on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Vault) |
| **Message Broker** | `9002` | Python 3.11, FastAPI, Redis Streams | Decoupled event streaming hub, consumer groups (`XREADGROUP`, `XACK`), image cache. | [`Message_Broker/README.md`](Message_Broker/README.md) | [⚡ Broker Guide & Operations](#36-message-broker-module-redis-streams-fabric) | [Broker on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Message_Broker) |
| **Scripts** | N/A | Python 3.11, `psutil`, `socket`, Tauri CLI | Dynamic port conflict resolver, lifecycle supervisor (`start.py`), native packager (`build.py`). | [`scripts/README.md`](scripts/README.md) | [🛠️ Scripts Guide & Operations](#37-scripts--orchestration-toolkit) | [Scripts on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/scripts) |

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="3-subsystem-deep-dives--code-architecture"></a>
## 3. Subsystem Deep Dives, Code Architecture & Operations Manuals

> [!NOTE]
> **Unified Architectural Guide**: This section synthesizes the core purpose, microservice rationale, code structure, key capabilities, and step-by-step operations for each subsystem. For complete codebase implementations, build flags, and component trees, click the dedicated README link for that module.

---

<a id="31-client-module-desktop-gui--multi-session-chat"></a>
### 3.1 Client Module (Desktop GUI & Multi-Session Chat)

> 📖 **Subsystem Codebase Reference**: For full frontend component architecture, directory manifests, and Tauri build configurations, read the **[Dedicated Client README (Client/README.md)](Client/README.md)** or view the **[Client Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Client)**.

* **Dedicated Readme**: [`Client/README.md`](Client/README.md) • [Client Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Client)
* **Default Port**: `9004` (HTTP Webview Dashboard & WS Vite HMR)
* **Technology**: Tauri v2, React 19, TypeScript, TailwindCSS v4, Vite 8, Zustand, Lucide Icons

#### 1. Core Purpose & Architectural Role
The **Client** module is the human interface and command center of MIRA. It serves as your mission control cockpit where you interact with your digital memory: you chat with the AI, review your morning agenda, search through historical notes, configure your encrypted User Model, and manage privacy controls without ever having to touch terminal commands or raw configuration files.

##### Why is it a Decoupled Microservice?
1. **Zero UI Freezing**: Heavy computational operations (like OCR processing, vector embedding, and video matrix comparison) happen in background microservices (`Memory` and `Engine`), leaving the Client buttery smooth at 60+ frames per second.
2. **Dual-Deployment Flexibility**: The Client can run as a lean, native desktop app (via Tauri v2 with a sub-50MB RAM footprint) or as a local web dashboard accessible from any browser at `http://localhost:9004`.
3. **Automated Backend Supervision**: In desktop mode, Tauri v2 (`src-tauri/src/lib.rs`) automatically probes TCP port `9002`. If background services aren't running yet, Tauri spawns `scripts/start.py` in the background automatically.

##### Primary Inputs & Outputs
* **Inputs**: User keyboard prompts, mouse interactions, ambient microphone audio streams (via Web Speech API or OS mic), configuration forms, and incoming WebSocket token streams from the Engine.
* **Outputs**: Rendered Markdown responses, real-time code highlighting with 1-click copy, interactive task checklists, audio playback of synthesized voice responses, and encrypted configuration updates sent to Vault.

#### 2. Code Structure & Directory Manifest
```
Client/
├── src/                          # React 19 application root
│   ├── components/               # Reusable UI primitives (buttons, modals, cards, badges)
│   ├── hooks/                    # Custom React hooks (wake-word, speech recognition, window metrics)
│   ├── modules/                  # Specialized runtime engines
│   │   ├── mic/                  # Multi-provider STT engine (Web Speech, Deepgram, Whisper)
│   │   └── voice/                # Web Audio scheduler, TTS streaming worker, gapless playback
│   ├── pages/                    # Primary views (MiraPage, ChatsPage, Configurations, User, Tools)
│   ├── services/                 # REST API clients mapping to backend microservices
│   ├── store/                    # Zustand state stores (useChatStore, useSettingsStore, etc.)
│   ├── index.css                 # Tailwind CSS v4 design system, glassy tokens, and animations
│   └── App.tsx                   # Root layout, navigation sidebar, and dynamic route switcher
├── src-tauri/                    # Tauri v2 native desktop application shell
│   ├── src/                      # Rust entrypoint, backend supervisor (lib.rs), system tray
│   ├── windows/hooks.nsh         # Windows NSIS installer & uninstaller integration hooks
│   └── tauri.conf.json           # Window properties, security permissions, bundle identifiers
├── package.json                  # Node.js dependencies, scripts, and build targets
└── vite.config.ts                # Vite 8 dev server, path aliases, Tailwind v4 plugin
```

#### 3. Key Capabilities & Code Architecture
1. **Morning Productivity Cockpit (`/mira` — `MiraPage.tsx`)**: Renders personalized greetings, real-time localized weather (`WeatherWidget.tsx`), curated technical news feeds (`NewsWidget.tsx`), and automated project continuation checklists (`DailySuggestionsWidget.tsx`) with interactive completion tracking.
2. **Multi-Session Chat Hub (`/chats` — `ChatsPage.tsx`)**: Supports multi-threaded conversations with optimistic UI bubbling, real-time WebSocket token streaming, syntax-highlighted code blocks, 1-click clipboard copy, and unread notification badges.
3. **Tri-Provider Acoustic Engine (`modules/mic/` & `modules/voice/`)**:
   - *Browser Speech Provider*: Native Web Speech API for immediate client-side recognition.
   - *ElevenLabs Realtime Scribe*: Ultra-low latency cloud streaming with automatic multi-key rotation (`keyQuotaManager.ts`).
   - *OS Native Neural STT*: Local on-device transcription routed directly to Engine's Faster-Whisper service on port `9007`.
   - *Speech Gap Accumulator & Wake-Word*: Accumulates 1.5s pauses (`SPEECH_GAP_DELAY_MS = 1500`) to prevent mid-sentence cutoffs and triggers on *"Mira"*.
   - *Conversational Awake Follow-Up Window*: Keeps session listening active for follow-ups without repeating the wake word.
4. **Native Desktop Shell (`src-tauri/`)**: Cross-platform desktop application powered by Tauri v2 with native system tray docking, frameless window controls, and a sub-50MB RAM footprint.

#### 4. Operations & User Guide
* **Launching**: Run the desktop executable or navigate to `http://localhost:9004`.
* **Sidebar**: Switch between Morning Cockpit (`/mira`), Chats (`/chats`), Profile (`/user`), and Settings (`/configurations`).
* **Hot Reload**: Changes to settings or persona are immediately encrypted by Vault and hot-reloaded across services without restarting.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="32-engine-module-llm-reasoning--neural-stt"></a>
### 3.2 Engine Module (LLM Reasoning & Neural STT)

> 📖 **Subsystem Codebase Reference**: For LangGraph cognitive node implementations, workflow state schemas, and on-device Faster-Whisper configurations, read the **[Dedicated Engine README (Engine/README.md)](Engine/README.md)** or view the **[Engine Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Engine)**.

* **Dedicated Readme**: [`Engine/README.md`](Engine/README.md) • [Engine Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Engine)
* **Default Port**: `9007` (HTTP & WebSockets)
* **Technology**: Python 3.11, FastAPI, Faster-Whisper, Google Gemini 2.5, Groq LPU, PyTorch (`Qwen/Qwen3-Embedding-0.6B`), LangGraph

#### 1. Core Purpose & Architectural Role
The **Engine** module is the cognitive reasoning brain and conversational mind of MIRA. When you speak to MIRA or type a message, the Engine processes your query, looks up relevant memories from your previous activities, checks your encrypted User Model to understand your communication preferences and tech stack, and synthesizes a smart, personalized response streaming token-by-token in real time. It also generates your proactive morning briefing every day.

##### Why is it a Decoupled Microservice?
1. **Isolated Heavy Machine Learning Runtimes**: Speech recognition (Faster-Whisper), PyTorch vector embeddings (`Qwen3-Embedding`), and LangGraph multi-agent cognitive loops require specialized Python AI libraries and CUDA/MPS/CPU compute. Isolating them prevents blocking other system services.
2. **Provider Failover & Quota Resiliency**: If Google Gemini returns an HTTP 429 rate limit or network glitch, the Engine's internal provider manager intercepts it mid-flight and fails over to Groq LPUs in under 50ms without dropping conversational state.
3. **Context Minimization Enforcement**: The Engine acts as an ironclad privacy firewall between your local computer and remote cloud LLMs, ensuring that raw screen text never leaves your machine.

##### Primary Inputs & Outputs
* **Inputs**: Incoming WebSocket `/ws/chat` messages, audio PCM streams for on-device Faster-Whisper transcription, OCR text summaries from Message Broker, and user profile data from Vault.
* **Outputs**: Token-by-token streaming AI completions over WebSocket, synthesized morning briefings and task suggestions, dense 1024-dimensional semantic embeddings published to `embedding_memory`, and encrypted audit logs forwarded to Vault.

#### 2. Code Structure & Directory Manifest
```
Engine/
├── chat/                         # Multi-turn chat & conversational workflows
│   ├── workflow/                 # LangGraph multi-agent cognitive reasoning graph
│   │   ├── graph.py              # Compiled state graph router and node transitions
│   │   ├── decision_node.py      # Semantic intent classification & dynamic tool router
│   │   ├── user_activity_node.py # Historical activity lookup via Memory Qdrant vectors
│   │   ├── history_node.py       # Multi-turn conversational session context builder
│   │   ├── synthesis_node.py     # Multi-provider streaming token synthesizer & citation injector
│   │   ├── news_tool.py          # Real-time technical news retrieval & deduplication
│   │   └── weather_tool.py       # Geolocation & Open-Meteo weather forecasting
│   ├── chat_manager.py           # Session lifecycle, unread counts, and transcript caching
│   ├── streaming.py              # WebSocket token streamer & chunk formatter
│   └── context_builder.py        # Context formulation & Memory vector retrieval
├── voice_stt/                    # On-device neural speech recognition
│   ├── router.py                 # REST & WebSocket endpoints for local audio transcription
│   ├── stt_service.py            # Faster-Whisper local model loader & audio decoding
│   └── native_mic.py             # Host microphone audio streaming via sounddevice
├── daily_suggestions/            # Proactive intelligence & briefing pipelines
│   ├── daily_suggestions.py      # Suggestion synthesis, project continuity, & task generation
│   ├── news_fetcher.py           # GNews API integration & keyword filtering
│   └── weather_fetcher.py        # IP-based geolocation & Open-Meteo weather forecasting
├── ocr_summarization/            # Screen OCR batching & session summarization
├── embedding/                    # Dense semantic vector generation (Qwen3-Embedding-0.6B)
├── llm/                          # Unified multi-provider LLM abstraction (Gemini & Groq failover)
├── app.py                        # FastAPI application entry point, lifecycle, & WebSocket routes
└── config.py                     # Service discovery (services.json), Vault sync, & server ports
```

#### 3. Key Capabilities & Code Architecture
1. **Multi-Provider LLM Orchestrator (`llm/`)**: Standardized inference bridge for Google Gemini and Groq LPU with automatic rate-limit (`429`) failover and dynamic priority re-ranking.
2. **Streaming Chat Engine (`chat/`)**: Bidirectional WebSocket endpoint (`/ws/chat`) providing token-by-token conversational streaming and session state management.
3. **On-Device Neural STT Service (`voice_stt/`)**: Local, offline speech-to-text powered by **Faster-Whisper** and host microphone streaming via `sounddevice` (`POST /voice/stt/transcribe`, `WS /voice/stt/events`), offering 100% private, cloud-free voice transcription.
4. **Context Minimization Gateway (`chat/context_builder.py`)**: Restricts prompt injection strictly to the single most relevant 2-3 sentence context excerpt retrieved from Memory vector storage.
5. **OCR Activity Summarizer (`ocr_summarization/`)**: Consumes raw extracted screen text from Message Broker Redis streams, groups frames by application session, and generates compact semantic activity summaries.
6. **Dense Vector Embeddings (`embedding/`)**: Computes 1024-dimensional dense vectors using a local HuggingFace PyTorch model (`Qwen/Qwen3-Embedding-0.6B`) and pushes them to the `embedding_memory` stream.
7. **Proactive Daily Executive Briefings (`daily_suggestions/`)**: Synthesizes morning continuation agendas, pending tasks, weather, and technical news from past activity memories.

#### 4. Operations & Developer Guide
* **Conversational Reasoning (`/ws/chat`)**: Queries evaluate through LangGraph nodes (`decision_node.py` -> `user_activity_node.py` -> `history_node.py` -> `synthesis_node.py`) and stream tokens back in real time.
* **Context Minimization**: Queries local Qdrant vectors (`POST http://127.0.0.1:9006/knowledge-base/search`) and extracts only the top 2-3 relevant sentences, scrubbing file paths and PII.
* **On-Device STT**: Select **OS Native Neural STT** in microphone settings to run 100% offline Faster-Whisper transcription without cloud dependencies.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="33-memory-module-perceptual-vision--qdrant-store"></a>
### 3.3 Memory Module (Perceptual Vision & Qdrant Store)

> 📖 **Subsystem Codebase Reference**: For perceptual matrix diffing algorithms, Tesseract OCR multi-threaded tiling, and Qdrant collection partitioning, read the **[Dedicated Memory README (Memory/README.md)](Memory/README.md)** or view the **[Memory Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Memory)**.

* **Dedicated Readme**: [`Memory/README.md`](Memory/README.md) • [Memory Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Memory)
* **Default Port**: `9006` (HTTP)
* **Technology**: Python 3.11, FastAPI, OpenCV (`opencv-python-headless`), Tesseract OCR, Embedded Qdrant Vector Database

#### 1. Core Purpose & Architectural Role
The **Memory** module is the visual memory and long-term knowledge archive of MIRA. It consumes raw desktop screenshots taken by the Operator, uses OpenCV to discard screens that haven't changed (saving CPU and battery), extracts readable text from changed screens using Tesseract OCR, and indexes that information into a local, date-partitioned Qdrant vector database so you can search and recall anything you saw or did days or weeks ago.

##### Why is it a Decoupled Microservice?
1. **Intensive CPU / Memory Workloads**: Optical Character Recognition and image matrix diffing are compute-heavy operations. Running Memory as an independent microservice ensures that OCR processing runs on dedicated background worker pools and never blocks user chats or desktop interactions.
2. **Disk Hygiene & Privacy Guard**: As soon as Memory extracts text from an image, it immediately commands the Operator to permanently delete the raw screenshot PNG from disk. Images are ephemeral; only structured text and vectors persist.
3. **Independent Vector Storage Engine**: Memory embeds a zero-dependency, local-file instance of Qdrant in `Vault/system/knowledge_base/`, eliminating the need for external Docker containers or cloud databases.

##### Primary Inputs & Outputs
* **Inputs**: Image jobs from Message Broker's `ocr_extraction` stream, embedding jobs from `embedding_memory` stream, and search queries from the Engine.
* **Outputs**: Clean extracted text published to `ocr_summarization` stream, disk wipe commands (`POST /delete`) to Operator, and ranked semantic citation snippets returned via `POST /knowledge-base/search`.

#### 2. Code Structure & Directory Manifest
```
Memory/
├── screenshot_processing/             # Computer vision & OCR extraction engine
│   ├── worker.py                      # Async screenshot worker pool & broker job dispatcher
│   ├── data_extractor.py              # OpenCV matrix math, grayscale extraction, & Tesseract OCR
│   ├── image_comparison.py           # Perceptual diffing & Redis-backed frame history comparison
│   ├── region_comparator.py          # UI bounding box & text similarity analysis
│   └── uia_extractor.py               # Native OS Accessibility & UI Automation bridge
├── knowledge_base/                    # Local Qdrant vector database & collection lifecycle
│   ├── worker.py                      # Background worker ingesting embedding jobs into Qdrant
│   ├── qdrant_store.py                # Embedded Qdrant client, schema indexing, & vector search
│   ├── broker_client.py               # Message Broker polling client for 'embedding_memory' stream
│   ├── storage.py                     # Collection discovery, date-range resolution, & disk metrics
│   ├── protection.py                  # Collection retention enforcement & automated pruning
│   └── encryption.py                  # Optional AES encryption helpers for vector payloads on disk
├── app.py                             # FastAPI application entry point, lifecycle, & HTTP routes
└── config.py                          # Service discovery (services.json), Vault sync, & server ports
```

#### 3. Key Capabilities & Code Architecture
1. **Perceptual Matrix Diffing (`image_comparison.py`)**: Computes normalized absolute difference across downsampled grayscale image matrices:
   $$\Delta = \frac{\sum |I_t - I_{t-1}|}{W \times H \times 255}$$
   If $\Delta < 0.008$ (less than 0.8% visual difference), the frame is dropped immediately, eliminating >70% of redundant OCR compute.
2. **Multi-Threaded Tesseract OCR Pipeline (`data_extractor.py`)**: Slices high-resolution displays into spatial tiles and processes OCR text extraction concurrently across CPU cores.
3. **Ephemeral Disk Cleanup**: Once text extraction finishes, Memory immediately invokes Operator's `POST /delete` endpoint to unlink the PNG from disk.
4. **Embedded Date-Partitioned Qdrant Store (`qdrant_store.py`)**: Manages partitioned HNSW vector collections in `Vault/system/knowledge_base/` for sub-millisecond similarity search.
5. **Collection Retention & Pruning (`protection.py`)**: Enforces retention policies (`Never auto delete`, `7 days`, `30 days`) and purges expired partitions.

#### 4. Operations & Developer Guide
* **Matrix Diffing**: Discards screens below 0.8% difference threshold automatically.
* **Search API**: Query `POST /knowledge-base/search` with JSON `{"query": "...", "limit": 3}` to retrieve citations.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="34-operator-module-native-rust-screen-capture"></a>
### 3.4 Operator Module (Native Rust Screen Capture)

> 📖 **Subsystem Codebase Reference**: For native Rust compilation flags, low-overhead xcap bindings, and platform-specific OS screen capture permissions (macOS CoreGraphics, Windows GDI, Linux X11/Wayland), read the **[Dedicated Operator README (Operator/README.md)](Operator/README.md)** or view the **[Operator Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Operator)**.

* **Dedicated Readme**: [`Operator/README.md`](Operator/README.md) • [Operator Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Operator)
* **Default Port**: `9003` (HTTP)
* **Technology**: Rust (2021 Edition), Tokio Async Runtime, Axum HTTP Server, `xcap` Native Screen Capture Engine

#### 1. Core Purpose & Architectural Role
The **Operator** module is the eyes and native hands of MIRA. Written entirely in high-performance **Rust**, it quietly watches your screen at your chosen cadence (e.g., every 10 seconds), checks your active application against your personal privacy blacklist, and takes a high-resolution screenshot in under 10 milliseconds. If you are using a sensitive app like a password manager or banking site, it immediately cancels capture in RAM—nothing is ever saved to disk.

##### Why is it a Decoupled Microservice?
1. **Low-Level Native Performance**: Python is too heavy and slow for continuous background screen capture. By writing Operator in Rust with Tokio and `xcap`, desktop capture runs with under 15MB of RAM and zero perceptible CPU lag.
2. **Zero-Disk Hardware Privacy**: The foreground window title and executable name are verified directly in RAM before any capture occurs. If blacklisted, the frame capture is aborted immediately, guaranteeing zero disk footprint.
3. **Decoupled Job Dispatching**: Operator doesn't wait for OCR to finish; it drops the job into Message Broker's Redis stream and immediately returns to its sleep cadence.

##### Primary Inputs & Outputs
* **Inputs**: REST commands from Client (`POST /start`, `POST /stop`, `POST /interval`), dynamic blacklist configurations from Vault, and ephemeral image deletion requests from Memory (`POST /delete`).
* **Outputs**: Raw ephemeral screenshot files in `Operator/screenshots/`, job events published to Message Broker (`ocr_extraction`), and discovered installed application lists (`GET /apps`).

#### 2. Code Structure & Directory Manifest
```
Operator/
├── src/
│   ├── main.rs                   # Process entry point, service bootstrapping, & Axum listener
│   ├── api.rs                    # REST route definitions, request handlers, & state extraction
│   ├── capture.rs                # Native screen capture logic (xcap, GDI, multi-monitor)
│   ├── flow.rs                   # CaptureManager loop, timer scheduler, & capture lifecycle
│   ├── permissions.rs            # Application blacklist/whitelist verification & cache
│   ├── app_discovery.rs          # Cross-platform installed application scanning & icon resolution
│   ├── broker_client.rs          # HTTP client publishing capture jobs to Message Broker
│   ├── microphone.rs             # Microphone hardware capture state & auto-start manager
│   ├── local_state.rs            # Persisted local capture interval & execution state
│   ├── config.rs                 # Dynamic service discovery (services.json) & Vault sync
│   └── vault_logger.rs           # Asynchronous logger dispatching audit events to Vault
├── screenshots/                  # Ephemeral directory for in-flight captured PNG frames
├── operator_state.json           # Cached local interval and runtime configuration
├── Cargo.toml                    # Rust crate definition and dependencies
└── Cargo.lock                    # Locked dependency graph
```

#### 3. Key Capabilities & Code Architecture
1. **Native Hardware Screen Capture (`src/capture.rs`)**: High-speed, non-intrusive desktop frame capture using `xcap` and native Windows GDI/DirectX handles (`windows-sys`), achieving sub-10ms capture cycles with minimal CPU overhead.
2. **Active Window & Process Inspection (`src/permissions.rs`)**: Inspects foreground process ID, executable name, and window title across macOS, Windows, and Linux.
3. **Application Privacy Guard (`src/permissions.rs`)**: Enforces per-application capture permissions stored in Vault. If the active application is blacklisted (e.g. password manager, banking portal), the capture loop immediately drops the frame before it touches disk.
4. **Installed Application Discovery (`src/app_discovery.rs`)**: Scans system registries and manifests (`/Applications`, Windows Registry, `.desktop` files) to compile an exhaustive software catalog synchronized with Vault.
5. **Asynchronous Stream Dispatch (`src/broker_client.rs`)**: Saves captured frames to `Operator/screenshots/` and dispatches structured jobs (`job_id`, `app_name`, `image_path`) directly to Message Broker's `ocr_extraction` stream.
6. **Hardware Microphone Management (`src/microphone.rs`)**: Tracks global microphone capture flags and auto-start preferences.

#### 4. Operations & User Guide
* **Permissions**: macOS requires Screen Recording permission under **System Settings > Privacy & Security > Screen Recording**.
* **Blacklisting**: Blacklisted processes are dropped in RAM before capturing pixels.
* **Control APIs**: `GET /status`, `POST /start`, `POST /stop`, `POST /interval`, `POST /delete`, `GET /apps`.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="35-vault-module-encrypted-secrets--authority"></a>
### 3.5 Vault Module (Encrypted Secrets & Authority)

> 📖 **Subsystem Codebase Reference**: For SQLite database schemas, PyNaCl authenticated encryption mechanics, and OS hardware keyring integrations, read the **[Dedicated Vault README (Vault/README.md)](Vault/README.md)** or view the **[Vault Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Vault)**.

* **Dedicated Readme**: [`Vault/README.md`](Vault/README.md) • [Vault Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Vault)
* **Default Port**: `9001` (HTTP)
* **Technology**: Python 3.11, FastAPI, SQLite 3, PyNaCl (`SecretBox` / `XSalsa20-Poly1305`), OS Keyring (`keyring`)

#### 1. Core Purpose & Architectural Role
The **Vault** module is the encrypted digital safe and security authority of MIRA. It is responsible for protecting all your sensitive credentials (like Gemini and Groq API keys), your chat history, your encrypted User Model and persona directives, and your operational audit logs. Everything is sealed using military-grade authenticated encryption unlocked only by your computer's native hardware keychain (Apple Keychain, Windows Credential Manager, or Linux SecretService).

##### Why is it a Decoupled Microservice?
1. **Centralized Trust Boundary**: By confining all secret management and database encryption logic to a single dedicated microservice, no other service ever touches raw encryption keys or SQLite database files directly.
2. **Hardware Keyring Isolation**: Vault is the only process that speaks to the operating system's hardware credential store, eliminating duplicate key derivation logic.
3. **Zero-Downtime Hot Reloading**: When you update settings in the UI, Vault saves the encrypted record and broadcasts a `config_sync` event over Redis Streams, prompting other services to reload in memory without restarting.

##### Primary Inputs & Outputs
* **Inputs**: Plaintext configurations, API keys, chat transcripts, and audit log events sent over loopback REST (`127.0.0.1:9001`).
* **Outputs**: Authenticated encrypted records sealed in `Vault/system/vault.db` and `audit_logs.db`, decrypted profile settings served to authorized local processes, and `config_sync` reload notifications published to Redis Streams.

#### 2. Code Structure & Directory Manifest
```
Vault/
├── api.py                    # Comprehensive REST route implementations & Pydantic models
├── app.py                    # FastAPI application initialization & Uvicorn startup
├── config.py                 # Service discovery (services.json), directory roots, & defaults
├── config_storage.py         # Encrypted SQLite storage engine & migration controllers
├── crypto.py                 # PyNaCl SecretBox wrapper, keyring key retrieval, & hashing
├── log_manager.py            # Encrypted audit log management & retention pruning engine
├── requirements.txt          # Python package requirements
├── schema.sql                # SQLite database schema definitions
└── system/                   # Encrypted local storage directory (auto-created)
    ├── vault.db              # Encrypted SQLite database file
    ├── audit_logs.db         # Encrypted audit logs database
    └── knowledge_base/       # Root storage path for Qdrant vector partitions
```

#### 3. Key Capabilities & Code Architecture
1. **Hardware-Backed Master Key Derivation (`crypto.py`)**: Integrates with the host OS credential store (`keyring` library targeting Apple Keychain, Windows Credential Manager, or Linux SecretService) to retrieve or generate a cryptographically secure 32-byte master key.
2. **Authenticated Symmetric Encryption (`crypto.py`)**: Seals all database records using **PyNaCl** SecretBox (XSalsa20 stream cipher + Poly1305 MAC) with unique 24-byte nonces.
3. **Configuration Authority (`config_storage.py`)**: Single source of truth serving verified settings for `operator`, `logs`, `message_broker`, `ai_configs`, and `ai_priorities`.
4. **Encrypted Database Storage (`system/vault.db`)**: Houses user profiles, AI credentials, application permission registries, multi-session chat histories, and daily briefings.
5. **Encrypted Audit Logging (`log_manager.py` / `system/audit_logs.db`)**: Ingests, encrypts, and indexes operational diagnostic events from all microservices, enforcing automatic log retention pruning.
6. **Hot Config Event Broadcast**: Dispatches `config_sync` notifications to Message Broker whenever configurations change to trigger zero-downtime hot reloads.

#### 4. Operations & Developer Guide
* **Master Key Derivation**: At boot, `crypto.py` queries the host OS hardware credential store via `keyring`. If no key exists, it generates a cryptographically secure 32-byte key using `os.urandom(32)` and persists it directly in the hardware enclave.
* **PyNaCl SecretBox**: Encrypts every record using **XSalsa20-Poly1305** with unique 24-byte nonces. Tampered records cause authentication failures upon decryption.
* **Hot-Reload Sync**: Whenever settings change, Vault publishes a `config_sync` event to Redis Streams. Sibling services reload in memory within milliseconds.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="36-message-broker-module-redis-streams-fabric"></a>
### 3.6 Message Broker Module (Redis Streams Fabric)

> 📖 **Subsystem Codebase Reference**: For consumer group configuration mappings, stream schemas, and Pending Entries List (PEL) reclamation logic, read the **[Dedicated Message Broker README (Message_Broker/README.md)](Message_Broker/README.md)** or view the **[Message Broker Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Message_Broker)**.

* **Dedicated Readme**: [`Message_Broker/README.md`](Message_Broker/README.md) • [Message Broker Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Message_Broker)
* **Default Port**: `9002` (HTTP) & Port `6379` (Redis)
* **Technology**: Python 3.11, FastAPI, Redis Streams, Uvicorn

#### 1. Core Purpose & Architectural Role
The **Message Broker** is the central nervous system and event highway of MIRA. In an ecosystem where multiple programs run simultaneously (screen capture, OCR reading, vector storage, and AI chat), the Message Broker connects them all using Redis Streams. It acts as a reliable buffer, ensuring that when the Operator captures screens quickly, slower background processes (like OCR or AI summaries) can process jobs at their own pace without crashing or dropping data.

##### Why is it a Decoupled Microservice?
1. **Asynchronous Load Buffering**: Screen capture is extremely fast (<10ms), while OCR takes 200–500ms. The Broker buffers in-flight jobs in Redis Streams so fast producers never overwhelm downstream workers.
2. **At-Least-Once Delivery & Crash Recovery**: By using Redis Consumer Groups and the Pending Entries List (PEL), if an OCR worker crashes while processing a frame, surviving workers immediately claim the unacknowledged job and complete it.
3. **Decoupled REST Interface**: Wraps low-level Redis socket calls behind standard HTTP endpoints (`POST /jobs`, `GET /jobs`), allowing services written in Rust, Python, or TypeScript to communicate effortlessly.

##### Primary Inputs & Outputs
* **Inputs**: Event payloads pushed by Operator (`ocr_extraction`), Memory (`ocr_summarization`), Engine (`embedding_memory`), and Vault (`config_sync`).
* **Outputs**: Partitioned job streams read by consumer worker groups via `XREADGROUP`, acknowledgment confirmations via `XACK`, and live queue telemetry returned to the Client dashboard.

#### 2. Code Structure & Directory Manifest
```
Message_Broker/
├── api.py                    # REST route definitions, request validation, & response handlers
├── app.py                    # FastAPI application setup, lifecycle manager, & Uvicorn listener
├── config.py                 # Redis connection parameters, port discovery, & service URLs
├── consumer_group_manager.py # Automated consumer group bootstrapping & offset management
├── consumer_groups.json      # Stream key to consumer group mapping definitions
├── redis_client.py           # Thread-safe Redis connection pool wrapper
├── redis_service.py          # Redis Streams low-level operations (XADD, XREADGROUP, XACK, PEL)
├── requirements.txt          # Python package requirements
└── vault_logger.py           # Logging forwarder reporting broker health to Vault audit logs
```

#### 3. Key Capabilities & Code Architecture
1. **Redis Streams Event Fabric (`redis_service.py`)**: Wraps Redis Streams (`XADD`, `XREADGROUP`, `XACK`, `XDEL`) behind high-throughput FastAPI endpoints, isolating fast producers from heavy consumers.
2. **At-Least-Once Delivery**: Employs persistent consumer groups with Pending Entries List (PEL) tracking to guarantee no capture or intelligence event is dropped if a worker crashes.
3. **Stream Partitioning (`consumer_groups.json`)**: Manages dedicated stream pipelines (`ocr_extraction`, `ocr_summarization`, `embedding_memory`, `config_sync`).
4. **Queue Telemetry & Maintenance (`api.py`)**: Exposes live queue depth metrics, active worker counts, message PEL inspectors, stream cleaning, and queue formatting.
5. **Transient In-Memory Comparison Cache (`redis_service.py`)**: Maintains fast key-value caches for recent image difference matrices and active chat session states.

#### 4. Operations & Developer Guide
* **Topic Streams**:
  - `ocr_extraction`: Operator -> Memory OCR workers.
  - `ocr_summarization`: Memory -> Engine summarizer worker.
  - `embedding_memory`: Engine -> Memory Qdrant ingester.
  - `config_sync`: Vault -> All listening services.
* **Telemetry & Maintenance**: Monitor stream health via `GET /redis/consumer-groups`. Purge queues during development with `POST /redis/flush`.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="37-scripts--orchestration-toolkit"></a>
### 3.7 Scripts & Orchestration Toolkit

> 📖 **Subsystem Codebase Reference**: For multi-service supervisor mechanics, dynamic socket allocation algorithms, and cross-platform native compilation scripts, read the **[Dedicated Scripts README (scripts/README.md)](scripts/README.md)** or view the **[Scripts Source Directory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/scripts)**.

* **Dedicated Readme**: [`scripts/README.md`](scripts/README.md) • [Scripts Source on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/scripts)
* **Location**: Root `scripts/` directory
* **Technology**: Python 3.11, `psutil`, `socket`, `subprocess`, Tauri CLI, Vite, Cargo

#### 1. Core Purpose & Architectural Role
The **Scripts** toolkit is the master control launchpad and multi-platform compiler of MIRA. Starting a distributed system with 6 microservices can be complicated; the Scripts toolkit makes it effortless by providing a single command (`python scripts/start.py`) that checks your computer for port conflicts, starts Redis, launches every background service in the right order, and opens the user interface. It also packages standalone desktop installers (`.exe`, `.dmg`, `.AppImage`) via `python scripts/build.py`.

##### Why is it a Decoupled Orchestration Layer?
1. **Zero-Configuration Dynamic Port Assignment**: If port `9001` or `9004` is already used by another app on your machine, `start.py` automatically finds free ports, writes them to `services.json`, and links all services together with zero manual editing.
2. **Deterministic Lifecycle & Clean Teardown**: Ensures that pressing `Ctrl+C` sends graceful termination signals to all child processes and process trees, leaving zero dangling background workers or orphaned Redis keys.
3. **Unified Multi-Platform Packaging**: A single command (`build.py`) orchestrates compiling Rust binaries, bundling the React frontend, and producing signed, native OS installers.

##### Primary Inputs & Outputs
* **Inputs**: Terminal launch flags (`--no-client`, `--prod`, `--stage-only`), system network socket status, and target OS architecture.
* **Outputs**: Dynamically generated `services.json`, synchronized `.env.local` frontend configuration, managed child processes, and compiled native desktop installer bundles.

#### 2. Code Structure & Directory Manifest
```
scripts/
├── start.py                  # Master lifecycle supervisor, port resolver, & process multiplexer
├── build.py                  # Cross-platform compiler, version bumper, & installer packager
├── services.json             # Dynamic service discovery endpoint registry
├── requirements.txt          # Dependencies for supervisor script (psutil, requests)
└── README.md                 # Master unified installation guide for all operating systems
```

#### 3. Key Capabilities & Code Architecture
1. **Master Lifecycle Supervisor (`scripts/start.py`)**: Auto-detects and launches local Redis instances, checks port availability on sockets `9001`–`9007`, automatically resolves port collisions by incrementing occupied ports, updates `services.json` and `.env.local`, boots microservices in strict dependency order with `/health` polling, multiplexes color-coded log streams, and terminates all child process trees on `Ctrl+C`.
2. **Dynamic Service Discovery Registry (`scripts/services.json`)**: Central JSON endpoint map loaded at boot by all services, completely eliminating hardcoded URLs.
3. **Cross-Platform Compilation & Packaging (`scripts/build.py`)**: Multi-target build orchestrator compiling Operator in Rust, building Client in Vite, staging microservices into Tauri resources, and packaging native desktop installers (Windows NSIS `.exe`, macOS `.dmg`/`.app`, Linux `.deb`/`.AppImage`).
4. **Atomic Version Synchronization (`scripts/build.py`)**: Queries (`-v`) and atomically bumps (`--set-version`) version strings across `tauri.conf.json`, `package.json`, `Client/Cargo.toml`, and `Operator/Cargo.toml`.

#### 4. Operations & Developer Guide
* **Starting the Ecosystem**: Run `python scripts/start.py`. The supervisor checks dependencies, boots Redis, starts services in order (`Vault` -> `Broker` -> `Engine` -> `Operator` -> `Memory` -> `Client`), and opens the dashboard in your browser.
* **Packaging Installers**: Run `python scripts/build.py` to compile native NSIS `.exe` installers for Windows, `.dmg` for macOS, or `.AppImage` for Linux.
* **Version Management**: Query version via `python scripts/build.py --get-version` or bump semantic version with `python scripts/build.py --bump-version patch`.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="4-inter-service-communication--network-topology"></a>
## 4. Inter-Service Communication & Network Topology

<a id="41-port-map--dynamic-allocation"></a>
### 4.1 Port Map & Dynamic Allocation
Every microservice binds to a default port defined in `scripts/services.json`. If a port conflict occurs on launch, `start.py` reallocates the port dynamically:

| Port | Service | Protocol | Key Endpoints | Incoming Callers |
| :---: | :--- | :---: | :--- | :--- |
| **`6379`** | **Redis Server** | `TCP` | Native Redis Streams commands (`XADD`, `XREADGROUP`, `XACK`) | Message Broker (9002) |
| **`9001`** | **Vault** | `HTTP` | `GET /config/{k}`, `GET /ai/configs`, `GET /user`, `POST /logs`, `GET /chats/sessions` | Client, Operator, Memory, Engine, Broker |
| **`9002`** | **Message Broker** | `HTTP` | `POST /jobs`, `GET /jobs`, `DELETE /jobs`, `GET /redis/consumer-groups` | Client, Operator, Memory, Engine, Vault |
| **`9003`** | **Operator** | `HTTP` | `GET /status`, `POST /start`, `POST /stop`, `POST /interval`, `POST /delete`, `GET /apps` | Client (9004), Memory (9006) |
| **`9004`** | **Client UI** | `HTTP / WS` | `GET /` (Webview GUI), `WS /` (Vite HMR) | User Browser, Native Tauri Webview |
| **`9006`** | **Memory** | `HTTP` | `GET /status`, `GET /knowledge-base`, `POST /knowledge-base/search`, `POST /extract` | Client (9004), Engine (9007) |
| **`9007`** | **Engine** | `HTTP / WS` | `WS /ws/chat`, `POST /chats/message`, `POST /voice/stt/transcribe`, `GET /daily_suggestions` | Client (9004) |

---

<a id="42-redis-streams-event-bus"></a>
### 4.2 Redis Streams Event Bus
The Message Broker decouples microservices across four dedicated stream keys:

```
[Operator: 9003] ──XADD──> ocr_extraction ──────────XREADGROUP──> [Memory Workers: 9006]
                                                                        │
                                                                (OCR Extraction)
                                                                        ▼
[Engine: 9007]   <──XREADGROUP── ocr_summarization <──XADD─────── [Memory Workers: 9006]
       │
 (LLM Summarization & Embeddings)
       ▼
[Engine: 9007]   ──XADD──> embedding_memory ────────XREADGROUP──> [Memory KB Workers: 9006]
                                                                        │
                                                                  (Qdrant Store)
```

| Stream Key | Consumer Group | Producer | Consumer | Payload Description |
| :--- | :--- | :--- | :--- | :--- |
| **`ocr_extraction`** | `CONSUMER_GROUP_OCR_EXTRACTION` | Operator | Memory | Raw screenshot jobs (`image_path`, `app_name`, `os`, `timestamp`). |
| **`ocr_summarization`** | `CONSUMER_GROUP_OCR_TEXT_SUMMARIZATION` | Memory | Engine | Extracted screen text and UI bounding-box region hierarchies. |
| **`embedding_memory`** | `CONSUMER_GROUP_EMBEDDING_MEMORY` | Engine | Memory | 1024-dimensional dense vectors and activity digests for Qdrant storage. |
| **`config_sync`** | Dynamic Subscriptions | Vault | All Modules | Hot configuration change events prompting in-memory setting reloads. |

---

<a id="43-real-time-websocket-channels"></a>
### 4.3 Real-Time WebSocket Channels
- **`WS http://localhost:9007/ws/chat`**: Bidirectional conversational channel between Client and Engine. Transmits user queries and streams token-by-token LLM completions with sub-second latency.
- **`WS http://localhost:9007/voice/stt/events`**: Real-time acoustic event stream broadcasting native OS microphone transcription results to connected UI components.
- **`WS http://localhost:9004/`**: Vite Hot Module Replacement (HMR) channel for instant frontend development updates.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="5-security-cryptography--privacy-blueprint"></a>
## 5. Security, Cryptography & Privacy Blueprint

```
┌────────────────────────────────────────────────────────┐
│             Native OS Hardware Keyring                 │
│  (macOS Keychain / Windows Credential / Linux Secret)  │
└──────────────────────────┬─────────────────────────────┘
                           │ master_key (32 bytes)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   PyNaCl SecretBox                     │
│               XSalsa20-Poly1305 Cipher                 │
└──────────────┬───────────────────────────▲─────────────┘
  Plaintext    │ Encrypt                   │ Decrypt
  Settings     ▼                           │ Ciphertext
┌──────────────────────────┐    ┌────────────────────────┐
│  nonce (24 bytes random) │    │  Poly1305 MAC Validate │
│  + XSalsa20 Ciphertext   │    │  (Tamper-Proof Check)  │
└──────────────┬───────────┘    └───────────▲────────────┘
               │                            │
               ▼                            │
┌───────────────────────────────────────────┴────────────┐
│         Encrypted SQLite Database (vault.db)           │
└────────────────────────────────────────────────────────┘
```

### 1. Hardware-Backed Key Derivation
- Master encryption keys are never stored on disk.
- Vault interacts with OS hardware credential stores (`keyring` in Python) to request the 32-byte master key securely stored in the platform enclave (Apple Keychain, Windows Credential Manager, Linux SecretService).

### 2. Authenticated Symmetric Encryption
- All secret payloads (API keys, chat session transcripts, user persona models) are sealed using **XSalsa20-Poly1305** symmetric encryption via `PyNaCl` (`nacl.secret.SecretBox`).
- Each record generates an independent 24-byte cryptographically secure random nonce. Any unauthorized tampering or corruption of the SQLite database files causes instant decryption rejection.

### 3. Application Privacy Blacklist & Boundary Guard
- The native Rust Operator verifies the current foreground process executable and window title against the encrypted blacklist stored in Vault.
- If an active window matches any blacklisted item (e.g. *1Password*, *Bitwarden*, *KeePass*, *Signal*, *Slack*, *Google Chrome Incognito*, or banking portals), screen capture is immediately aborted in RAM. **Zero bytes of pixels or text are written to disk.**

### 4. Ephemeral Transient Audio & Image Hygiene
- Raw screenshot files in `Operator/screenshots/` exist strictly for the transient duration of OCR extraction.
- Immediately upon completing text extraction, Memory dispatches an authenticated deletion request (`POST http://127.0.0.1:9003/delete`) to purge the image file permanently from disk.
- Audio input buffers are processed in volatile memory and never persisted as audio files.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="6-end-to-end-data-flow-pipelines"></a>
## 6. End-to-End Data Flow Pipelines

<a id="61-continuous-visual-perception-pipeline"></a>
### 6.1 Continuous Visual Perception Pipeline
```
1. Operator Capture Loop (Rust)
   ├── Polls active window name & checks Vault blacklist
   ├── Takes native desktop capture (<10ms)
   └── Publishes event to Redis stream 'ocr_extraction'
             │
             ▼
2. Memory Processing Worker (Python)
   ├── Reads frame via XREADGROUP
   ├── Performs OpenCV normalized matrix difference (Threshold: 0.008)
   │   ├── Difference < 0.008 -> Skip frame (Idle/Static screen)
   │   └── Difference >= 0.008 -> Multi-threaded Tesseract OCR
   ├── Dispatches POST http://127.0.0.1:9003/delete to wipe PNG from disk
   └── Publishes extracted text to Redis stream 'ocr_summarization'
             │
             ▼
3. Engine Summarizer & Vector Worker (Python)
   ├── Groups window activity into temporal batches
   ├── Generates concise semantic activity digests
   ├── Computes 1024-dimensional dense vectors (Qwen3-Embedding)
   └── Publishes vectors to Redis stream 'embedding_memory'
             │
             ▼
4. Memory Knowledge Base Worker (Python)
   ├── Reads embedding job via XREADGROUP
   ├── Persists vector & metadata to local Qdrant collection
   └── Acknowledges event via XACK
```

---

<a id="62-multi-turn-conversational-reasoning-pipeline"></a>
### 6.2 Multi-Turn Conversational Reasoning Pipeline
```
1. User Ingress (Client)
   ├── User speaks "Mira, what was the API endpoint we modified yesterday?"
   └── Client opens WS connection to Engine: ws://localhost:9007/ws/chat
             │
             ▼
2. Intent Classification & Retrieval (Engine LangGraph)
   ├── Decision Node classifies query as contextual recall
   ├── Vector search query dispatched to Memory: POST /knowledge-base/search
   ├── Context Minimization Gateway extracts top 2-3 relevant sentences
   └── History Node loads recent conversational context from Vault
             │
             ▼
3. Synthesis & Dynamic Failover (Engine)
   ├── Formulates compact prompt with user persona injected
   ├── Primary Provider: Google Gemini 2.5 Flash
   │   ├── Success -> Streams chunks to WebSocket
   │   └── HTTP 429 / Error -> Instant Failover to Groq LPU (Llama 3.3 70B)
   └── WebSocket streams tokens to Client UI in real time
             │
             ▼
4. Persistence & UI Render (Client & Vault)
   ├── Client renders Markdown with syntax-highlighted code blocks
   ├── Client TTS engine streams synthesized voice playback
   └── Complete transcript sealed in Vault SQLite database (vault.db)
```

---

<a id="63-proactive-daily-briefing-pipeline"></a>
### 6.3 Proactive Daily Briefing Pipeline
```
1. Morning Scheduler (Engine)
   ├── Daily suggestions background worker executes at morning interval
   ├── Aggregates past 24 hours of summarized activity from Vault
   └── Queries user persona model for tech stack and interest keywords
             │
             ▼
2. Contextual Enrichment & Synthesis
   ├── News Tool fetches curated tech headlines matching user stack
   ├── Weather Tool resolves local IP geolocation and forecasts
   └── LLM synthesizes executive agenda: continuity tasks & priorities
             │
             ▼
3. Delivery & Interaction (Client)
   ├── Saves daily agenda to Vault system storage
   ├── Renders interactive checklist in Morning Dashboard (/mira)
   └── User checks off completed tasks or adds custom items
```

---

<a id="64-zero-downtime-configuration-sync-pipeline"></a>
### 6.4 Zero-Downtime Configuration Sync Pipeline
```
1. User modifies settings in Client UI (/configurations)
   └── e.g. Pastes new Groq API key or toggles application blacklist
             │
             ▼
2. Client sends payload to Vault: POST /config/{category}
   ├── Vault encrypts data with PyNaCl (XSalsa20-Poly1305)
   ├── Updates encrypted records in SQLite (vault.db)
   └── Publishes 'config_sync' event to Redis stream
             │
             ▼
3. Sibling microservices listen on 'config_sync' topic
   ├── Engine reloads AI provider credentials in RAM
   ├── Operator reloads blacklisted executable names in RAM
   └── Changes take effect in under 50ms without restarting processes
```

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="7-master-technology-stack"></a>
## 7. Master Technology Stack

| Layer | Technology | Version | Purpose & Architectural Role |
| :--- | :--- | :---: | :--- |
| **Desktop Shell** | Tauri | `v2.0+` | Cross-platform desktop windowing, system tray integration, sub-50MB RAM. |
| **Frontend UI** | React | `19.0+` | Component rendering, state synchronization, concurrent transitions. |
| **Language (UI)** | TypeScript | `5.0+` | Type-safe API interfaces, event schemas, state management models. |
| **Styling** | TailwindCSS | `v4.0+` | High-performance CSS design system, glassmorphism, dark palette. |
| **Client State** | Zustand | `v5.0+` | Centralized state management for chat sessions, settings, and audio. |
| **Backend Framework** | FastAPI | `0.115+` | High-throughput asynchronous REST endpoints and WebSocket servers. |
| **Language (Backend)**| Python | `3.11+` | Core asynchronous microservices (`Engine`, `Memory`, `Vault`, `Broker`). |
| **Native Capture** | Rust | `2021` | Low-latency screen capture (`Operator`), `xcap` bindings, memory-safe. |
| **Event Streaming** | Redis Streams | `7.0+` | Decoupled event bus, consumer group load balancing, at-least-once delivery. |
| **Vector Database** | Qdrant | `1.12+` | Embedded local vector storage, HNSW cosine similarity search. |
| **Computer Vision** | OpenCV | `4.10+` | Normalized matrix frame diffing (`0.008` threshold), image grayscale. |
| **Text Recognition** | Tesseract OCR | `5.3+` | Multi-threaded optical character recognition across tiled display zones. |
| **Speech-to-Text** | Faster-Whisper | `1.0+` | Local on-device neural transcription powered by CTranslate2. |
| **Primary Cloud LLM**| Google Gemini | `2.5 Flash` | High-speed, large-context conversational reasoning and code generation. |
| **Fallback Cloud LLM** | Groq LPU | `Llama 3.3` | Ultra-fast open-weights inference (500+ tok/s) for automatic 429 failover. |
| **Cryptography** | PyNaCl | `1.5+` | Hardware-keyed authenticated symmetric encryption (XSalsa20-Poly1305). |
| **Relational Storage**| SQLite 3 | `3.45+` | Embedded encrypted databases (`vault.db`, `audit_logs.db`). |

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="8-unified-installation--quickstart"></a>
## 8. Unified Installation & Quickstart

### 8.1 System Prerequisites
- **Python**: Version `3.11` or higher.
- **Node.js**: Version `18.0` or higher (`pnpm` or `npm`).
- **Rust**: Version `1.75` or higher (`cargo` toolchain).
- **Redis Server**: Version `7.0` or higher (installed locally).
- **Tesseract OCR**: Installed and available in system `$PATH`.

### 8.2 Three-Step Quickstart
```bash
# 1. Clone the repository
git clone https://github.com/DhirajKarangale/Mira.git
cd Mira

# 2. Verify Redis is running
redis-cli ping   # Should return: PONG

# 3. Launch the complete ecosystem with a single command:
python3 scripts/start.py
# (On Windows): python scripts\start.py
```

### 8.3 Execution Modes & CLI Flags
| Command | Mode / Purpose |
| :--- | :--- |
| `python scripts/start.py` | Full ecosystem boot: launches Redis, boots 6 microservices, and opens the Client GUI in your browser. |
| `python scripts/start.py --no-client` | Headless backend boot: starts background services only (used when running the native Tauri desktop shell). |
| `python scripts/start.py --prod` | Production mode: disables FastAPI file auto-reload watchers for optimal runtime speed and lower memory. |
| `python scripts/build.py` | Multi-target compiler: builds the native Rust Operator, bundles the frontend, and packages desktop installers. |

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="9-comprehensive-end-user-guide--operations-manual"></a>
## 9. Comprehensive End-User Guide & Operations Manual

Welcome to MIRA! This user manual provides an exhaustive, step-by-step walkthrough of how to operate MIRA as your ambient digital companion, how to customize your personalized cognitive User Model, how to configure AI keys and privacy blacklists, and how to operate all features directly through the intuitive desktop GUI without touching source code or terminal commands.

---

<a id="91-the-mira-user-model--persona-customization-system"></a>
### 9.1 The MIRA User Model & Persona Customization System

<a id="911-core-philosophy--cognitive-grounding"></a>
#### 9.1.1 Core Philosophy & Cognitive Grounding

##### The Problem with Conventional Chatbots: Stateless Amnesia
Traditional AI chatbots (such as raw ChatGPT, Claude, or web interfaces) treat you as an anonymous stranger in every fresh conversation. If you are a senior systems engineer who writes Rust and Python, you are constantly forced to repeat the same repetitive preamble:
> *"I am a senior backend developer. Do not give me beginner explanations. Write the solution in Rust using Tokio. Use strict types. Never apologize..."*

If you forget to include this prompt boilerplate, the AI defaults to generic, junior-level pseudo-code filled with conversational pleasantries and superficial explanations.

##### The MIRA Solution: A Persistent Cognitive Persona
MIRA solves this fundamental flaw through its persistent, hardware-encrypted **User Model**. Your User Model is an ambient cognitive profile that represents *who you are*, *what you build*, *how you think*, and *how you prefer to communicate*. 

Rather than residing in temporary browser cookies or unencrypted text files, your User Model is cryptographically sealed in MIRA's local Vault using hardware-backed encryption. Every cognitive reasoning node in LangGraph, every proactive morning agenda suggestion, and every code snippet synthesized by MIRA is dynamically anchored to this profile.

```
┌────────────────────────────────────────────────────────────────────────┐
│  👤 User Profile & Persona Model (/user)                               │
├────────────────────────────────────────────────────────────────────────┤
│  Full Name:             [ Vedang Sunil Joshi                         ] │
│  Professional Title:    [ Senior Distributed Systems & AI Architect  ] │
│  Primary Tech Stack:    [ Rust, Python 3.11, React 19, Redis Streams  ] │
│  Communication Style:   [ Concise, Code-Centric, Highly Technical    ▼] │
├────────────────────────────────────────────────────────────────────────┤
│  Personal Prompt Directives & Custom Guardrails:                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ • Always format code snippets with strict TypeScript types.      │  │
│  │ • Favor functional immutability and memory-safe patterns.        │  │
│  │ • Never apologize in responses; provide direct technical answers.│  │
│  │ • When explaining system architectures, include ASCII diagrams.  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                            [ Save Encrypted Profile ]  │
└────────────────────────────────────────────────────────────────────────┘
```

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="912-the-five-core-dimensions-in-granular-detail"></a>
#### 9.1.2 The Five Core Dimensions in Granular Detail

The MIRA User Model organizes your digital persona across five foundational dimensions:

##### 1. Identity, Locale & Temporal Anchoring
* **Full Name & Preferred Nickname**: Defines how MIRA addresses you across interfaces (e.g. *"Good morning, Vedang"* on the Morning Cockpit or in spoken ambient voice greetings).
* **Timezone & Locale (`e.g., Asia/Kolkata, UTC+05:30`)**: Informs MIRA's temporal reasoning engine (`Engine/chat/workflow/timezone_helper.py`). When you ask *"What was I reviewing yesterday afternoon?"*, MIRA calculates exact local timestamp boundaries rather than ambiguous UTC offsets.
* **Proactive Briefing Schedule**: Controls when the morning suggestions background worker executes, ensuring your daily agenda is fresh and waiting when your workday begins.

##### 2. Professional Role & Seniority Calibration
* **Seniority Spectrum**: Calibrates explanation depth across the entire engineering career spectrum:
  - *Junior Developer*: MIRA provides foundational explanations, breaks down complex syntax, explains standard library methods, and highlights common beginner pitfalls.
  - *Mid-Level Engineer*: MIRA focuses on idiomatic implementations, unit testing strategies, and clean code refactoring.
  - *Senior Engineer*: MIRA skips introductory concepts entirely, focusing on concurrency hazards, zero-copy optimizations, performance benchmarks, and edge cases.
  - *Staff / Principal Architect*: MIRA elevates explanations to distributed system invariants, fault domains, blast radius mitigation, CAP theorem trade-offs, and backward compatibility.
  - *Non-Technical Executive / Product Manager*: MIRA translates technical details into business impacts, roadmap milestones, cost estimates, and risk assessments.

##### 3. Primary Tech Stack & Tooling Ecosystem
* **Explicit Tool Catalog**: Catalogs your active programming languages, frameworks, databases, and libraries (e.g., `Rust (2021), Python 3.11, React 19, TypeScript, Redis Streams, Qdrant, FastAPI, Tokio, TailwindCSS v4`).
* **Ecosystem Grounding**: When you ask an open-ended technical question like *"How do I implement rate limiting?"*, MIRA does not output generic pseudo-code or irrelevant frameworks (like Java Spring or PHP). It immediately produces production-grade code using your exact declared stack (e.g., a Redis Token Bucket in Python `asyncio` or Rust `tokio`).

##### 4. Cognitive Workstyle & Communication Tone
MIRA features four built-in communication modes that govern response formatting, conversational density, and pedagogical approach:
* **Mode 1: Concise & Code-Centric**: Zero conversational filler, no polite introductions, immediate production-ready code blocks with essential inline comments. Ideal for fast-paced development.
* **Mode 2: Pedagogical & Explanatory**: Structured step-by-step breakdown of first principles, comparisons between alternative patterns, and links to official documentation. Ideal for learning new libraries.
* **Mode 3: System Architect**: Focuses on microservice boundaries, state machines, sequence diagrams, failure isolation, and API schemas.
* **Mode 4: Academic & Rigorous**: Focuses on algorithmic complexity ($O(n)$ time/space bounds), mathematical proofs, formal state transitions, and memory invariant verification.

##### 5. Personal Prompt Directives & Custom Guardrails
* **Non-Negotiable System Directives**: A multi-line custom instructions textarea where you can enforce project-specific rules for all AI interactions.
* **Directives Rule Categories**:
  - *Code Conventions*: *"Always write strict TypeScript types; never use `any`"*, *"Favor functional immutability and pure functions"*.
  - *Architecture Rules*: *"Never use global mutable state; pass dependencies explicitly via dependency injection"*.
  - *Communication Rules*: *"Never apologize; answer directly and constructively without conversational filler"*.
  - *Dependency Rules*: *"Avoid external npm packages if the browser Web API has native support"*.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="913-cognitive-tone--communication-mode-comparison"></a>
#### 9.1.3 Cognitive Tone & Communication Mode Comparison

To illustrate how your chosen **Communication Style** fundamentally transforms MIRA's reasoning, examine how the four built-in modes respond to the exact same technical prompt:

> **User Prompt**: *"How should I implement exponential backoff with jitter for HTTP requests in Python?"*

| Mode | Response Structure & Tone | Sample Output Excerpt |
| :--- | :--- | :--- |
| **Concise & Code-Centric** | Immediate code snippet, zero conversational filler, inline comments only. | ```python<br>import asyncio, random<br>async def request_with_backoff(coro_fn, max_retries=5, base=0.5, cap=10.0):<br>    for attempt in range(max_retries):<br>        try:<br>            return await coro_fn()<br>        except Exception as e:<br>            if attempt == max_retries - 1: raise<br>            # Full jitter: random sleep between 0 and min(cap, base * 2^attempt)<br>            sleep = random.uniform(0, min(cap, base * (2 ** attempt)))<br>            await asyncio.sleep(sleep)<br>``` |
| **Pedagogical & Explanatory** | Conceptual explanation first, followed by formula breakdown, code, and common pitfalls. | **Why Jitter Matters**:<br>Without jitter, retrying clients synchronize their retry attempts during an outage, creating a 'thundering herd' that overwhelms recovering servers.<br><br>**Algorithm (Full Jitter)**:<br>$$t_{\text{sleep}} = \text{Uniform}(0, \min(T_{\text{cap}}, T_{\text{base}} \times 2^{\text{attempt}}))$$<br><br>Here is the implementation with `httpx`... |
| **System Architect** | Emphasizes failure domains, circuit breakers, timeout budgets, and distributed tracing. | **Resilience Architecture**:<br>1. **Blast Radius**: Exponential backoff alone cannot prevent cascading failure. Pair backoff with a **Circuit Breaker** (e.g. 5 consecutive failures trips breaker).<br>2. **Global Timeout Budget**: Enforce a deadline propagation header (`X-Request-Timeout`) so downstreams do not retry expired user operations.<br><br>```mermaid<br>sequenceDiagram<br>  Client->>Server: HTTP GET /api/v1<br>  Server-->>Client: 503 Service Unavailable<br>  Client->>Client: Sleep backoff + jitter<br>  Client->>Server: Retry GET /api/v1<br>``` |
| **Academic & Rigorous** | Analyzes queuing theory, packet collision models, Poisson distributions, and algorithmic complexity. | **Formal Invariant Analysis**:<br>Let $S_k$ denote the random backoff duration at retry step $k \in \{0, 1, \dots, N-1\}$. Under the Full Jitter model described by *Decorrelated Jitter Strategies (Vogel, 2015)*:<br>$$\mathbb{E}[S_k] = \frac{1}{2} \min(C, B \cdot 2^k)$$<br>This bounds the expected network contention to $O(1)$ in the limit as $k \to \infty$ for $B \cdot 2^k \ge C$. |

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="914-cryptographic-storage--zero-knowledge-architecture"></a>
#### 9.1.4 Cryptographic Storage & Zero-Knowledge Architecture

MIRA treats your identity, job title, and personal directives with the highest level of cryptographic privacy:

```
[User edits Profile on UI] 
          │
          ▼
[Client sends POST /user to Vault: 127.0.0.1:9001]
          │
          ▼
[Vault queries Hardware Keyring for 32-byte master key]
(macOS Keychain / Windows Credential Manager / Linux SecretService)
          │
          ▼
[PyNaCl SecretBox: Generates 24-byte random nonce]
          │
          ▼
[XSalsa20-Poly1305 seals profile into authenticated ciphertext]
          │
          ▼
[Written to SQLite: Vault/system/vault.db -> users table]
(Zero plaintext bytes touch the hard drive!)
```

##### Security Guarantees:
1. **Zero-Plaintext Disk Storage**: The `users` table in `Vault/system/vault.db` contains only encrypted blobs and 24-byte nonces. Opening the SQLite database in an external browser reveals pure binary noise.
2. **Hardware-Backed Key Derivation**: The master 32-byte symmetric key is never saved in `.env` files or hardcoded in scripts. It is retrieved dynamically from your operating system's hardware credential store via Python's `keyring` library.
3. **Tamper Detection (Poly1305 MAC)**: Every ciphertext includes a 16-byte Poly1305 message authentication code. If an attacker or corrupt sector alters even a single bit of the stored ciphertext, decryption fails with an authentication error rather than returning corrupt data.
4. **Volatile Memory Isolation**: Profile records are decrypted strictly into volatile RAM when serving authorized loopback requests (`GET http://127.0.0.1:9001/user`), never written to disk unencrypted, and never logged in plain text.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="915-langgraph-cognitive-runtime-injection-pipeline"></a>
#### 9.1.5 LangGraph Cognitive Runtime Injection Pipeline

How does your User Model actually influence MIRA's reasoning? The diagram below traces the execution path through the LangGraph cognitive state graph (`Engine/chat/workflow/`):

```
User Query: "How do I build an event worker?"
                       │
                       ▼
           [Engine: app.py /ws/chat]
                       │
                       ▼
         [chat/workflow/graph.py boots Graph]
                       │
                       ▼
           [chat/workflow/decision_node.py]
    ├── Fetches encrypted profile: GET http://127.0.0.1:9001/user
    ├── Decrypts persona in RAM: [Role: Senior Systems Architect, Stack: Rust/Tokio]
    └── Classifies intent: Code Architecture (Routes to synthesis graph)
                       │
                       ▼
         [chat/workflow/user_activity_node.py]
    └── Queries Memory Qdrant store for relevant desktop citations
                       │
                       ▼
           [chat/workflow/history_node.py]
    └── Loads multi-turn conversation context from Vault
                       │
                       ▼
          [chat/workflow/synthesis_node.py]
    ├── Prepend Dynamic System Prompt Context:
    │   ┌────────────────────────────────────────────────────────┐
    │   │ [SYSTEM: COGNITIVE USER PERSONA]                       │
    │   │ User: Vedang Sunil Joshi                               │
    │   │ Role: Senior Distributed Systems & AI Architect        │
    │   │ Tech Stack: Rust, Python 3.11, React 19, Redis Streams │
    │   │ Tone: Concise, Code-Centric, Highly Technical          │
    │   │ Directives:                                            │
    │   │ - Always format code snippets with strict types.       │
    │   │ - Favor functional immutability and memory safety.     │
    │   │ - Never apologize; provide direct technical answers.   │
    │   └────────────────────────────────────────────────────────┘
    ├── Primary LLM: Google Gemini 2.5 Flash (or Groq LPU failover)
    └── Streams tokens over WebSocket directly to Client UI!
```

##### Proactive Morning Suggestions Injection:
In addition to chat queries, your User Model is injected into `Engine/daily_suggestions/daily_suggestions.py`:
1. The scheduler queries your **Primary Tech Stack**.
2. It filters GNews technical RSS feeds to match your active technologies (e.g. *Rust, PyTorch, React*).
3. It cross-references yesterday's OCR activity with your role to generate realistic continuation goals.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="916-step-by-step-ui-guide-configuring-your-persona"></a>
#### 9.1.6 Step-by-Step UI Guide: Configuring Your Persona

Configuring your User Model is completely visual and takes less than 60 seconds:

##### Step 1: Open the User Profile View
1. Launch the MIRA desktop app or navigate to **`http://localhost:9004`** in your browser.
2. In the left navigation sidebar, click the **`User Profile`** icon (or navigate directly to `/user`).

##### Step 2: Fill in Your Identity & Professional Title
* **Full Name**: Enter your name or preferred nickname (e.g., `Vedang Joshi`).
* **Professional Title**: Enter your current engineering role and specialization (e.g., `Senior Distributed Systems & AI Engineer` or `Frontend UI Architect`).

##### Step 3: Define Your Primary Tech Stack
* In the **Primary Tech Stack** field, list the core languages, frameworks, and databases you use daily, separated by commas:
  ```
  Rust, Python 3.11, React 19, TypeScript, Redis Streams, Qdrant, TailwindCSS v4, Vite 8
  ```

##### Step 4: Choose Your Communication Style
* Open the **Communication Style** dropdown and select the mode that matches your workstyle:
  - Select **`Concise & Code-Centric`** if you want fast, direct code with zero conversational fluff.
  - Select **`Pedagogical & Explanatory`** if you prefer thorough step-by-step learning.
  - Select **`System Architect`** if you want high-level diagrams, sequence flows, and system boundaries.
  - Select **`Academic & Rigorous`** if you need mathematical proofs and algorithmic analysis.

##### Step 5: Add Personal Prompt Directives
In the **Personal Prompt Directives** multi-line textarea, add specific rules you want MIRA to always honor:
```
• Always format code snippets with strict TypeScript types.
• Favor functional immutability and memory-safe patterns.
• Never apologize in responses; provide direct technical answers.
• When explaining system architectures, include ASCII diagrams.
```

##### Step 6: Save & Verify Hot-Reloading
1. Click the blue **`Save Encrypted Profile`** button at the bottom of the card.
2. A green confirmation badge (**"Encrypted & Synchronized"**) appears.
3. Behind the scenes: Vault seals the profile into `vault.db` and emits a `config_sync` event over Redis Streams. The Engine reloads your persona in RAM in under 50ms without restarting!

##### Step 7: Test Your Model in Action
1. Click **`Chats`** in the left sidebar to open the chat interface.
2. Submit an open-ended technical query, such as: *"Write an asynchronous worker queue."*
3. Notice how MIRA immediately writes the code using your declared tech stack (e.g. Python `asyncio` or Rust `tokio`), uses your chosen communication style, and honors all your custom directives without you having to re-prompt!

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="917-ready-to-use-developer-persona-templates"></a>
#### 9.1.7 Ready-to-Use Developer Persona Templates

You can copy and adapt any of these ready-to-use developer persona templates directly into your `/user` configuration:

##### Template 1: Senior Systems & Distributed Backend Architect
* **Full Name**: `Alex Chen`
* **Professional Title**: `Principal Distributed Systems Architect`
* **Primary Tech Stack**: `Rust (2021), Tokio, Python 3.11, Redis Streams, gRPC, PostgreSQL, Docker`
* **Communication Style**: `Concise & Code-Centric`
* **Personal Directives**:
  ```
  • Prioritize zero-copy abstractions and lock-free concurrency primitives.
  • Always consider fault domains, backpressure, and network partition failure modes.
  • Provide idiomatic Rust implementations with explicit error handling using Result<T, E>.
  • Never use unwrap() or expect() in production code blocks.
  • Keep conversational pleasantries to zero.
  ```

##### Template 2: Fullstack React 19 & TypeScript UI Architect
* **Full Name**: `Maya Lin`
* **Professional Title**: `Staff Frontend & Design Systems Engineer`
* **Primary Tech Stack**: `React 19, TypeScript 5, TailwindCSS v4, Vite 8, Zustand, Next.js, TanStack Query`
* **Communication Style**: `Pedagogical & Explanatory`
* **Personal Directives**:
  ```
  • Use modern React 19 patterns (Server Actions, useActionState, useOptimistic).
  • All TypeScript interfaces must be strictly typed; never use 'any'.
  • Structure CSS using TailwindCSS v4 theme tokens and glassy dark-mode styles.
  • Ensure all UI components follow WCAG 2.1 AA accessibility guidelines.
  • Include a brief explanation of state synchronization trade-offs.
  ```

##### Template 3: AI / Machine Learning & Data Science Researcher
* **Full Name**: `Dr. Priya Sharma`
* **Professional Title**: `AI Research Scientist & MLOps Engineer`
* **Primary Tech Stack**: `Python 3.11, PyTorch, HuggingFace, Qdrant, Faster-Whisper, NumPy, Pandas, FastAPI`
* **Communication Style**: `Academic & Rigorous`
* **Personal Directives**:
  ```
  • State algorithmic time and space complexity using Big-O notation for all routines.
  • Format mathematical formulations using LaTeX syntax ($...$).
  • Cite foundational papers (e.g. Vaswani et al., 2017) when referencing architectural concepts.
  • Ensure PyTorch tensors specify explicit dtypes and devices (cuda/mps/cpu).
  ```

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="92-morning-dashboard--briefing-cockpit-mira"></a>
### 9.2 Morning Dashboard & Briefing Cockpit (`/mira`)

When you launch MIRA, you are greeted by the **Morning Cockpit** at `/mira`. It is engineered to give you an immediate, organized overview of your day.

```
┌────────────────────────────────────────────────────────────────────────┐
│  🌅 Good Morning, Vedang                     [All Microservices Green] │
├──────────────────────────────────┬─────────────────────────────────────┤
│  ⚡ Today's Priority Agenda      │  🌤️ Local Weather Forecast           │
│  • Finish Memory OCR diffing     │  24°C | Sunny | Humidity 45%        │
│  • Review Engine failover        │  Forecast: Pleasant throughout day  │
├──────────────────────────────────┼─────────────────────────────────────┤
│  ✅ Interactive Task Checklist   │  📰 Technical News Briefing         │
│  [x] Check Redis PEL queue depth │  • Google announces Gemini 2.0      │
│  [ ] Update API failover order   │  • Faster-Whisper v1.0 released     │
└──────────────────────────────────┴─────────────────────────────────────┘
```

#### What You See on the Dashboard:
1. **Welcome Header**: Displays a personalized greeting based on your profile name and the current time of day, alongside real-time system status indicators.
2. **Priority Agenda**: High-level continuation points synthesized automatically from what you worked on yesterday.
3. **Interactive Task Checklist**:
   - Each morning, MIRA analyzes open projects and proposes specific tasks.
   - **Checking Off Tasks**: Simply click the checkbox next to any task. Completed tasks are struck through and their completion state is persistently stored.
   - **Adding Tasks**: You can add your own custom tasks at any time using the quick-input bar at the bottom of the widget.
4. **Local Weather Forecast**: Shows your current temperature, humidity, wind conditions, and a multi-day forecast based on privacy-friendly IP geolocation.
5. **Curated News Feed**: Instant headlines of today's technical developments.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="93-multi-session-conversational-chat-chats"></a>
### 9.3 Multi-Session Conversational Chat (`/chats`)

The **Chat Hub** at `/chats` is where you have deep conversations with MIRA, ask questions about your past work, brainstorm code, or review historical project details.

```
┌─────────────────────┬──────────────────────────────────────────────────┐
│  [+ New Chat]       │  Session: Debugging Memory Pipeline              │
├─────────────────────┼──────────────────────────────────────────────────┤
│  • Memory Pipeline  │  User: What was the OCR diff threshold we set?   │
│  • API Failover (1) │                                                  │
│  • Project Planning │  MIRA: Based on your previous session in         │
│                     │  image_comparison.py, the threshold is 0.008.    │
│                     │  ```python                                       │
│                     │  DIFF_THRESHOLD = 0.008 # Normalized cv2 diff    │
│                     │  ```                                      [Copy] │
├─────────────────────┼──────────────────────────────────────────────────┤
│  [🗑️ Clear Old]     │  [Type a message or speak "Mira"... ]       [🎙️] │
└─────────────────────┴──────────────────────────────────────────────────┘
```

#### How to Use the Chat Interface:
1. **Starting a New Chat**: Click the **`+ New Chat`** button in the left sidebar to start a clean conversational thread.
2. **Switching Sessions**: Click any session title in the sidebar to jump between discussions. Each session keeps its own history.
3. **Unread Badges**: If an AI response finishes while you are viewing another page or session, an unread counter badge appears next to that chat in the sidebar.
4. **Sending Messages**:
   - **Keyboard**: Type your question in the bottom message bar and press `Enter` (or `Shift + Enter` for a new line).
   - **Voice**: Click the microphone icon in the input bar, or simply say the wake word *"Mira"* followed by your query.
5. **Real-Time Token Streaming**: MIRA streams its response token-by-token so you never have to wait for the whole answer to generate.
6. **Code Blocks & 1-Click Copy**: Any code generated by MIRA is rendered with syntax highlighting and includes a **`Copy`** button in the top-right corner of the code frame.
7. **Deleting Sessions**: Hover over any chat in the sidebar and click the trash can icon to permanently remove it from your encrypted storage.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="94-technical-news-reader--explorer-toolsnews"></a>
### 9.4 Technical News Reader & Explorer (`/tools/news`)

MIRA includes a dedicated technical news reader that keeps you updated without social media noise or algorithmic distraction.

#### Features & Usage:
1. **Accessing News**: You can view news headlines directly in the dashboard widget (`/mira`) or open the full reader at `/tools/news`.
2. **Topic Filters**: Switch between curated categories like **AI & Machine Learning**, **Software Engineering**, **Web Development**, and **Cybersecurity**.
3. **Article Cards**: Each card displays the headline, publishing source, published date, and a concise summary.
4. **Reading Articles**: Clicking the title or **`Read Full Story →`** opens the original article in your browser.
5. **Manual Refresh**: Click the circular refresh icon in the top header to pull the latest headlines immediately.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="95-daily-suggestions--task-management"></a>
### 9.5 Daily Suggestions & Task Management

Unlike passive tools, MIRA works in the background while you code, browse, or read. Every morning, it converts those observations into proactive suggestions:

1. **How It Works**:
   - In the background, the Operator captures desktop changes and Memory indexes them into local Qdrant vectors.
   - At the start of your day, the Engine reviews the most significant application workflows from the previous day.
   - It summarizes what you were doing (e.g., *"Refactoring Vault encryption tests"*) and outlines logical next steps.
2. **Acting on Suggestions**:
   - Review the bulleted continuation points in the **Daily Suggestions** widget.
   - Click any item to convert it into an active task in your checklist.
3. **Refreshing Suggestions**:
   - If you start a brand-new project mid-day, click **`Refresh Suggestions`** on the widget. The Engine will query the latest 4 hours of activity and generate a fresh agenda.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="96-managing-ai-providers--api-keys-zero-code-guide"></a>
### 9.6 Managing AI Providers & API Keys (Zero-Code Guide)

You can configure and switch between multiple AI providers and voice engines directly inside the user interface. **You never need to edit `.env` files or restart Python processes.**

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚙️ Settings > AI Configuration                                        │
├────────────────────────────────────────────────────────────────────────┤
│  Provider Priorities (Drag to Reorder):                                │
│  [ 1 ] 🟢 Google Gemini 2.5 Flash (Active Primary)         [::: Drag]  │
│  [ 2 ] 🟡 Groq LPU (Automatic Fallback on Rate Limit / 429)[::: Drag]  │
├────────────────────────────────────────────────────────────────────────┤
│  Google Gemini Settings:                                               │
│  API Key: [ AIzaSy********************************** ] [👁️ Unmask]    │
│  Model:   [ gemini-2.5-flash                                ▼ ]        │
│                                           [ Test Latency ] [ Save ]    │
├────────────────────────────────────────────────────────────────────────┤
│  Groq Settings:                                                        │
│  API Key: [ gsk_************************************ ] [👁️ Unmask]    │
│  Model:   [ llama-3.3-70b-versatile                         ▼ ]        │
│                                           [ Test Latency ] [ Save ]    │
└────────────────────────────────────────────────────────────────────────┘
```

<a id="961-google-gemini-setup"></a>
#### 9.6.1 Google Gemini Setup (Primary Reasoning)
1. **Get an API Key**: Visit Google AI Studio at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and generate a free API key.
2. **Open Configurations**: In MIRA, navigate to **`Configurations`** (`/configurations`) from the left sidebar and select the **`AI Configuration`** tab.
3. **Paste Key**: Locate the **Google Gemini** card and paste your key into the **API Key** input box.
4. **Choose Model**:
   - `gemini-2.5-flash`: Recommended for sub-second, highly responsive conversations.
   - `gemini-2.5-pro`: For deep reasoning and complex multi-file architectural code synthesis.
5. **Test & Save**: Click **`Test Latency`** to confirm network connectivity, then click **`Save & Verify`**.

---

<a id="962-groq-lpu-setup"></a>
#### 9.6.2 Groq LPU Setup (Ultra-Fast Fallback)
1. **Get an API Key**: Visit the Groq Console at [https://console.groq.com/keys](https://console.groq.com/keys).
2. **Enter Credentials**: In **`Configurations > AI Configuration`**, locate the **Groq** card.
3. **Paste Key**: Enter your key (`gsk_...`).
4. **Choose Model**: Select `llama-3.3-70b-versatile` or `llama-3.1-8b-instant`.
5. **Test & Save**: Click **`Test Latency`** and click **`Save & Verify`**.

---

<a id="963-elevenlabs-api-keys--quota-rotation-walkthrough"></a>
#### 9.6.3 ElevenLabs API Keys & Quota Rotation Walkthrough

MIRA includes support for **ElevenLabs** streaming speech synthesis and transcription, bringing lifelike conversational voices to your desktop companion:

```
┌────────────────────────────────────────────────────────────────────────┐
│  🎙️ Configurations > Microphone & Voice Synthesis                      │
├────────────────────────────────────────────────────────────────────────┤
│  ElevenLabs Multi-Key Quota Manager:                                   │
│  [ + Add New Key ]                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Key 1: [ sk_******************************** ] [Active] [🗑️]      │  │
│  │ Key 2: [ sk_******************************** ] [Backup] [🗑️]      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  Active Voice Model:  [ Eleven Flash v2 (Ultra-Low Latency)       ▼ ]  │
│  Selected Voice ID:   [ Rachel (21m00Tcm4TlvDq8ikWAM)             ▼ ]  │
│  Stability Slider:    [ ────●───────── ] 0.50                          │
│  Clarity / Similarity:[ ───────●────── ] 0.75                          │
│                                           [ Test Voice ] [ Save All ]  │
└────────────────────────────────────────────────────────────────────────┘
```

##### Step-by-Step Instructions:
1. **Obtain an ElevenLabs API Key**:
   - Create an account at [https://elevenlabs.io](https://elevenlabs.io).
   - Click on your profile icon in the bottom-left and select **Profile + API key**.
   - Copy your active secret key (`sk_...`).
2. **Access Microphone Settings**:
   - In MIRA Client, click **`Configurations`** in the left sidebar and select the **`Microphone`** tab.
3. **Add ElevenLabs API Key(s)**:
   - In the **ElevenLabs API Keys** section, paste your secret key.
   - **Multi-Key Quota Rotation**: If you have multiple ElevenLabs free or paid tier accounts, click **`+ Add New Key`** to add additional backup keys. MIRA's quota manager monitors monthly character usage; when Key 1 reaches its limit (or encounters an HTTP 429 quota exception), MIRA automatically switches to Key 2 with zero downtime!
4. **Select Voice Model & Voice ID**:
   - **Voice Model**: Select `Eleven Flash v2` for ultra-low latency sub-second conversational speech, or `Eleven Multilingual v2` for multi-lingual fidelity.
   - **Voice ID**: Choose from popular pre-made voices (such as *Rachel*, *Adam*, *Antoni*, or your custom cloned voice ID).
5. **Fine-Tune Audio Dynamics**:
   - Adjust the **Stability** slider (`0.50` recommended for natural expressiveness).
   - Adjust the **Clarity / Similarity Boost** slider (`0.75` recommended).
6. **Test Voice**:
   - Click **`Test Voice`**. MIRA dispatches a 3-word test phrase and plays the synthesized audio through your active output device.
7. **Save**: Click **`Save All`**. Vault seals the credentials into `vault.db` and updates the streaming audio engine.

> [!TIP]
> **100% Offline Speech Fallback**: If you don't have an ElevenLabs key or lose internet connection, toggle the speech engine to **OS Native Neural STT** (Faster-Whisper). Speech recognition and synthesis will run completely locally on your machine with zero cloud requests.

---

<a id="964-provider-priority--automatic-failover-mechanics"></a>
#### 9.6.4 Provider Priority & Automatic Failover Mechanics
* **Intelligent Failover Hierarchy**: MIRA maintains an active provider list. If Gemini experiences rate-limiting (`429 Too Many Requests`) or token exhaustion, MIRA switches to Groq LPU in under 50ms without dropping the user's conversational state.
* **Drag-and-Drop Priority**: In the **Provider Priority Order** list, drag and drop cards to change the default reasoning engine.
* **Zero-Downtime Hot Reload**: The moment you click Save, Vault encrypts the key and sends a `config_sync` event through Redis Streams. The Engine reloads its credentials in memory within milliseconds—no restarting required!

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="97-privacy-boundaries--screen-capture-blacklisting"></a>
### 9.7 Privacy Boundaries & Screen Capture Blacklisting

MIRA is designed so you never have to worry about private information being recorded.

#### 1. 1-Click Application Blacklisting:
1. Navigate to **`Configurations > Activity Control`**.
2. Under **Application Permissions**, you will see a list of all software installed on your computer (e.g., *1Password*, *Bitwarden*, *Google Chrome*, *Slack*, *Terminal*).
3. Find any application you want to keep private and toggle the switch to **`Blocked`** (or click **`Blacklist`**).
4. **How It Protects You**: Whenever you switch to a blacklisted application, the native Rust Operator detects the foreground window title and immediately skips capturing. **Zero bytes of imagery touch your disk or memory.**

#### 2. Adjusting Screen Capture Cadence:
- In the same **Activity Control** tab, adjust the **Capture Interval Slider** (from 5 seconds to 60 seconds).
- A cadence of 10–15 seconds is recommended for ideal balance between low CPU usage and detailed context capture.
- You can also click **`Pause Capture`** in the top navigation bar at any time to temporarily suspend desktop observation.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="98-ambient-voice--wake-word-controls"></a>
### 9.8 Ambient Voice & Wake-Word Controls

MIRA features hands-free ambient voice recognition:

1. **Enabling the Microphone**:
   - Click the microphone icon in the top header or system tray to toggle listening on/off.
2. **Wake-Word Detection**:
   - Say *"Mira"* in a natural tone (e.g., *"Mira, what was the function name we wrote earlier?"*).
   - MIRA isolates the wake word, captures your query, and begins streaming an answer.
3. **Conversational Awake Follow-Up Window**:
   - Once MIRA finishes speaking its response, an awake window opens for 8 seconds.
   - You can speak follow-up questions (e.g., *"Can you show me an example of that?"*) **without repeating the word "Mira"**.
   - If you remain silent, the assistant automatically returns to idle standby.
4. **Loopback Prevention**:
   - While MIRA is speaking aloud through your speakers, the microphone is automatically muted to prevent acoustic feedback and self-transcription.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="99-worker-concurrency--redis-telemetry"></a>
### 9.9 Worker Concurrency & Redis Telemetry

For advanced users and developers, MIRA provides complete visibility into its background worker pool and event queues:

1. **Worker Concurrency Tuning (`Configurations > Workers`)**:
   - **OCR Worker Pool**: Adjust how many parallel Tesseract OCR extraction tasks can run simultaneously across CPU cores (default: 2 workers).
   - **Knowledge Base Batch Size**: Fine-tune vector embedding batch sizes for dense indexing in Qdrant.
2. **Redis Streams Inspector (`Configurations > Redis`)**:
   - Live stream inspection of `ocr_extraction`, `ocr_summarization`, `embedding_memory`, and `config_sync`.
   - **Pending Entries List (PEL)**: Inspect in-flight jobs and ensure no messages remain stranded.
   - **Flush Queues**: Programmatically purge acknowledged entries or flush queues during development.
3. **Audit Trail Viewer (`Configurations > Logs`)**:
   - Filter encrypted logs across all microservices (`Client`, `Engine`, `Memory`, `Operator`, `Vault`, `Message_Broker`).
   - Filter by severity levels: `INFO`, `WARN`, `ERROR`.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="910-user-troubleshooting--frequently-asked-questions-faq"></a>
### 9.10 User Troubleshooting & Frequently Asked Questions (FAQ)

#### Q1: "Port conflict detected on 9001/9004. What should I do?"
* **Answer**: You don't need to do anything! MIRA's supervisor script (`scripts/start.py`) tests every socket before launching. If port `9001` or `9004` is occupied by another app, MIRA automatically increments the port (e.g., to `9005` or `9008`), updates `services.json`, and links the services together seamlessly.

#### Q2: "Screen capture is blank or black on macOS."
* **Answer**: macOS requires explicit permission for desktop recording.
  1. Open **System Settings > Privacy & Security > Screen Recording**.
  2. Locate your **Terminal**, **iTerm**, or **MIRA** application.
  3. Toggle the permission switch to **ON**.
  4. Restart MIRA (`python3 scripts/start.py`).

#### Q3: "I'm getting a Redis connection error on launch."
* **Answer**: Make sure your local Redis server is running:
  - **macOS**: `brew services start redis`
  - **Linux**: `sudo systemctl start redis`
  - **Windows**: Verify that the Memurai or Redis service is started in the Windows Services manager.
  - Test connectivity in your terminal with: `redis-cli ping` (should output `PONG`).

#### Q4: "How do I use MIRA completely offline?"
* **Answer**: In **`Configurations > Microphone`**, set your speech engine to **OS Native Neural STT** (Faster-Whisper). This runs speech recognition entirely on your CPU/GPU without contacting any cloud servers. For chat reasoning, you can configure local LLMs or use Groq/Gemini with the context minimization guarantee.

#### Q5: "Where are my screen captures and database stored?"
* **Answer**:
  - Ephemeral screen captures exist temporarily in `Operator/screenshots/` and are deleted immediately after text extraction.
  - Your encrypted database resides in `Vault/system/vault.db`.
  - Your vector memories reside in `Vault/system/knowledge_base/` (Qdrant format).
  - All files are local to your machine and locked with your OS hardware keychain.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="10-detailed-future-scope--system-roadmap"></a>
## 10. Detailed Future Scope & System Roadmap

MIRA represents the first step toward a completely autonomous, local-first personal operating system. The following phases define the future engineering roadmap:

<a id="101-on-device-multimodal-small-language-models-slms"></a>
### 10.1 On-Device Multimodal Small Language Models (SLMs)
* **Goal**: Eliminate external cloud LLM dependencies entirely for visual perception and code reasoning.
* **Architecture**: Integrate embedded multimodal small language models (such as `Qwen2-VL 2B/7B`, `Moondream2`, or `Phi-3.5-Vision`) running via `llama.cpp` and Apple Metal / NVIDIA CUDA acceleration.
* **Impact**: Screen captures can be understood semantically (interpreting charts, architectural diagrams, and visual UI layouts) directly on-device without passing OCR text to external APIs.

<a id="102-autonomous-os-automation--desktop-sub-agents"></a>
### 10.2 Autonomous OS Automation & Desktop Sub-Agents
* **Goal**: Transition from passive observation to active, user-authorized operating system task execution.
* **Architecture**: Extend the native Rust Operator with accessibility tree drivers (macOS `AXUIElement`, Windows `UIAutomation`, Linux `AT-SPI`) and a sandboxed terminal runner.
* **Capabilities**:
  - Automatically creating git commits and pull requests based on yesterday's indexed changes.
  - Organizing scattered project files and downloaded documentation.
  - Running repetitive CLI commands with explicit human-in-the-loop confirmation modals.

<a id="103-peer-to-peer-encrypted-multi-device-sync"></a>
### 10.3 Peer-to-Peer Encrypted Multi-Device Sync
* **Goal**: Seamlessly synchronize your MIRA digital memory across your laptop, desktop workstation, and mobile devices without a centralized cloud server.
* **Architecture**: Implement a decentralized peer-to-peer mesh using **Libp2p** and **WireGuard**.
* **Zero-Knowledge Guarantee**: Vector embeddings and encrypted SQLite snapshots are synchronized directly between authorized devices over encrypted local Wi-Fi or peer tunnels. No cloud intermediary ever sees your data.

<a id="104-predictive-context-anticipation--workspace-preparation"></a>
### 10.4 Predictive Context Anticipation & Workspace Preparation
* **Goal**: Anticipate what you need before you even ask.
* **Architecture**: Temporal association mining and IDE workspace integration.
* **Capabilities**:
  - If your calendar indicates a sprint demo at 10:00 AM, MIRA pre-loads relevant project notes, browser tabs, and deployment metrics into your Morning Cockpit at 9:30 AM.
  - If a compiler error occurs repeatedly in your terminal, MIRA automatically pulls relevant GitHub issues and documentation into an ambient notification sidebar.

<a id="105-full-duplex-low-latency-conversational-voice-streaming"></a>
### 10.5 Full-Duplex Low-Latency Conversational Voice Streaming
* **Goal**: Provide an uninterrupted, natural voice conversation experience with sub-200ms latency.
* **Architecture**: WebRTC audio streaming pipeline connecting browser audio worklets directly to streaming neural acoustic models.
* **Capabilities**: True full-duplex conversation with acoustic echo cancellation and instant interruption handling ("barge-in"), allowing you to interrupt MIRA mid-sentence naturally.

<a id="106-extensible-skill-plugin-ecosystem--model-context-protocol-mcp"></a>
### 10.6 Extensible Skill Plugin Ecosystem & Model Context Protocol (MCP)
* **Goal**: Allow community developers to extend MIRA with custom tools, external integrations, and domain-specific knowledge providers.
* **Architecture**: Full compliance with Anthropic's **Model Context Protocol (MCP)** specification.
* **Capabilities**: Seamlessly connect MIRA to local SQLite databases, GitHub repositories, Jira boards, Obsidian vaults, and custom home automation APIs through standardized MCP servers.

[↑ Back to Table of Contents](#table-of-contents)

---

<a id="11-repository-documentation-sitemap"></a>
## 11. Repository Documentation Sitemap

- **Core Documentation (In-Page Jump & GitHub)**:
  - Master Readme: [📖 Jump to Quickstart & Topology](#8-unified-installation--quickstart) • [README.md on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/README.md)
  - Master Knowledge Base: [📖 Top of Knowledge Base](#table-of-contents) • [KNOWLEDGE_BASE.md on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/KNOWLEDGE_BASE.md)
  - Scripts & Orchestration Guide: [🛠️ Scripts Section (#3.7)](#37-scripts--orchestration-toolkit) • [scripts/README.md on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/scripts/README.md)
- **Microservice Subsystems (Direct In-Page Manuals & GitHub Repositories)**:
  - Client Module: [🖥️ In-Page Client Manual & Architecture](#31-client-module-desktop-gui--multi-session-chat) • [Client on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Client)
  - Engine Module: [⚙️ In-Page Engine Manual & Architecture](#32-engine-module-llm-reasoning--neural-stt) • [Engine on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Engine)
  - Memory Module: [🧠 In-Page Memory Manual & Architecture](#33-memory-module-perceptual-vision--qdrant-store) • [Memory on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Memory)
  - Operator Module: [🦀 In-Page Operator Manual & Architecture](#34-operator-module-native-rust-screen-capture) • [Operator on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Operator)
  - Vault Module: [🔒 In-Page Vault Manual & Architecture](#35-vault-module-encrypted-secrets--authority) • [Vault on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Vault)
  - Message Broker Module: [⚡ In-Page Broker Manual & Architecture](#36-message-broker-module-redis-streams-fabric) • [Message Broker on GitHub ↗](https://github.com/DhirajKarangale/Mira/tree/main/Message_Broker)
- **Community & Governance (GitHub Documents)**:
  - Contributing Guidelines: [CONTRIBUTING.md on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/CONTRIBUTING.md)
  - Code of Conduct: [CODE_OF_CONDUCT.md on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/CODE_OF_CONDUCT.md)
  - Security Policy: [SECURITY.md on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/SECURITY.md)
  - MIT License: [LICENSE on GitHub ↗](https://github.com/DhirajKarangale/Mira/blob/main/LICENSE)

[↑ Back to Table of Contents](#table-of-contents)
