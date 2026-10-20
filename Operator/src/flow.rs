use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{watch, Mutex, RwLock};
use tracing::{error, info, warn};

use crate::broker_client::{dispatch_screenshot_job, ScreenshotJob};
use crate::capture::capture_silent_screenshot;
use crate::vault_logger;

#[derive(Clone)]
pub struct CaptureManager {
    is_running: Arc<AtomicBool>,
    stop_sender: Arc<Mutex<Option<watch::Sender<bool>>>>,
    total_captures: Arc<AtomicU64>,
    last_job: Arc<RwLock<Option<ScreenshotJob>>>,
}

#[derive(Debug, serde::Serialize)]
pub struct CaptureStatus {
    pub is_running: bool,
    pub capture_interval_secs: u64,
    pub total_captures: u64,
    pub last_job: Option<ScreenshotJob>,
}

impl CaptureManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            stop_sender: Arc::new(Mutex::new(None)),
            total_captures: Arc::new(AtomicU64::new(0)),
            last_job: Arc::new(RwLock::new(None)),
        }
    }

    /// Check if capture loop is currently active
    #[allow(dead_code)]
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// Start continuous background screenshot capture
    pub async fn start_capture(&self) -> Result<bool, &'static str> {
        let mut sender_guard = self.stop_sender.lock().await;

        if self.is_running.load(Ordering::SeqCst) {
            return Ok(false); // Already running
        }

        let interval_secs = crate::config::get_config().capture_interval_secs;
        let (tx, mut rx) = watch::channel(false);
        *sender_guard = Some(tx);
        self.is_running.store(true, Ordering::SeqCst);

        let running_flag = self.is_running.clone();
        let total_captures = self.total_captures.clone();
        let last_job = self.last_job.clone();

        info!(
            "Starting continuous silent background screenshot capture with interval {}s",
            interval_secs
        );
        vault_logger::log_event(format!(
            "Started screenshot capture service (interval: {}s)",
            interval_secs
        ));

        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
            // First tick completes immediately; tick once before loop or let it run
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

                        // Run capture in blocking thread to avoid blocking Tokio worker threads
                        let capture_result = tokio::task::spawn_blocking(capture_silent_screenshot).await;

                        match capture_result {
                            Ok(Ok(captured)) => {
                                total_captures.fetch_add(1, Ordering::SeqCst);
                                {
                                    let mut job_write = last_job.write().await;
                                    *job_write = Some(captured.job.clone());
                                }

                                info!(
                                    "Captured silent screenshot: {} | App: '{}' | Path: {}",
                                    captured.job.job_id, captured.job.app_name, captured.job.image_path
                                );

                                // Dispatch job object to Message Broker
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
            info!("Background screenshot capture loop exited cleanly.");
        });

        Ok(true)
    }

    /// Stop continuous background screenshot capture cleanly
    pub async fn stop_capture(&self) -> Result<bool, &'static str> {
        let mut sender_guard = self.stop_sender.lock().await;

        if !self.is_running.load(Ordering::SeqCst) {
            return Ok(false); // Already stopped
        }

        if let Some(tx) = sender_guard.take() {
            let _ = tx.send(true);
        }

        self.is_running.store(false, Ordering::SeqCst);
        info!("Stopped background screenshot capture loop.");
        vault_logger::log_event("Stopped screenshot capture service");

        Ok(true)
    }

    /// Get current capture service status
    pub async fn get_status(&self) -> CaptureStatus {
        let is_running = self.is_running.load(Ordering::SeqCst);
        let capture_interval_secs = crate::config::get_config().capture_interval_secs;
        let total_captures = self.total_captures.load(Ordering::SeqCst);
        let last_job = self.last_job.read().await.clone();

        CaptureStatus {
            is_running,
            capture_interval_secs,
            total_captures,
            last_job,
        }
    }
}
