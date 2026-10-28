# Contributing to MIRA

Thank you for your interest in contributing to **MIRA (Memory • Intelligence • Recall • Assistant)**! 

MIRA is an open-source, local-first, privacy-conscious personal AI operating system. We welcome contributions of all kinds: bug fixes, performance optimizations, new features, UI improvements, documentation enhancements, and architectural refinements.

Before contributing, please read this document and our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Table of Contents

- [1. Core Philosophy & Guiding Principles](#1-core-philosophy--guiding-principles)
- [2. System Architecture & Directory Structure](#2-system-architecture--directory-structure)
- [3. Prerequisites & Environment Setup](#3-prerequisites--environment-setup)
- [4. Running MIRA Locally](#4-running-mira-locally)
- [5. Module-Specific Development Guidelines](#5-module-specific-development-guidelines)
  - [5.1 Client (Desktop UI)](#51-client-desktop-ui)
  - [5.2 Engine (Reasoning & LLM Orchestration)](#52-engine-reasoning--llm-orchestration)
  - [5.3 Memory (Perception, OCR & Qdrant)](#53-memory-perception-ocr--qdrant)
  - [5.4 Operator (Native Rust Screen Capture)](#54-operator-native-rust-screen-capture)
  - [5.5 Vault (Encrypted Storage & Keyrings)](#55-vault-encrypted-storage--keyrings)
  - [5.6 Message Broker (Redis Streams)](#56-message-broker-redis-streams)
- [6. Development Workflow & Git Best Practices](#6-development-workflow--git-best-practices)
  - [6.1 Branch Naming](#61-branch-naming)
  - [6.2 Commit Conventions](#62-commit-conventions)
  - [6.3 Pull Request Process](#63-pull-request-process)
- [7. Code Quality & Standards](#7-code-quality--standards)
- [8. Release & Version Management](#8-release--version-management)
- [9. Getting Help](#9-getting-help)

---

## 1. Core Philosophy & Guiding Principles

Every line of code committed to MIRA must adhere to our core architectural tenets:

1. **Local-First & Zero Data Harvesting**: MIRA does not send personal user data, screen captures, or voice recordings to centralized cloud services. All knowledge indexing, OCR, and vector storage occur on the local host machine.
2. **Context Minimization**: When interacting with external LLMs (e.g. Gemini, Groq), only precise, scrubbed snippets required to answer a specific prompt are dispatched. Never stream full screen streams or full databases to third parties.
3. **Loopback Only (`127.0.0.1`)**: Internal microservices communicate strictly over local loopback interfaces. Services must never bind directly to `0.0.0.0` or expose unauthenticated endpoints across external local area networks.
4. **Performance & Sub-Perceptual Latency**: Background workers must remain lightweight. Screen difference algorithms, vector search, and audio streaming must not degrade the user's primary desktop performance.
5. **Zero Disk Audio Persistence**: Microphone buffers are processed in volatile RAM and immediately discarded. Never persist raw audio streams to disk.

---

## 2. System Architecture & Directory Structure

MIRA is designed as a distributed, modular desktop ecosystem:

```
Mira/
├── Client/            # Frontend UI (React 19, TypeScript, Vite, Tailwind v4, Tauri v2)
├── Engine/            # LLM inference, conversation flows, daily suggestions, failover routing
├── Memory/            # Visual perception, OpenCV diffing, Tesseract OCR, Qdrant vectors
├── Operator/          # High-performance Rust screen capture (xcap), window tracking
├── Vault/             # Hardware keyring (XSalsa20-Poly1305), encrypted SQLite config store
├── Message_Broker/    # Async Redis Streams event bus
├── scripts/           # Master orchestrator (start.py), build packager (build.py), services.json
├── utils/             # Shared helper functions and common utilities
├── CODE_OF_CONDUCT.md # Community code of conduct
├── CONTRIBUTING.md    # Contribution guidelines (this file)
├── SECURITY.md        # Security & vulnerability reporting policy
└── README.md          # Comprehensive architectural documentation
```

---

## 3. Prerequisites & Environment Setup

Ensure the following runtimes and tools are installed on your machine:

- **Python**: `3.10` or higher (`python --version`)
- **Node.js**: `20.x` or higher (`node --version`) and `npm` (`npm --version`)
- **Rust Toolchain**: Stable channel (`rustc --version`, `cargo --version`)
- **Redis Server**: `redis-server` installed and reachable on standard port `6379`
- **Tesseract OCR**: Installed with language data (`tesseract --version`)
- **Operating System Packages**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux (Ubuntu/Debian)**: `build-essential libssl-dev tesseract-ocr tesseract-ocr-eng libasound2-dev libxcb1-dev libxcb-render0-dev libxcb-shape0-dev libxcb-xfixes0-dev`
  - **Windows**: Visual Studio 2022 C++ Build Tools

---

## 4. Running MIRA Locally

### The Recommended Way: Unified Starter (`scripts/start.py`)

MIRA provides an intelligent orchestrator that checks dependencies, dynamically resolves port conflicts, configures service discovery, and starts all background services:

```bash
# Clone the repository
git clone https://github.com/DhirajKarangale/Mira.git
cd Mira

# Launch the unified starter
python scripts/start.py
```

`start.py` will:
1. Inspect ports (`9001` - `9007`) and dynamically rebind if any collisions exist.
2. Synchronize endpoint URLs to `scripts/services.json` and `Client/.env.local`.
3. Spawn the Redis broker, Vault, Message Broker, Engine, Operator, Memory, and Client.
4. Stream unified, color-coded health and log metrics to your terminal.
5. Provide graceful termination (`Ctrl + C`) across all spawned child processes.

### Running Independent Services for Focused Debugging

If you are only working on a single module, you can run services individually:

```bash
# Run Engine
cd Engine && python -m uvicorn app:app --port 9007 --reload

# Run Vault
cd Vault && python -m uvicorn app:app --port 9001 --reload

# Run Client Web View
cd Client && npm run dev

# Run Client via Tauri Native Window
cd Client && npm run tauri dev

# Run Operator
cd Operator && cargo run
```

---

## 5. Module-Specific Development Guidelines

### 5.1 Client (Desktop UI)
- **Stack**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Zustand.
- **Location**: `Client/`
- **Commands**:
  ```bash
  cd Client
  npm install        # Install dependencies
  npm run dev        # Run Vite development server
  npm run build      # TypeScript validation & Vite production build
  npm run tauri dev  # Run native desktop app via Tauri
  ```
- **Rules**:
  - Always verify TypeScript compilation cleanly passes with `npm run build`.
  - Maintain the sleek, dark glassmorphism aesthetic established across the app.
  - Keep state management structured within Zustand stores.
  - Do not commit sensitive keys directly in frontend `.env` files.

### 5.2 Engine (Reasoning & LLM Orchestration)
- **Stack**: Python, FastAPI, Uvicorn, LangGraph / LLM Providers (Gemini, Groq).
- **Location**: `Engine/`
- **Rules**:
  - Respect the dynamic failover mechanism (e.g. Gemini 429 quota exhaustion falling back to Groq).
  - Enforce context minimization: prompt templates must scrub extraneous PII before sending queries to remote APIs.

### 5.3 Memory (Perception, OCR & Qdrant)
- **Stack**: Python, FastAPI, OpenCV, Tesseract OCR, PyTorch embeddings (`Qwen3-Embedding-0.6B`), Local Qdrant.
- **Location**: `Memory/`
- **Rules**:
  - Optimize matrix operations; frame difference checks must remain fast (<10ms).
  - Unlink temporary screenshot files immediately after optical character analysis.
  - Ensure vector collections are properly partitioned by day to allow automated retention management.

### 5.4 Operator (Native Rust Screen Capture)
- **Stack**: Rust, `xcap`, Actix-web, Windows UI Automation / macOS CoreGraphics / Linux X11/Wayland.
- **Location**: `Operator/`
- **Commands**:
  ```bash
  cd Operator
  cargo check
  cargo clippy --all-targets --all-features
  cargo fmt -- --check
  ```
- **Rules**:
  - Keep CPU and memory usage minimal during screen polling cycles.
  - **Strictly enforce application blacklisting**: inspect active process handles before capturing the screen. If the foreground application is blacklisted, immediately discard the frame.

### 5.5 Vault (Encrypted Storage & Keyrings)
- **Stack**: Python, PyNaCl (`SecretBox` / `XSalsa20-Poly1305`), SQLite, Host Keyring (`keyring` package).
- **Location**: `Vault/`
- **Rules**:
  - Master keys must be derived from the OS hardware keyring (Apple Keychain / Windows Credential Manager / SecretService).
  - Never log decrypted credentials or sensitive tokens in terminal outputs or log files.

### 5.6 Message Broker (Redis Streams)
- **Stack**: FastAPI, Redis Streams.
- **Location**: `Message_Broker/`
- **Rules**:
  - Consumer groups must acknowledge (`XACK`) processed event messages to prevent buffer exhaustion.
  - Handle redis reconnection gracefully with exponential backoff.

---

## 6. Development Workflow & Git Best Practices

### 6.1 Branch Naming

Create clear, descriptive branch names originating from `main`:

```bash
git checkout -b feature/dynamic-noise-suppression
git checkout -b bugfix/operator-multimonitor-crash
git checkout -b docs/clarify-linux-tesseract-setup
```

Recommended prefixes:
- `feature/` — New functionality or major enhancements
- `bugfix/` or `fix/` — Fixing a bug or unexpected behavior
- `refactor/` — Code restructuring without altering functionality
- `perf/` — Performance and memory optimizations
- `docs/` — Documentation updates or improvements
- `test/` — Adding or updating test suites

### 6.2 Commit Conventions

MIRA adheres to [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

**Examples:**
- `feat(client): add microphone gain meter to voice drawer`
- `fix(operator): handle display disconnect on multi-monitor setups`
- `perf(memory): optimize opencv frame diff threshold calculation`
- `docs(readme): add troubleshooting steps for windows credential manager`

### 6.3 Pull Request Process

1. **Sync with Upstream**: Ensure your branch is rebased on top of the latest `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. **Verify Builds**:
   - `cd Client && npm run build`
   - `cd Operator && cargo check && cargo clippy`
   - Check that Python services boot cleanly without import errors.
3. **Open Pull Request**:
   - Provide a clear title and description explaining *what* changed and *why*.
   - Reference any related issues (e.g. `Resolves #42`).
   - Include screenshots or screen recordings for visual UI changes in the Client.
4. **Code Review**: Address feedback constructively. Once approved by maintainers, your PR will be squash-merged into `main`.

---

## 7. Code Quality & Standards

- **Python**: Follow PEP 8 guidelines. Use explicit type hints (`typing`) on function signatures and public APIs.
- **TypeScript**: Strict type checking enabled. Avoid `any`; define proper interfaces or types.
- **Rust**: Code must pass `cargo clippy` without warnings. Unsafe code blocks require explicit documentation justifying memory safety.
- **Secrets & Credentials**: **Never** commit API keys, `.env.local` files, or production databases. Pre-commit sanity checks are strongly encouraged.

---

## 8. Release & Version Management

MIRA uses the unified build pipeline [`scripts/build.py`](scripts/build.py) to manage semantic versions simultaneously across:
- `Client/package.json`
- `Client/src-tauri/tauri.conf.json`
- `Operator/Cargo.toml`
- `Vault/config.py`

### Inspect Current Version
```bash
python scripts/build.py --get-version
```

### Bump Version
```bash
# Bump patch version (0.1.3 -> 0.1.4)
python scripts/build.py --bump-version patch

# Bump minor version (0.1.3 -> 0.2.0)
python scripts/build.py --bump-version minor

# Bump major version (0.1.3 -> 1.0.0)
python scripts/build.py --bump-version major
```

---

## 9. Getting Help

Have questions or need assistance while working on MIRA?
- Open a discussion or issue on [GitHub Issues](https://github.com/DhirajKarangale/Mira/issues).
- Reach out to the maintainers at [dakarangale02@gmail.com](mailto:dakarangale02@gmail.com).

Thank you for helping make MIRA the best local-first personal AI operating system!
