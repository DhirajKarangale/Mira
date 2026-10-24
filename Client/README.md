# Client

The **Client** is the desktop user interface and control center for MIRA, built with **Tauri v2**, **React 19**, **Vite**, and **TailwindCSS**.

---

## 1. Purpose

- **Desktop Interface**: Native desktop application with custom window controls and responsive views.
- **Activity Monitoring**: Live screen capture controls, application permission toggles, encrypted log inspection, and Redis telemetry.
- **Configuration Management**: Manages user details, AI provider API credentials, priority order, and worker concurrency limits.
- **Centralized Service Layer**: Interacts with backend services through unified client services in `src/services/`.

---

## 2. Integrated Backend Services

The Client communicates with MIRA microservices via centralized HTTP clients (`src/services/`):

### 2.1 Vault Service (`http://127.0.0.1:9001`)
- `GET /health`: Health status.
- `GET /user`, `POST /user`: User profile management.
- `GET /config/{key}`, `POST /config/{module}`: Module configurations.
- `GET /logs`, `DELETE /logs`: Audit log queries and purges.
- `POST /retention/cleanup`: Trigger log retention cleanup.
- `GET /os`: Operating system detection.
- `GET /ai/providers`, `GET /ai/configs`, `POST /ai/configs/{provider}`, `DELETE /ai/configs/{provider}`: AI credentials.
- `GET /ai/priorities`, `PUT /ai/priorities`: AI provider execution order.
- `GET /engine/workers`, `PUT /engine/workers`: Worker concurrency limits.

### 2.2 Message Broker Service (`http://127.0.0.1:9002`)
- `GET /health`: Health status.
- `GET /redis/consumer-groups`: Stream and consumer group telemetry.
- `DELETE /redis/consumer-groups/{group_name}`: Delete consumer group.
- `POST /redis/clean`: Clear pending messages.
- `POST /redis/format`: Reset Redis streams and reinitialize groups.
- `POST /jobs`, `GET /jobs`, `DELETE /jobs`: Queue and manage stream jobs.

### 2.3 Operator Service (`http://127.0.0.1:9003`)
- `GET /health`: Health status.
- `GET /status`: Capture loop status and active interval.
- `POST /start`: Start screen capture loop.
- `POST /stop`: Stop screen capture loop.
- `POST /interval`: Update capture frequency.
- `POST /delete`: Delete local screenshot file.
- `GET /apps`: Discovered applications and permissions.
- `POST /apps/refresh`: Scan system applications and sync with Vault.
- `POST /apps/permission`: Update app capture permission.

### 2.4 Memory Service (`http://127.0.0.1:9006`)
- `GET /health`: Health status.
- `GET /status`: Worker status and difference threshold.
- `POST /workers/start`: Start worker loops.
- `POST /workers/stop`: Stop worker loops.
- `GET /knowledge-base`: List knowledge base daily collections.
- `DELETE /knowledge-base/{name}`: Delete knowledge base collection.
- `POST /knowledge-base/cleanup`: Clean expired knowledge bases.
- `POST /knowledge-base/search`: Search vector knowledge base.
- `POST /extract`: Extract image matrices and OCR text.

### 2.5 Engine Service (`http://127.0.0.1:9007`)
- `GET /health`: Health status.
- `GET /status`: Service status, active provider, and worker limits.
- `POST /llm/call`: Execute LLM prompt with fallback rotation.
- `POST /config/sync`: Synchronize AI configuration from Vault.
- `GET /summarization/status`: Worker pool telemetry.
- `POST /summarization/start`, `POST /summarization/stop`: Worker pool control.

---

## 3. Installation & Startup

### Install Dependencies
Dependencies are managed in `package.json`:
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
