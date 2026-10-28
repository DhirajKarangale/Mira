# Security & Vulnerability Policy

The **MIRA** project is built upon an uncompromising commitment to user privacy, local data sovereignty, and robust hardware-backed security. Because MIRA operates as an ambient digital memory and autonomous assistant with access to screen perception, local knowledge bases, and system automation, security is an architectural requirement, not an afterthought.

---

## Table of Contents

- [1. Security Architecture & Guarantees](#1-security-architecture--guarantees)
  - [1.1 Local-First Zero Data Harvesting](#11-local-first-zero-data-harvesting)
  - [1.2 Hardware-Backed Master Key Derivation](#12-hardware-backed-master-key-derivation)
  - [1.3 Authenticated Local Cryptography](#13-authenticated-local-cryptography)
  - [1.4 Context Minimization Gateway](#14-context-minimization-gateway)
  - [1.5 Loopback Network Isolation (`127.0.0.1`)](#15-loopback-network-isolation-127001)
  - [1.6 Application Blacklisting & Screen Boundaries](#16-application-blacklisting--screen-boundaries)
  - [1.7 Transient Audio & Memory Hygiene](#17-transient-audio--memory-hygiene)
- [2. Supported Versions](#2-supported-versions)
- [3. Reporting a Vulnerability](#3-reporting-a-vulnerability)
- [4. Response Timelines & Disclosure Process](#4-response-timelines--disclosure-process)
- [5. Guidelines for Contributors & Security Researchers](#5-guidelines-for-contributors--security-researchers)

---

## 1. Security Architecture & Guarantees

### 1.1 Local-First Zero Data Harvesting
MIRA is engineered so that your digital footprint never leaves your physical hardware:
- **Zero Cloud Harvesting**: Screen captures, OCR transcripts, vector embeddings, and conversation histories are stored exclusively on the host device.
- **Zero Model Training**: MIRA never transmits user interactions, screen states, or internal logs to central servers for advertising, analytics, or model training.

### 1.2 Hardware-Backed Master Key Derivation
Master encryption keys are never stored in plaintext on disk:
- Keys are derived directly from the host operating system's native hardware-backed credential store:
  - **macOS**: Apple Keychain Services
  - **Windows**: Windows Credential Manager
  - **Linux**: SecretService API / GNOME Keyring / KWallet
- Even if an attacker physically extracts the encrypted SQLite database (`vault.db`), it cannot be decrypted without an active, authorized user session in the OS hardware keyring.

### 1.3 Authenticated Local Cryptography
- Persistent configurations, API tokens, chat history, and system configurations are encrypted using authenticated symmetric cryptography (**PyNaCl SecretBox / XSalsa20-Poly1305**).
- This ensures both confidential secrecy and cryptographic tamper-resistance: any offline modification of the encrypted ciphertext triggers immediate authentication rejection upon boot.

### 1.4 Context Minimization Gateway
MIRA enforces a strict boundary between private local storage and cloud LLM inference:
- **No Bulk Screen Uploads**: Raw screen captures, OCR dumps, and full databases are **never** streamed to third-party AI APIs.
- **Precision Snippets**: When responding to a user query, the Engine extracts only the 2-3 most relevant semantic sentences from the local Qdrant vector index.
- **Sanitization**: Extraneous desktop coordinates, recognized password patterns, and known PII (Personally Identifiable Information) are scrubbed before prompt dispatch.

### 1.5 Loopback Network Isolation (`127.0.0.1`)
- All inter-process communication (IPC) between microservices (Vault `9001`, Message Broker `9002`, Engine `9007`, Operator `9003`, Memory `9006`, Client `9004`) binds exclusively to the local loopback interface (`127.0.0.1`).
- Services must **never** bind to `0.0.0.0` or expose unauthenticated endpoints across local area networks (LANs) or public interfaces.

### 1.6 Application Blacklisting & Screen Boundaries
- Users can configure application blacklists (e.g. 1Password, Bitwarden, Keepass, banking websites, private messaging clients) in Settings.
- The native Rust Operator verifies the active foreground window title and executable path *prior* to capture. Frames from blacklisted processes are dropped immediately in memory and never written to disk or sent to the OCR pipeline.

### 1.7 Transient Audio & Memory Hygiene
- Ambient microphone audio streams are held strictly in volatile RAM for real-time transcription and are immediately wiped upon processing.
- Raw PCM and WAV audio is **never written to disk**.
- Temporary screen capture buffers are promptly deleted from the filesystem as soon as OCR matrix diffing concludes.

---

## 2. Supported Versions

Security updates and patches are actively provided for the following releases:

| Version | Supported | Notes |
| :--- | :---: | :--- |
| `0.1.x` (Current `main`) | :white_check_mark: | Actively receiving security patches and maintenance updates |
| `< 0.1.0` | :x: | Deprecated preview builds; please upgrade to the latest release |

---

## 3. Reporting a Vulnerability

We deeply appreciate the efforts of security researchers and community members who help protect MIRA users.

> [!IMPORTANT]
> **Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### How to Report

To report a vulnerability responsibly, choose one of the following private channels:

1. **GitHub Private Security Advisory (Preferred)**:
   - Navigate to [MIRA Security Advisories](https://github.com/DhirajKarangale/Mira/security/advisories).
   - Click **"Report a vulnerability"** to open a confidential report.
2. **Direct Email**:
   - Send an email to the core maintainer: [dhirajkarangale@gmail.com](mailto:dhirajkarangale@gmail.com).
   - Use the subject line: `[SECURITY] Vulnerability Report: MIRA - <Short Description>`.

### Information to Include

To help us triage and resolve the issue quickly, please include:
- A clear description of the vulnerability and its potential security impact.
- Affected components (e.g., `Vault`, `Operator`, `Client`, `Engine`, `Memory`, `Message_Broker`).
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Target platform details (OS name, version, architecture).
- Any proposed remediation, code diffs, or workaround if available.

---

## 4. Response Timelines & Disclosure Process

When a vulnerability is reported through private channels:

1. **Initial Acknowledgment**: We will acknowledge receipt of your report within **48 hours**.
2. **Assessment & Validation**: We will assess the severity, reproduce the behavior, and determine the scope of impact within **5 business days**.
3. **Patch Development**: We will develop and test a security fix on a private branch.
4. **Coordinated Release**: We will publish a patched release along with a security advisory acknowledging your contribution (unless you prefer to remain anonymous).
5. **Public Disclosure**: Public disclosure occurs only after an official patch has been published and users have been given adequate time to upgrade.

---

## 5. Guidelines for Contributors & Security Researchers

When conducting security research or contributing code to MIRA:

- **Respect Privacy**: Only test on systems and data you own or have explicit authorization to audit.
- **Do Not Exfiltrate**: Never attempt to access or exfiltrate another user's personal data or credentials.
- **Prevent Disruption**: Avoid denial-of-service (DoS) attacks or tests that could cause data corruption or loss.
- **Audit Dependencies**: Keep Python (`pip audit`), Node.js (`npm audit`), and Rust (`cargo audit`) dependencies free of known high-severity CVEs.
- **No Plaintext Secrets**: Never hardcode encryption keys, API secrets, or certificates into source code or test fixtures.

Thank you for helping us keep MIRA and its community safe!
