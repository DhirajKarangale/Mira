# Client

The **Client** is the desktop graphical user interface and control center for MIRA, built with **Tauri v2**, **React 19**, **Vite**, and **TailwindCSS**.

---

## 1. Purpose

- **Desktop Control Center**: Native desktop interface with custom window controls and responsive views.
- **Activity Monitoring**: Live screen capture controls, application permission toggles, encrypted log inspection, and Redis stream telemetry.
- **Configuration Management**: Manages user details, AI provider API credentials, priority fallback order, and worker concurrency limits.
- **Centralized Service Layer**: Interacts with backend microservices via unified service modules in `src/services/`.

---

## 2. Integrated Backend Services

The Client communicates directly with MIRA backend services using centralized HTTP clients (`src/services/`):

### 2.1 Vault Service (`http://127.0.0.1:9001`)
- `GET /health`: Service health check.
- `GET /user`, `POST /user`: User profile retrieval and persistence.
- `GET /config/{key}`, `POST /config/{module}`: Module configurations (`logs`, `message_broker`, `operator`).
- `GET /logs`: Encrypted log queries with module, search, and date filters.
- `POST /retention/cleanup`: Trigger log retention purge.
- `GET /os`: Host operating system detection.
- `GET /ai/providers`: Registered LLM providers.
- `GET /ai/configs`, `GET /ai/configs/{provider}`, `POST /ai/configs/{provider}`, `DELETE /ai/configs/{provider}`: AI provider credentials.
- `GET /ai/priorities`, `PUT /ai/priorities`: AI provider execution order.
- `GET /engine/workers`, `PUT /engine/workers`: Background worker concurrency limits.

### 2.2 Message Broker Service (`http://127.0.0.1:9002`)
- `GET /health`: Service health check.
- `GET /redis/consumer-groups`: Stream and consumer group telemetry.
- `DELETE /redis/consumer-groups/{group_name}`: Delete a consumer group.
- `POST /redis/clean`: Clear pending messages.
- `POST /redis/format`: Flush Redis database and reinitialize consumer groups.
- `POST /jobs`, `GET /jobs`, `DELETE /jobs`: Queue and manage stream jobs.

### 2.3 Operator Service (`http://127.0.0.1:9003`)
- `GET /health`: Service health check.
- `GET /status`: Capture loop status and active interval.
- `POST /start`: Start screen capture loop.
- `POST /stop`: Stop screen capture loop.
- `POST /interval`: Update capture frequency.
- `POST /delete`: Delete local screenshot file.
- `GET /apps`: Discovered applications and permissions.
- `POST /apps/refresh`: Scan system applications and sync with Vault.
- `POST /apps/permission`: Update app capture permission.

### 2.4 Memory Service (`http://127.0.0.1:9006`)
- `GET /health`: Service health check.
- `GET /status`: Worker status and difference threshold.
- `POST /workers/start`: Start extraction worker loops.
- `POST /workers/stop`: Stop extraction worker loops.
- `POST /extract`: Extract image matrices and OCR text.
- `POST /process-job`: Trigger screenshot job processing.

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
