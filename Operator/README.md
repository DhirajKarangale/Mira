# Operator

The **Operator** is the desktop capture and system automation service written in **Rust** using **Axum**, **Tokio**, and native **Windows GDI / xcap**.

---

## 1. Purpose

- **Silent Screen Capture**: Automatically captures desktop screen frames in the background at regular intervals defined by `CAPTURE_INTERVAL_SECS`.
- **Active App Detection & Filtering**: Detects the active foreground process before capture. Applications where `allowed_to_capture = false` are automatically skipped.
- **System App Discovery & Sync**: Scans installed applications and window processes, refreshes them with Vault, and tracks restricted applications.
- **Message Broker Job Queuing**: Streams capture jobs asynchronously to the Message Broker (`screenshot_process` consumer group) for downstream processing.
- **Screenshot Cleanup**: Deletes processed screenshot files from disk on demand.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

Checks if the service is online and healthy.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "service": "Operator",
    "status": "online"
  }
  ```

---

### 2.2 Capture Status
`GET /status`

Retrieves the live operational status of the background capture engine.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "service": "Operator",
    "status": "started",
    "is_running": true,
    "is_capturing": true,
    "auto_start": false,
    "capture_interval_secs": 10
  }
  ```

---

### 2.3 Start Capture
`POST /start`

Initiates the continuous background screen capture loop.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "status": "started",
    "message": "Screenshot capture loop started successfully",
    "capture_interval_secs": 10
  }
  ```
- **If already running (`200 OK`):**
  ```json
  {
    "status": "already_running",
    "message": "Screenshot capture is already active",
    "capture_interval_secs": 10
  }
  ```

---

### 2.4 Stop Capture
`POST /stop`

Stops the background screen capture loop.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "status": "stopped",
    "message": "Screenshot capture loop stopped cleanly"
  }
  ```
- **If already stopped (`200 OK`):**
  ```json
  {
    "status": "already_stopped",
    "message": "Screenshot capture is not running"
  }
  ```

---

### 2.5 Get Capture Interval
`GET /interval`

Returns the current screenshot capture interval in seconds.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "capture_interval_secs": 10,
    "status": "ok"
  }
  ```

---

### 2.6 Update Capture Interval
`POST /interval`

Updates the capture interval dynamically in runtime (between 1 and 3600 seconds).

- **Request Body (JSON):**
  - `capture_interval_secs` (integer, required): New interval in seconds.
  ```json
  {
    "capture_interval_secs": 15
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "capture_interval_secs": 15,
    "status": "updated",
    "message": "Capture interval updated to 15s"
  }
  ```

---

### 2.7 Delete Screenshot
`POST /delete`

Deletes a local screenshot file from the filesystem.

- **Request Body (JSON):**
  - `image_path` (string, required): Absolute path to the screenshot file to remove.
  ```json
  {
    "image_path": "E:\\FullStack\\Mira\\Operator\\screenshots\\msedge_20-10-2026T13-13-45.png"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Screenshot deleted successfully"
  }
  ```
- **Response (`404 Not Found`):**
  ```json
  {
    "status": "error",
    "message": "Screenshot file not found"
  }
  ```

---

### 2.8 List Discovered Applications
`GET /apps`

Returns all discovered system applications along with their capture permissions.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  [
    {
      "app_name": "Microsoft Edge",
      "app_id": "msedge.exe",
      "allowed_to_capture": true
    },
    {
      "app_name": "Notepad",
      "app_id": "notepad.exe",
      "allowed_to_capture": false
    }
  ]
  ```

---

### 2.9 Refresh Applications
`POST /apps/refresh`

Re-scans installed system applications and active window processes, synchronizes with Vault, and updates the local restricted set.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Apps refreshed and synchronized with Vault",
    "total_apps": 42
  }
  ```

---

### 2.10 Update App Permission
`POST /apps/permission`

Updates an application's `allowed_to_capture` status and synchronizes the change with Vault.

- **Request Body (JSON):**
  - `app_id` (string, required): Application identifier (e.g. `notepad.exe`).
  - `allowed_to_capture` (boolean, required): Whether screen capture is permitted when this app is active.
  ```json
  {
    "app_id": "notepad.exe",
    "allowed_to_capture": false
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "App permission updated successfully",
    "app_id": "notepad.exe",
    "allowed_to_capture": false
  }
  ```

---

## 3. Screenshot Job Object Schema

Every captured frame produces a job sent to Message Broker (`POST /jobs`):

| Field | Type | Description |
| :--- | :--- | :--- |
| `job_id` | `String` (UUID v4) | Unique identifier for the capture frame. |
| `consumer_key` | `String` | Stream routing key (`screenshot_process`). |
| `os` | `String` | Host operating system retrieved from Vault (`Windows 11`, `macOS`, `Linux`). |
| `app_name` | `String` | Active foreground process name (e.g. `msedge.exe`, `Code.exe`). |
| `timestamp` | `String` | Formatted timestamp: `dd/mm/yyyyTHH:mm:ss`. |
| `image_path` | `String` | Absolute path to the saved PNG screenshot file on the host filesystem. |

**Example Job Object:**
```json
{
  "job_id": "786a78ce-e62d-4108-9e4e-5349fceb7e9c",
  "consumer_key": "screenshot_process",
  "os": "Windows 11",
  "app_name": "msedge.exe",
  "timestamp": "20/10/2026T13:13:45",
  "image_path": "E:\\FullStack\\Mira\\Operator\\screenshots\\msedge_20-10-2026T13-13-45.png"
}
```

---

## 4. Installation & Startup

### Install Dependencies
Dependencies and toolchain prerequisites are specified in `Cargo.toml` and `dependencies.txt`.
```bash
cargo check
```

### Start Server
Run from the `Operator/` directory:
```bash
cargo run -- --port 9003
```
