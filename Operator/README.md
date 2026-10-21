# Operator

The **Operator** is the desktop screen capture and system automation service written in **Rust** using **Axum**, **Tokio**, and native **Windows GDI / xcap**.

---

## 1. Purpose

- **Silent Screen Capture**: Captures desktop frames in the background at regular intervals defined by `CAPTURE_INTERVAL_SECS`.
- **Active App Detection & Filtering**: Detects foreground processes; automatically skips capture if an application has `allowed_to_capture = false`.
- **System App Discovery & Sync**: Scans installed apps and active window processes, refreshing them with Vault.
- **Message Broker Job Queuing**: Streams capture jobs asynchronously to the Message Broker (`screenshot_process` consumer group).
- **Screenshot Cleanup**: Deletes local screenshot files on demand.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

Checks if the service is online.

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

Retrieves operational status and current capture interval.

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

---

### 2.5 Update Capture Interval
`POST /interval`

Updates the capture interval dynamically (1-3600 seconds).

- **Request Body (JSON):**
  ```json
  {
    "capture_interval_secs": 15
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "updated",
    "capture_interval_secs": 15
  }
  ```

---

### 2.6 Delete Screenshot
`POST /delete`

Deletes a local screenshot file from disk.

- **Request Body (JSON):**
  ```json
  {
    "image_path": "E:/Screenshots/msedge_frame.png"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Screenshot deleted successfully"
  }
  ```

---

### 2.7 List Discovered Applications
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
    }
  ]
  ```

---

### 2.8 Refresh Applications
`POST /apps/refresh`

Re-scans installed system applications and window processes, synchronizing with Vault.

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

### 2.9 Update App Permission
`POST /apps/permission`

Updates an application's capture permission and syncs the change with Vault.

- **Request Body (JSON):**
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
    "app_id": "notepad.exe",
    "allowed_to_capture": false
  }
  ```

---

## 3. Installation & Startup

### Install Dependencies
Managed via Cargo:
```bash
cargo check
```

### Start Server
Run from the `Operator/` directory:
```bash
cargo run
```
Or with explicit port:
```bash
cargo run -- --port 9004
```
