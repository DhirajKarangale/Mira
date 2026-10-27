# Client

The **Client** is the desktop user interface and control center for MIRA, built with **Tauri v2**, **React 19**, **Vite**, and **TailwindCSS**.

---

## 1. Purpose

- **Desktop Interface**: Native desktop application with custom window controls and responsive views.
- **Activity Monitoring**: Live screen capture controls, application permission toggles, encrypted log inspection, and Redis telemetry.
- **Configuration Management**: Manages user details, AI provider API credentials, priority order, and worker concurrency limits.
- **Agentic Chat**: Real-time chat interface connecting to Engine via WebSocket and REST.
- **Daily Dashboard**: Daily suggestions, weather forecast, and localized news widgets.
- **Centralized Service Layer**: Interacts with backend services through unified client services in `src/services/`.

---

## 2. Centralized Service Layer

The Client communicates with backend services via centralized service classes in `src/services/`:

### 2.1 Vault Service (`vault.service.ts` -> `http://127.0.0.1:9001`)
- Health check: `GET /health`
- User details: `GET /user`, `POST /user`
- Configuration: `GET /config/{key}`, `POST /config/{module}`
- Audit logs: `GET /logs`, `DELETE /logs`, `POST /retention/cleanup`
- Host OS detection: `GET /os`
- AI credentials: `GET /ai/providers`, `GET /ai/configs`, `GET /ai/configs/{provider}`, `POST /ai/configs/{provider}`, `DELETE /ai/configs/{provider}`
- AI priorities: `GET /ai/priorities`, `PUT /ai/priorities`
- News configuration: `GET /news/config`, `POST /news/config`, `DELETE /news/config`
- Engine workers: `GET /engine/workers`, `PUT /engine/workers`

### 2.2 Message Broker Service (`broker.service.ts` -> `http://127.0.0.1:9002`)
- Health check: `GET /health`
- Consumer groups: `GET /redis/consumer-groups`, `DELETE /redis/consumer-groups/{group_name}`
- Redis maintenance: `POST /redis/clean`, `POST /redis/format`
- Job management: `POST /jobs`, `GET /jobs`, `DELETE /jobs`

### 2.3 Operator Service (`operator.service.ts` -> `http://127.0.0.1:9003`)
- Health check: `GET /health`
- Capture status & control: `GET /status`, `POST /start`, `POST /stop`, `POST /interval`, `POST /delete`
- Applications & permissions: `GET /apps`, `POST /apps/refresh`, `POST /apps/permission`
- Microphone control: `GET /microphone/status`, `POST /microphone/start`, `POST /microphone/stop`, `GET /microphone/auto-start`, `POST /microphone/auto-start`

### 2.4 Memory Service (`memory.service.ts` -> `http://127.0.0.1:9006`)
- Health check: `GET /health`
- Worker status & control: `GET /status`, `POST /workers/start`, `POST /workers/stop`
- Knowledge base collections: `GET /knowledge-base`, `DELETE /knowledge-base/{name}`, `POST /knowledge-base/cleanup`
- Extraction & search: `POST /extract`, `POST /process-job`

### 2.5 Engine Service (`engine.service.ts` -> `http://127.0.0.1:9007`)
- Health & status: `GET /health`, `GET /status`, `GET /embedding/status`
- Summarization control: `GET /summarization/status`, `POST /summarization/start`, `POST /summarization/stop`
- Config sync: `POST /config/sync`
- Direct LLM calls: `POST /llm/call`
- Chat operations: `GET /chats/sessions`, `GET /chats/sessions/{session_id}`, `POST /chats/message`, `PATCH /chats/sessions/{session_id}`, `DELETE /chats/sessions/{session_id}`, `DELETE /chats/all`, `GET /chats/pending`, `POST /chats/seed`
- Chat WebSocket: `WS /ws/chat`

### 2.6 Daily Suggestions Service (`dailySuggestions.service.ts` -> `http://127.0.0.1:9007`)
- Aggregated dashboard: `GET /daily_suggestions`
- Refresh triggers: `POST /daily_suggestions/refresh`
- Task completion: `POST /daily_suggestions/complete`

---

## 3. Installation & Startup

### Install Dependencies
```bash
npm install
```

### Start Web Development Server
Run Vite dev server on port `9004`:
```bash
npm run dev
```

### Start Desktop App
Run desktop application via Tauri:
```bash
npm run tauri dev
```

### Build Production Bundle
```bash
npm run build
```
