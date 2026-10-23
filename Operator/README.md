# Operator

The **Operator** is the desktop screen capture and system automation service written in **Rust** using **Axum**, **Tokio**, and native **Windows GDI / xcap**.

---

## 1. Purpose

- **Silent Screen Capture**: Captures desktop frames at regular intervals defined by `CAPTURE_INTERVAL_SECS`.
- **Active App Filtering**: Detects foreground processes and enforces application capture permissions.
- **System App Discovery**: Scans installed applications and synchronizes state with Vault.
- **Message Broker Queuing**: Dispatches capture jobs asynchronously to the Message Broker `ocr_extraction` stream.
- **Screenshot Cleanup**: Deletes local screenshot files on demand via API.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Operator", "status": "online" }
  ```

---

### 2.2 Capture Status
`GET /status`

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

- **Response (`200 OK`):**
  ```json
  { "status": "started", "capture_interval_secs": 10 }
  ```

---

### 2.4 Stop Capture
`POST /stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped" }
  ```

---

### 2.5 Update Capture Interval
`POST /interval`

- **Request Body (JSON):**
  ```json
  { "capture_interval_secs": 15 }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "updated", "capture_interval_secs": 15 }
  ```

---

### 2.6 Delete Screenshot
`POST /delete`

- **Request Body (JSON):**
  ```json
  { "image_path": "E:/FullStack/Mira/Operator/screenshots/frame.png" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Screenshot deleted successfully" }
  ```

---

### 2.7 Get Applications & Permissions
`GET /apps`

- **Response (`200 OK`):**
  ```json
  [
    { "app_name": "Visual Studio Code", "app_id": "code.exe", "allowed_to_capture": true }
  ]
  ```

---

### 2.8 Refresh Applications
`POST /apps/refresh`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "total_apps": 25 }
  ```

---

### 2.9 Update App Permission
`POST /apps/permission`

- **Request Body (JSON):**
  ```json
  { "app_id": "chrome.exe", "allowed_to_capture": false }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "app_id": "chrome.exe", "allowed_to_capture": false }
  ```

---

## 3. Installation & Startup

### Install Dependencies
Dependencies are managed in `Cargo.toml`. Requires Rust toolchain:
```bash
cargo build
```

### Start Server
Run from the `Operator/` directory:
```bash
cargo run -- --host 127.0.0.1 --port 9003
```
Or build release binary:
```bash
cargo build --release
./target/release/operator --host 127.0.0.1 --port 9003
```
