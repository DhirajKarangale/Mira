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

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/status", get(status_handler))
        .route("/start", post(start_capture_handler))
        .route("/stop", post(stop_capture_handler))
        .route("/interval", get(get_interval_handler).post(update_interval_handler))
        .route("/delete", post(delete_screenshot_handler))
        .route("/apps", get(get_apps_handler))
        .route("/apps/refresh", post(refresh_apps_handler))
        .route("/apps/permission", post(update_app_permission_handler))
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

async fn get_interval_handler() -> impl IntoResponse {
    let interval = crate::config::get_capture_interval_secs();
    (
        StatusCode::OK,
        Json(json!({
            "capture_interval_secs": interval,
            "status": "ok"
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
            "capture_interval_secs": interval
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
    let apps = state.permissions.get_all_apps().await;
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

