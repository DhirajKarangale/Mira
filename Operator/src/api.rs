use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tracing::{error, info, warn};

use crate::flow::CaptureManager;
use crate::permissions::PermissionsManager;

#[derive(Clone)]
pub struct AppState {
    pub manager: CaptureManager,
    pub permissions: PermissionsManager,
    pub microphone: crate::microphone::MicrophoneManager,
}

#[derive(Debug, Deserialize)]
pub struct DeleteScreenshotRequest {
    pub image_path: String,
}

#[derive(Debug, Deserialize)]
pub struct IntervalRequest {
    pub capture_interval_secs: Option<u64>,
    pub interval_secs: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePermissionRequest {
    pub app_id: String,
    pub allowed_to_capture: bool,
}

#[derive(Debug, Deserialize)]
pub struct MicrophoneStateRequest {
    pub state: Option<String>,
    pub enabled: Option<bool>,
    pub is_on: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MicrophoneAutoStartRequest {
    pub auto_start: Option<bool>,
    pub mic_auto_start: Option<bool>,
    pub enabled: Option<bool>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/status", get(status_handler))
        .route("/start", post(start_capture_handler))
        .route("/stop", post(stop_capture_handler))
        .route("/interval", post(update_interval_handler))
        .route("/delete", post(delete_screenshot_handler))
        .route("/apps", get(get_apps_handler))
        .route("/apps/refresh", post(refresh_apps_handler))
        .route("/apps/permission", post(update_app_permission_handler))
        // Microphone routes
        .route("/microphone", get(get_microphone_status_handler).post(set_microphone_state_handler))
        .route("/microphone/status", get(get_microphone_status_handler))
        .route("/microphone/state", get(get_microphone_state_handler).post(set_microphone_state_handler))
        .route("/microphone/start", post(start_microphone_handler))
        .route("/microphone/stop", post(stop_microphone_handler))
        .route("/microphone/auto-start", get(get_microphone_auto_start_handler).post(update_microphone_auto_start_handler))
        .with_state(state)
}

async fn health_handler() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "service": "Operator",
            "status": "online"
        })),
    )
}

async fn update_interval_handler(Json(payload): Json<IntervalRequest>) -> impl IntoResponse {
    let secs = payload.capture_interval_secs.or(payload.interval_secs);
    if let Some(s) = secs {
        if s >= 1 && s <= 3600 {
            crate::config::set_capture_interval_secs(s);
            info!("Operator capture interval updated to {}s via API", s);
            crate::vault_logger::log_event(format!("Capture interval updated to {}s", s));
            return (
                StatusCode::OK,
                Json(json!({
                    "capture_interval_secs": s,
                    "status": "updated",
                    "message": format!("Capture interval updated to {}s", s)
                })),
            );
        }
    }
    (
        StatusCode::BAD_REQUEST,
        Json(json!({
            "status": "error",
            "message": "Invalid capture_interval_secs, must be between 1 and 3600 seconds"
        })),
    )
}

async fn status_handler(State(state): State<AppState>) -> impl IntoResponse {
    let local = crate::local_state::load_local_state();
    let running = state.manager.is_running() || local.is_capturing;
    let interval = crate::config::get_capture_interval_secs();
    let auto_start = crate::config::get_config().auto_start;
    (
        StatusCode::OK,
        Json(json!({
            "service": "Operator",
            "status": if running { "started" } else { "stopped" },
            "is_running": running,
            "is_capturing": running,
            "auto_start": auto_start,
            "capture_interval_secs": interval,
            "microphone_state": state.microphone.get_state(),
            "is_microphone_on": state.microphone.is_on(),
            "mic_auto_start": state.microphone.get_auto_start()
        })),
    )
}

async fn start_capture_handler(State(state): State<AppState>) -> impl IntoResponse {
    let interval = crate::config::get_capture_interval_secs();
    match state.manager.start_capture().await {
        Ok(true) => (
            StatusCode::OK,
            Json(json!({
                "status": "started",
                "message": "Screenshot capture loop started successfully",
                "capture_interval_secs": interval
            })),
        ),
        Ok(false) => (
            StatusCode::OK,
            Json(json!({
                "status": "already_running",
                "message": "Screenshot capture is already active",
                "capture_interval_secs": interval
            })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": format!("Failed to start capture: {}", err)
            })),
        ),
    }
}

async fn stop_capture_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.manager.stop_capture().await {
        Ok(true) => (
            StatusCode::OK,
            Json(json!({
                "status": "stopped",
                "message": "Screenshot capture loop stopped cleanly"
            })),
        ),
        Ok(false) => (
            StatusCode::OK,
            Json(json!({
                "status": "already_stopped",
                "message": "Screenshot capture is not running"
            })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": format!("Failed to stop capture: {}", err)
            })),
        ),
    }
}

async fn delete_screenshot_handler(
    Json(payload): Json<DeleteScreenshotRequest>,
) -> impl IntoResponse {
    let trimmed = payload.image_path.trim();
    if trimmed.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "message": "Missing or empty 'image_path' parameter"
            })),
        );
    }

    let path = std::path::Path::new(trimmed);
    if !path.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({
                "status": "error",
                "message": "Screenshot file not found"
            })),
        );
    }

    match std::fs::remove_file(path) {
        Ok(_) => {
            info!("Successfully deleted screenshot file: {}", trimmed);
            crate::vault_logger::log_event(format!("Deleted screenshot: {}", trimmed));
            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "message": "Screenshot deleted successfully"
                })),
            )
        }
        Err(err) => {
            error!("Failed to delete screenshot file at {}: {}", trimmed, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": format!("Failed to delete screenshot: {}", err)
                })),
            )
        }
    }
}

async fn get_apps_handler(State(state): State<AppState>) -> impl IntoResponse {
    let mut apps = state.permissions.get_all_apps().await;
    if apps.is_empty() {
        if let Ok(_) = state.permissions.sync_with_vault().await {
            apps = state.permissions.get_all_apps().await;
        }
    }
    (StatusCode::OK, Json(apps))
}

async fn refresh_apps_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.permissions.sync_with_vault().await {
        Ok(_) => {
            let apps = state.permissions.get_all_apps().await;
            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "message": "Apps refreshed and synchronized with Vault",
                    "total_apps": apps.len()
                })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": format!("Failed to refresh apps: {}", e)
            })),
        ),
    }
}

async fn update_app_permission_handler(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdatePermissionRequest>,
) -> impl IntoResponse {
    let app_id = payload.app_id.trim();
    if app_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "message": "Missing or empty 'app_id'"
            })),
        );
    }

    state
        .permissions
        .update_permission(app_id, payload.allowed_to_capture)
        .await;

    let is_from_vault = headers
        .get("X-Source")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("vault"))
        .unwrap_or(false);

    if !is_from_vault {
        if let Err(e) = state
            .permissions
            .sync_permission_to_vault(app_id, payload.allowed_to_capture)
            .await
        {
            warn!("Failed to sync permission update to Vault: {}", e);
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "message": "App permission updated successfully",
            "app_id": app_id,
            "allowed_to_capture": payload.allowed_to_capture
        })),
    )
}

// =============================================================================
// Microphone Handlers
// =============================================================================

async fn get_microphone_status_handler(State(state): State<AppState>) -> impl IntoResponse {
    let mic_state = state.microphone.get_state();
    let is_on = state.microphone.is_on();
    let auto_start = state.microphone.get_auto_start();
    (
        StatusCode::OK,
        Json(json!({
            "service": "Operator",
            "state": mic_state,
            "is_on": is_on,
            "auto_start": auto_start,
            "mic_auto_start": auto_start,
            "message": format!("Microphone is {}", mic_state)
        })),
    )
}

async fn get_microphone_state_handler(State(state): State<AppState>) -> impl IntoResponse {
    let mic_state = state.microphone.get_state();
    let is_on = state.microphone.is_on();
    (
        StatusCode::OK,
        Json(json!({
            "state": mic_state,
            "is_on": is_on
        })),
    )
}

async fn start_microphone_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.microphone.start().await {
        Ok(true) => (
            StatusCode::OK,
            Json(json!({
                "status": "started",
                "state": "on",
                "is_on": true,
                "message": "Microphone turned on"
            })),
        ),
        Ok(false) => (
            StatusCode::OK,
            Json(json!({
                "status": "already_started",
                "state": "on",
                "is_on": true,
                "message": "Microphone is already on"
            })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": e
            })),
        ),
    }
}

async fn stop_microphone_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.microphone.stop().await {
        Ok(true) => (
            StatusCode::OK,
            Json(json!({
                "status": "stopped",
                "state": "off",
                "is_on": false,
                "message": "Microphone turned off"
            })),
        ),
        Ok(false) => (
            StatusCode::OK,
            Json(json!({
                "status": "already_stopped",
                "state": "off",
                "is_on": false,
                "message": "Microphone is already off"
            })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": e
            })),
        ),
    }
}

async fn set_microphone_state_handler(
    State(state): State<AppState>,
    Json(payload): Json<MicrophoneStateRequest>,
) -> impl IntoResponse {
    let should_start = if let Some(ref s) = payload.state {
        s.trim().eq_ignore_ascii_case("on") || s.trim().eq_ignore_ascii_case("start")
    } else if let Some(e) = payload.enabled {
        e
    } else if let Some(on) = payload.is_on {
        on
    } else {
        false
    };

    if should_start {
        let _ = state.microphone.start().await;
    } else {
        let _ = state.microphone.stop().await;
    }

    let current_state = state.microphone.get_state();
    let is_on = state.microphone.is_on();

    (
        StatusCode::OK,
        Json(json!({
            "status": if is_on { "started" } else { "stopped" },
            "state": current_state,
            "is_on": is_on,
            "message": format!("Microphone turned {}", current_state)
        })),
    )
}

async fn get_microphone_auto_start_handler(State(state): State<AppState>) -> impl IntoResponse {
    let auto_start = state.microphone.get_auto_start();
    (
        StatusCode::OK,
        Json(json!({
            "auto_start": auto_start,
            "mic_auto_start": auto_start
        })),
    )
}

async fn update_microphone_auto_start_handler(
    State(state): State<AppState>,
    Json(payload): Json<MicrophoneAutoStartRequest>,
) -> impl IntoResponse {
    let enabled = payload
        .auto_start
        .or(payload.mic_auto_start)
        .or(payload.enabled)
        .unwrap_or(false);

    state.microphone.set_auto_start(enabled).await;

    (
        StatusCode::OK,
        Json(json!({
            "status": "updated",
            "auto_start": enabled,
            "mic_auto_start": enabled,
            "message": format!("Microphone auto-start setting updated to {}", if enabled { "ON" } else { "OFF" })
        })),
    )
}
