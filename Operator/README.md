# Operator

The **Operator** is the high-performance system automation and desktop capture service written in **Rust** using **Axum**, **Tokio**, and **GDI / xcap**.

---

## 1. What It Does

- **Silent Screen Capture**: Captures desktop screen frames silently in the background at regular intervals without showing any notifications or interrupting user workflows.
- **Active Application Detection**: Identifies the currently active foreground application executable name or window title at the exact moment of each capture.
- **Job Generation & Queuing**: Formulates screenshot job objects with UUIDs, formatted timestamps, and image metadata, and streams them asynchronously to the **Message Broker** (`screenshot_process` consumer group) for the Memory module to process.
- **Vault Configuration & Encrypted Logging**: Automatically pulls runtime configurations (including `CAPTURE_INTERVAL_SECS`) from Vault at startup and delivers asynchronous lifecycle and dispatch logs to Vault's encrypted log repository.
- **Clean Background Lifecycle Management**: Exposes lightweight HTTP control APIs to initiate continuous background capture loops and cleanly terminate them.

---

## 2. API Reference

### 2.1 Service Health
`GET /` or `GET /health`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Operator",
    "status": "online",
    "version": "1.0.0"
  }
  ```

---

### 2.2 Start Screenshot Capture
`GET /start` or `GET /capture/start`

Initiates the continuous background capture loop ticking every `CAPTURE_INTERVAL_SECS`.

- **Response (`200 OK`):**
  ```json
  {
    "status": "started",
    "message": "Screenshot capture loop started successfully",
    "capture_interval_secs": 10
  }
  ```
- **If already running:**
  ```json
  {
    "status": "already_running",
    "message": "Screenshot capture is already active",
    "capture_interval_secs": 10
  }
  ```

---

### 2.3 Stop Screenshot Capture
`GET /stop` or `GET /capture/stop`

Cleanly signals the background capture task to terminate.

- **Response (`200 OK`):**
  ```json
  {
    "status": "stopped",
    "message": "Screenshot capture loop stopped cleanly"
  }
  ```
- **If not running:**
  ```json
  {
    "status": "already_stopped",
    "message": "Screenshot capture is not running"
  }
  ```

---

### 2.4 Capture Service Status
`GET /status` or `GET /capture/status`

Returns the current capture state, interval, total capture count, and metadata of the most recent job.

- **Response (`200 OK`):**
  ```json
  {
    "is_running": true,
    "capture_interval_secs": 10,
    "total_captures": 14,
    "last_job": {
      "job_id": "786a78ce-e62d-4108-9e4e-5349fceb7e9c",
      "consumer_key": "screenshot_process",
      "app_name": "msedge.exe",
      "timestamp": "20/10/2026T13:13:45",
      "image_path": "E:\\FullStack\\Mira\\Operator\\screenshots\\786a78ce-e62d-4108-9e4e-5349fceb7e9c.png",
      "width": 1536,
      "height": 864
    }
  }
  ```

---

## 3. Screenshot Job Object Schema

Every captured frame produces a job sent to Message Broker (`POST /jobs`):

| Field | Type | Description |
| :--- | :--- | :--- |
| `job_id` | `String` (UUID v4) | Unique identifier for the capture frame. |
| `consumer_key` | `String` | Stream routing key (`screenshot_process`). |
| `app_name` | `String` | Active foreground process name (e.g. `chrome.exe`, `Code.exe`). |
| `timestamp` | `String` | Formatted timestamp: `dd/mm/yyyyTHH:mm:ss`. |
| `image_path` | `String` | Absolute path to the saved PNG screenshot file. |
| `width` | `u32` (optional) | Screen pixel width. |
| `height` | `u32` (optional) | Screen pixel height. |

---

## 4. Module Architecture

```text
Operator/
├── Cargo.toml
├── README.md
├── screenshots/          # Output directory for silent screenshot frames
└── src/
    ├── main.rs           # Entrypoint, server boot, tracing setup
    ├── config.rs         # Vault configuration fetcher and in-memory cache
    ├── vault_logger.rs   # Asynchronous encrypted audit logging to Vault
    ├── broker_client.rs  # Message Broker HTTP and Redis job dispatcher
    ├── capture.rs        # Silent screen capture engine and active window detection
    ├── flow.rs           # Background capture loop and lifecycle manager
    └── api.rs            # Axum HTTP routes and handlers
```

---

## 5. How to Run

### Prerequisites
- Rust 1.75+
- MinGW / GCC or MSVC C++ toolchain

### Build
```bash
cd Operator
cargo build --release
```

### Run
```bash
# Default (port 8002):
cargo run

# Specify custom port parameter:
cargo run -- --port 8005

# Or running the binary directly:
./target/release/operator.exe --port 8002
./target/release/operator.exe 8002
```
Default listening address: `http://127.0.0.1:8002`
