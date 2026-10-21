use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{watch, Mutex};
use tracing::{error, info, warn};

use crate::broker_client::dispatch_screenshot_job;
use crate::capture::capture_silent_screenshot;
use crate::vault_logger;

#[derive(Clone)]
pub struct CaptureManager {
    is_running: Arc<AtomicBool>,
    stop_sender: Arc<Mutex<Option<watch::Sender<bool>>>>,
    permissions: crate::permissions::PermissionsManager,
}

impl CaptureManager {
    pub fn new(permissions: crate::permissions::PermissionsManager) -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            stop_sender: Arc::new(Mutex::new(None)),
            permissions,
        }
    }

    #[allow(dead_code)]
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub async fn start_capture(&self) -> Result<bool, &'static str> {
        let mut sender_guard = self.stop_sender.lock().await;

        if self.is_running.load(Ordering::SeqCst) {
            return Ok(false);
        }

        let interval_secs = crate::config::refresh_capture_interval_from_vault().await;
        let (tx, mut rx) = watch::channel(false);
        *sender_guard = Some(tx);
        self.is_running.store(true, Ordering::SeqCst);

        let running_flag = self.is_running.clone();
        let permissions = self.permissions.clone();

        info!(
            "Starting continuous silent background screenshot capture with interval {}s",
            interval_secs
        );
        vault_logger::log_event(format!(
            "Started screenshot capture service (interval: {}s)",
            interval_secs
        ));
        crate::local_state::save_local_state(true);

        tokio::spawn(async move {
            let mut current_interval = interval_secs;
            let mut ticker = tokio::time::interval(Duration::from_secs(current_interval));
            ticker.tick().await;

            loop {
                tokio::select! {
                    _ = rx.changed() => {
                        if *rx.borrow() {
                            info!("Background capture loop received termination signal.");
                            break;
                        }
                    }
                    _ = ticker.tick() => {
                        if !running_flag.load(Ordering::SeqCst) {
                            break;
                        }

                        // Seamless dynamic interval adjustment
                        let latest_interval = crate::config::get_capture_interval_secs();
                        if latest_interval >= 1 && latest_interval != current_interval {
                            info!(
                                "Capture interval dynamically changed from {}s to {}s. Updating ticker.",
                                current_interval, latest_interval
                            );
                            current_interval = latest_interval;
                            ticker = tokio::time::interval(Duration::from_secs(current_interval));
                            ticker.tick().await;
                        }

                        let active_app_id = crate::capture::get_active_app_id();
                        if !permissions.is_allowed(&active_app_id).await {
                            info!(
                                "Ignoring screenshot: active application '{}' is restricted from capture",
                                active_app_id
                            );
                            continue;
                        }

                        let capture_result = tokio::task::spawn_blocking(capture_silent_screenshot).await;

                        match capture_result {
                            Ok(Ok(captured)) => {
                                info!(
                                    "Captured silent screenshot: {} | App: '{}' | Path: {}",
                                    captured.job.job_id, captured.job.app_name, captured.job.image_path
                                );

                                if let Err(e) = dispatch_screenshot_job(&captured.job).await {
                                    warn!("Failed to dispatch job to Message Broker: {}", e);
                                }
                            }
                            Ok(Err(err)) => {
                                error!("Failed to capture silent screenshot: {}", err);
                                vault_logger::log_event(format!("Capture error: {}", err));
                            }
                            Err(join_err) => {
                                error!("Capture thread panicked or failed: {}", join_err);
                            }
                        }
                    }
                }
            }

            running_flag.store(false, Ordering::SeqCst);
            crate::local_state::save_local_state(false);
            info!("Background screenshot capture loop exited cleanly.");
        });

        Ok(true)
    }

    pub async fn stop_capture(&self) -> Result<bool, &'static str> {
        let mut sender_guard = self.stop_sender.lock().await;

        if !self.is_running.load(Ordering::SeqCst) {
            crate::local_state::save_local_state(false);
            return Ok(false);
        }

        if let Some(tx) = sender_guard.take() {
            let _ = tx.send(true);
        }

        self.is_running.store(false, Ordering::SeqCst);
        crate::local_state::save_local_state(false);
        info!("Stopped background screenshot capture loop.");
        vault_logger::log_event("Stopped screenshot capture service");

        Ok(true)
    }
}
