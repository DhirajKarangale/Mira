# MIRA Scripts & Orchestration Toolkit

This directory houses the unified orchestration, service discovery, build pipeline, and version management tools for the **MIRA** ecosystem.

> **Execution Context:**  
> All commands documented here are designed to be run from the **project root directory** (`e:\FullStack\Mira`), unless explicitly noted otherwise.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [File Manifest](#file-manifest)
3. [Service Discovery (`services.json`)](#1-service-discovery-servicesjson)
4. [Multi-Service Lifecycle Starter (`start.py`)](#2-multi-service-lifecycle-starter-startpy)
5. [Unified Cross-Platform Builder (`build.py` / `buid.py`)](#3-unified-cross-platform-builder-buildpy--buidpy)
6. [How to Run the Project](#how-to-run-the-project)
7. [How to Build the Project](#how-to-build-the-project)
8. [How to Get Project Version](#how-to-get-project-version)
9. [How to Change / Bump Project Version](#how-to-change--bump-project-version)

---

## Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │          scripts/start.py             │
                      │     (Lifecycle & Port Manager)        │
                      └───────┬───────────────────────┬───────┘
                              │                       │
           Detects free ports │                       │ Spawns & monitors
           and updates config ▼                       ▼ in dependency order
    ┌───────────────────────────────┐     ┌───────────────────────────────────┐
    │     scripts/services.json     │     │ 1. Redis Server (6379)            │
    │  (Dynamic Service Discovery)  │     │ 2. Vault (9001)                   │
    └──────────────┬────────────────┘     │ 3. Message Broker (9002)          │
                   │                      │ 4. Engine (9007)                  │
                   │ Reads endpoints at   │ 5. Operator (9003)                │
                   │ module initialization│ 6. Memory (9006)                  │
                   ▼                      │ 7. Client UI (9004)               │
          All Microservices               └───────────────────────────────────┘

                      ┌───────────────────────────────────────┐
                      │          scripts/build.py             │
                      │     (Cross-Platform Packager)         │
                      └───────┬───────────────────────┬───────┘
                              │                       │
      Builds binaries & UI    │                       │ Packages native installer
                              ▼                       ▼
           ┌─────────────────────────────┐    ┌───────────────────────────────┐
           │ • Operator (Rust Cargo)     │    │ • Windows: NSIS (.exe)        │
           │ • Client (Vite + React)     │───►│ • macOS:   DMG / .app         │
           │ • Stages Python Services    │    │ • Linux:   .deb / .AppImage   │
           │ • Synchronizes 4 version cfg│    └───────────────────────────────┘
           └─────────────────────────────┘
```

---

## File Manifest

| File | Description |
| :--- | :--- |
| [`services.json`](file:///e:/FullStack/Mira/scripts/services.json) | Central Service Discovery Registry defining active base URLs and ports for all services. |
| [`start.py`](file:///e:/FullStack/Mira/scripts/start.py) | Master multi-module orchestrator. Handles port conflict resolution, health checks, Redis management, process supervision, and graceful shutdown. |
| [`build.py`](file:///e:/FullStack/Mira/scripts/build.py) | Master packaging & compilation pipeline for Windows, macOS, and Linux installers. Also serves as the single source of truth for version querying and updating. |
| [`buid.py`](file:///e:/FullStack/Mira/scripts/buid.py) | Forwarding alias wrapper for `build.py` to ensure compatibility and prevent typographical execution errors. |

---

## 1. Service Discovery (`services.json`)

`services.json` eliminates hardcoded addresses across the entire application. Every microservice (FastAPI services, Rust Operator, and React Client) loads this file during boot to resolve inter-service endpoints dynamically.

### Default Port Mapping

```json
{
  "vault": "http://127.0.0.1:9001",
  "message_broker": "http://127.0.0.1:9002",
  "engine": "http://127.0.0.1:9007",
  "operator": "http://127.0.0.1:9003",
  "memory": "http://127.0.0.1:9006",
  "client": "http://127.0.0.1:9004"
}
```

### Module Responsibilities

| Service | Port | Technology | Primary Role |
| :--- | :---: | :--- | :--- |
| **Vault** | `9001` | FastAPI (Python) | Encrypted master secrets, configuration store, audit logs. |
| **Message Broker** | `9002` | FastAPI + Redis Streams | Async messaging fabric, event buses, background worker queues. |
| **Engine** | `9007` | FastAPI (Python) | LLM inference coordinator, LangGraph orchestration, proactive suggestions. |
| **Operator** | `9003` | Actix-web (Rust) | Native OS automation, screen capture, window tracking, system hooks. |
| **Memory** | `9006` | FastAPI (Python) | OCR processing, vector retrieval, contextual semantic recall. |
| **Client** | `9004` | Tauri v2 + React 19 + Vite | Desktop desktop window and responsive UI presentation layer. |

### Dynamic Conflict Resolution
When `start.py` launches, it tests if any default port is in use by another application. If a conflict occurs, `start.py` automatically increments the port to the next free socket (e.g., `9001` -> `9005`), writes the updated URLs to `scripts/services.json` and `Client/.env.local`, and launches the services with the resolved ports.

---

## 2. Multi-Service Lifecycle Starter (`start.py`)

`start.py` is the orchestrator for local development and desktop execution.

### Key Capabilities
- **Redis Auto-Detection:** Automatically searches standard system directories and starts a local Redis instance if one is not already running.
- **Port Conflict Allocation:** Tests socket availability before launch and prevents port collisions.
- **Environment Synchronization:** Dynamically writes `.env.local` for the Vite frontend and updates `tauri.conf.json` dev URLs.
- **Dependency-Ordered Startup:** Starts services in logical dependency order (`Vault` -> `Message Broker` -> `Engine` -> `Operator` -> `Memory` -> `Client`) and polls each service's `/health` endpoint before starting dependent modules.
- **Multiplexed Logging:** Tags stdout and stderr with color-coded service prefixes (`[VAULT]`, `[MESSAGE_BROKER]`, etc.).
- **Graceful Teardown:** Listens for `SIGINT` (`Ctrl+C`) and `SIGTERM`, killing all child process trees cleanly (via `taskkill /T /F` on Windows) to prevent orphan processes.

### Command-Line Arguments

| Flag | Description |
| :--- | :--- |
| *(none)* | Start all services and launch the Client UI in your default browser. |
| `--check` | Inspect socket availability and print the port allocation plan without launching any services. |
| `--status` | Ping health endpoints of currently running services and print an active status report. |
| `--kill-ports` | Forcefully kill any lingering processes occupying default ports (`9001`-`9007`). |
| `--no-client` | Start all backend microservices without launching the frontend Client. |
| `--no-open` | Start everything but do not auto-open the browser tab. |
| `--headless` | Run in non-interactive background mode (suppresses banners and browser launching). |
| `--modules <list>` | Start only specific services by ID, comma-separated (e.g. `--modules vault,message_broker`). |
| `--prod` | Launch backend services in production mode (disables FastAPI auto-reload). |

---

## 3. Unified Cross-Platform Builder (`build.py` / `buid.py`)

`build.py` (with `buid.py` alias) packages MIRA into native installers and binaries for Windows, macOS, and Linux.

### The 6-Step Build Pipeline
1. **Prerequisite Check:** Validates Python 3.10+, Rust Cargo, Node.js, and Redis binaries.
2. **Operator Compilation:** Runs `cargo build --release` inside `Operator/` to produce the native `operator.exe` / `operator` binary.
3. **Frontend Production Build:** Runs `npm run build` in `Client/` to compile TypeScript and Vite assets into `Client/dist/`.
4. **Microservice Resource Staging:** Copies backend services (`Vault`, `Message_Broker`, `Memory`, `Engine`), `start.py`, `services.json`, and required runtime binaries into `Client/src-tauri/resources/`.
5. **Tauri Configuration Verification:** Configures bundle targets, installer hooks, NSIS branding bitmaps, icons, and platform permissions.
6. **Native Packaging:** Invokes Tauri CLI to generate production installer artifacts:
   - **Windows:** NSIS Installer (`.exe`) in `Client/src-tauri/target/release/bundle/nsis/`
   - **macOS:** Disk Image (`.dmg`) and App Bundle (`.app`) in `Client/src-tauri/target/release/bundle/dmg/`
   - **Linux:** `.deb` package and `.AppImage` in `Client/src-tauri/target/release/bundle/`

### Command-Line Arguments

| Flag | Description |
| :--- | :--- |
| *(none)* | Automatically detect operating system and perform full build + packaging. |
| `--get-version`, `-V` | Output current project version string and exit immediately. |
| `--check-versions` | Check and compare versions across all 4 configuration files. |
| `--set-version <VER>` | Atomically update version number across all 4 component configuration files. |
| `--skip-operator` | Skip compiling the Rust Operator (reuses existing release binary). |
| `--skip-client` | Skip rebuilding frontend web assets (reuses existing `Client/dist/`). |
| `--stage-only` | Stage all microservices and binaries into Tauri resources without compiling the installer. |
| `--bundle <target>` | Target specific bundle format (e.g., `nsis`, `dmg`, `deb`, `appimage`, `all`). |

---

## How to Run the Project

Ensure you are in the **project root directory**:

### 1. Quick Start (All Services + Web UI)
Starts all backend services, Redis, and Client UI, then automatically opens your browser:
```powershell
python scripts/start.py
```

### 2. Pre-Flight Check (Verify Ports)
Check which ports will be assigned without starting any services:
```powershell
python scripts/start.py --check
```

### 3. Backend Only (Headless / API Mode)
Start all microservices without the frontend:
```powershell
python scripts/start.py --no-client
```

### 4. Specific Microservices Only
Run only selected services (e.g., Vault and Message Broker):
```powershell
python scripts/start.py --modules vault,message_broker
```

### 5. Check Health of Running Services
Verify health endpoints while services are running:
```powershell
python scripts/start.py --status
```

### 6. Free Blocked Ports
If a previous session crashed and left ports occupied:
```powershell
python scripts/start.py --kill-ports
```

---

## How to Build the Project

### 1. Full Production Build (Current OS)
Builds the complete desktop installer for your current platform:
```powershell
python scripts/build.py
```
*(You can also use `python scripts/buid.py`)*

### 2. Fast Incremental Build (Skip Recompiling Rust)
If you only modified frontend or backend code and don't need to recompile the Operator:
```powershell
python scripts/build.py --skip-operator
```

### 3. Stage Resources Only
Prepare all backend services and binaries for Tauri without triggering the full installer package:
```powershell
python scripts/build.py --stage-only
```

### 4. Build Specific Format
Force a specific target bundle:
```powershell
# Windows NSIS Installer:
python scripts/build.py --bundle nsis

# macOS DMG:
python scripts/build.py --bundle dmg

# Linux Debian package:
python scripts/build.py --bundle deb
```

### Installer Output Locations
- **Windows:** `Client/src-tauri/target/release/bundle/nsis/MIRA_<version>_x64-setup.exe`
- **macOS:** `Client/src-tauri/target/release/bundle/dmg/MIRA_<version>_x64.dmg`
- **Linux:** `Client/src-tauri/target/release/bundle/deb/` and `appimage/`

---

## How to Get Project Version

### 1. Print Version Directly
Prints the active synchronized version string:
```powershell
python scripts/build.py --get-version
```
*Output example:*
```
0.1.2
```

*(Shortcuts also supported: `python scripts/build.py get-version` or `python scripts/buid.py --get-version`)*

### 2. Verify Consistency Across All Component Files
Checks and prints whether all configuration files are in sync:
```powershell
python scripts/build.py --check-versions
```
*Output example:*
```
MIRA Component Versions:
  ✔ Client/src-tauri/tauri.conf.json     : 0.1.2
  ✔ Client/package.json                  : 0.1.2
  ✔ Client/src-tauri/Cargo.toml          : 0.1.2
  ✔ Operator/Cargo.toml                  : 0.1.2

  ✔ All components are synchronized on version 0.1.2
```

---

## How to Change / Bump Project Version

MIRA maintains synchronized versions across 4 configuration files:
1. `Client/src-tauri/tauri.conf.json`
2. `Client/package.json`
3. `Client/src-tauri/Cargo.toml`
4. `Operator/Cargo.toml`

### Update Version Command
To atomically bump the version across all 4 files simultaneously:
```powershell
python scripts/build.py --set-version <NEW_VERSION>
```

#### Example: Bump to `0.2.0`
```powershell
python scripts/build.py --set-version 0.2.0
```

*Output example:*
```
Updating MIRA project version to: 0.2.0

  ✔ Updated Client\src-tauri\tauri.conf.json -> "0.2.0"
  ✔ Updated Client\package.json -> "0.2.0"
  ✔ Updated Client\src-tauri\Cargo.toml -> "0.2.0"
  ✔ Updated Operator\Cargo.toml -> "0.2.0"

★ Version updated to 0.2.0 across all build configurations! ★
```

#### Verify the Update:
```powershell
python scripts/build.py --check-versions
```
