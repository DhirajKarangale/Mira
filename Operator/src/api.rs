use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tracing::{error, info};

use crate::flow::CaptureManager;

#[derive(Clone)]
pub struct AppState {
    pub manager: CaptureManager,
}

#[derive(Debug, Deserialize)]
pub struct DeleteScreenshotRequest {
    pub image_path: String,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root_handler))
        .route("/health", get(root_handler))
        .route("/status", get(status_handler).post(status_handler))
        .route("/start", get(start_capture_handler).post(start_capture_handler))
        .route("/stop", get(stop_capture_handler).post(stop_capture_handler))
        .route("/delete", post(delete_screenshot_handler))
        .with_state(state)
}

async fn root_handler() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "service": "Operator",
            "status": "online"
        })),
    )
}

async fn status_handler(State(state): State<AppState>) -> impl IntoResponse {
    let running = state.manager.is_running();
    let interval = crate::config::get_config().capture_interval_secs;
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
    let interval = crate::config::get_config().capture_interval_secs;
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
