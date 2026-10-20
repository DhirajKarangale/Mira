use axum::{
    extract::State,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::json;

use crate::flow::CaptureManager;

#[derive(Clone)]
pub struct AppState {
    pub manager: CaptureManager,
}

/// Create and configure the Axum router with all Operator endpoints
pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root_handler))
        .route("/health", get(root_handler))
        .route("/start", get(start_capture_handler))
        .route("/stop", get(stop_capture_handler))
        .route("/status", get(status_handler))
        .route("/capture/start", get(start_capture_handler))
        .route("/capture/stop", get(stop_capture_handler))
        .route("/capture/status", get(status_handler))
        .with_state(state)
}

/// Service health and information endpoint
async fn root_handler() -> impl IntoResponse {
    Json(json!({
        "service": "Operator",
        "status": "online",
        "version": "1.0.0"
    }))
}

/// GET endpoint to start continuous background screenshot capture
async fn start_capture_handler(State(state): State<AppState>) -> impl IntoResponse {
    let interval = crate::config::get_config().capture_interval_secs;
    match state.manager.start_capture().await {
        Ok(true) => Json(json!({
            "status": "started",
            "message": "Screenshot capture loop started successfully",
            "capture_interval_secs": interval
        })),
        Ok(false) => Json(json!({
            "status": "already_running",
            "message": "Screenshot capture is already active",
            "capture_interval_secs": interval
        })),
        Err(err) => Json(json!({
            "status": "error",
            "message": format!("Failed to start capture: {}", err)
        })),
    }
}

/// GET endpoint to stop continuous background screenshot capture cleanly
async fn stop_capture_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.manager.stop_capture().await {
        Ok(true) => Json(json!({
            "status": "stopped",
            "message": "Screenshot capture loop stopped cleanly"
        })),
        Ok(false) => Json(json!({
            "status": "already_stopped",
            "message": "Screenshot capture is not running"
        })),
        Err(err) => Json(json!({
            "status": "error",
            "message": format!("Failed to stop capture: {}", err)
        })),
    }
}

/// GET endpoint to check current capture service status
async fn status_handler(State(state): State<AppState>) -> impl IntoResponse {
    let status = state.manager.get_status().await;
    Json(json!(status))
}
