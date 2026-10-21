# MIRA Client

The **Client** is the desktop graphical user interface and control center for the MIRA system, built using **Tauri v2**, **React 19**, **Vite**, and **TailwindCSS**.

---

## 1. Purpose

- **Desktop Operator Shell**: Provides a high-performance native desktop environment powered by Tauri v2 with custom frameless window controls.
- **Activity & Telemetry Center**: Real-time monitoring and management of screen capture sessions, application permissions, aggregated system logs, and Redis streams.
- **Centralized Integration**: Directly and uniformly interfaces with MIRA backend microservices (**Vault**, **Operator**, and **Message Broker**) through centralized services.
- **Configuration Management**: Unified management of user profiles, LLM credentials, log retention rules, and message broker connection settings.

---

## 2. Integrated Service APIs

All external API interactions are centralized through dedicated client services under `src/services/`.

### 2.1 Vault Service (`http://127.0.0.1:9001`)

Central configuration and encrypted data storage service.

#### Health Check
`GET /health`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "service": "Vault",
    "status": "online"
  }
  ```

#### Get User Profile
`GET /user`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "username": "user",
    "email": "user@example.com",
    "dob": "2000-01-01"
  }
  ```

#### Save User Profile
`POST /user`
- **Request Body (JSON):**
  - `username` (string, required): Username identifier.
  - `email` (string, required): User email address.
  - `dob` (string, required): Date of birth (`YYYY-MM-DD`).
- **Response (`200 OK`):**
  ```json
  {
    "username": "user",
    "email": "user@example.com",
    "dob": "2000-01-01"
  }
  ```

#### Get Screen Capture Settings
`GET /capture-settings`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "interval_seconds": 5,
    "start_date": "2026-10-20",
    "end_date": "2026-10-21"
  }
  ```

#### Delete Screen Capture Data by Date Range
`DELETE /capture-data`
- **Query Parameters:**
  - `start_date` (string, required): Beginning date (`YYYY-MM-DD`).
  - `end_date` (string, required): Ending date (`YYYY-MM-DD`).
- **Response (`200 OK`):**
  ```json
  {
    "message": "Capture data deleted successfully",
    "deleted_count": 42
  }
  ```

#### Get App Capture Permissions
`GET /apps`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  [
    {
      "app_id": "msedge.exe",
      "app_name": "Microsoft Edge",
      "allowed_to_capture": true
    }
  ]
  ```

#### Update App Capture Permission
`PUT /apps`
- **Request Body (JSON):**
  - `app_id` (string, required): Executable process identifier.
  - `allowed_to_capture` (boolean, required): Whether screen capture is permitted.
- **Response (`200 OK`):**
  ```json
  {
    "app_id": "msedge.exe",
    "app_name": "Microsoft Edge",
    "allowed_to_capture": false
  }
  ```

#### Query System Logs
`GET /logs`
- **Query Parameters:**
  - `page` (integer, optional, default: `1`): Page number.
  - `limit` (integer, optional, default: `50`): Results per page.
  - `search` (string, optional): Text filter query.
  - `module_name` (string, optional): Filter by module (`vault`, `operator`, `engine`, `memory`, `client`, `message_broker`).
  - `start_date` (string, optional): Date lower bound (`YYYY-MM-DD`).
  - `end_date` (string, optional): Date upper bound (`YYYY-MM-DD`).
- **Response (`200 OK`):**
  ```json
  {
    "logs": [
      {
        "id": 1,
        "module_name": "operator",
        "timestamp": "2026-10-21T10:00:00Z",
        "data": "Capture cycle started"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50
  }
  ```

#### Get Log Configuration
`GET /logs/config`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "retention_period": 30,
    "show_logs_vault": true,
    "show_logs_operator": true,
    "show_logs_engine": true,
    "show_logs_memory": true,
    "show_logs_client": true,
    "show_logs_message_broker": true,
    "store_logs_vault": true,
    "store_logs_operator": true,
    "store_logs_engine": true,
    "store_logs_memory": true,
    "store_logs_client": true,
    "store_logs_message_broker": true
  }
  ```

#### Save Log Configuration
`POST /logs/config`
- **Request Body (JSON):** Full or partial `LogConfig` object.
- **Response (`200 OK`):** Updated `LogConfig` object.

#### Get Redis Configuration
`GET /redis/config`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "REDIS_HOST": "localhost",
    "REDIS_PORT": 6379,
    "REDIS_DB": 0,
    "REDIS_PASSWORD": null,
    "REDIS_PROTOCOL": 2,
    "REDIS_DECODE_RESPONSES": true,
    "SERVER_HOST": "127.0.0.1",
    "SERVER_RELOAD": false
  }
  ```

#### Save Redis Configuration
`POST /redis/config`
- **Request Body (JSON):** Partial or complete `RedisConfig` object.
- **Response (`200 OK`):** Updated `RedisConfig` object.

---

### 2.2 Operator Service (`http://127.0.0.1:9000`)

System automation, screen capture runtime, and window monitoring service.

#### Health Check
`GET /health`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "service": "Operator",
    "status": "online"
  }
  ```

#### Trigger Manual Capture
`POST /capture/trigger`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Capture triggered"
  }
  ```

#### Update Capture Interval
`POST /capture/interval`
- **Request Body (JSON):**
  - `interval_seconds` (integer, required): Periodic capture frequency in seconds (range: 1 - 3600).
- **Response (`200 OK`):**
  ```json
  {
    "interval_seconds": 10
  }
  ```

#### Get Running Applications
`GET /apps/running`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  [
    {
      "app_id": "msedge.exe",
      "app_name": "Microsoft Edge"
    }
  ]
  ```

---

### 2.3 Message Broker Service (`http://127.0.0.1:9002`)

Redis streams event bus and queue telemetry service.

#### Health Check
`GET /health`
- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "service": "Message Broker",
    "status": "online"
  }
  ```

#### List Consumer Groups & Telemetry
`GET /redis/consumer-groups`
- **Query Parameters:**
  - `raw` (boolean, optional, default: `false`): If `true`, returns flat array of group names.
- **Response (`200 OK`):** Array of consumer group telemetry objects.

#### Delete Consumer Group
`DELETE /redis/consumer-groups/{group_name}`
- **Path Parameters:**
  - `group_name` (string, required): Consumer group name.
- **Response (`200 OK`):** Deletion confirmation message.

#### Clean Consumer Group Pending Messages
`POST /redis/clean`
- **Request Body (JSON, Optional):**
  - `group_name` (string, optional): Specific group to clean. Omit to clean all.
  - `reset_stream` (boolean, optional, default: `false`): Reset stream offset to 0.
- **Response (`200 OK`):** Clean summary response.

#### Format Redis Database
`POST /redis/format`
- **Request Body**: None
- **Response (`200 OK`):** Flush confirmation and count of re-initialized streams.

---

## 3. Native Tauri IPC Commands

The Client uses custom Rust IPC commands defined in `src-tauri/src/lib.rs` for frameless window management:

| Command | Description |
|---|---|
| `minimize_window` | Minimizes the active application window to the taskbar. |
| `toggle_maximize_window` | Toggles the window between maximized and restored states. |
| `close_window` | Gracefully closes the desktop application window. |
| `is_window_maximized` | Returns boolean indicating if the window is currently maximized. |

---

## 4. Installation & Startup

### Prerequisites
- **Node.js**: `>= 18.0.0`
- **npm**: `>= 9.0.0`
- **Rust & Cargo**: `>= 1.77.0` (with MSVC C++ Build Tools on Windows)

### Install Dependencies
Run from the `Client/` directory:
```bash
npm install
```

### Start in Web / Dev Server Mode
Runs Vite with Hot Module Replacement in your default browser:
```bash
npm run dev
```

### Start in Desktop App Mode (Tauri)
Runs Vite dev server and compiles/launches the native Tauri desktop window:
```bash
npm run tauri dev
```

### Build Production Bundle
Builds the optimized web assets and standalone native binary (`.exe` on Windows):
```bash
npm run tauri build
```
