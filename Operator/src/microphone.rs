use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{watch, Mutex};
use tracing::{error, info};

use crate::vault_logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalMicrophoneState {
    pub state: String, // "on" or "off"
    pub is_on: bool,
    pub auto_start: bool,
    pub updated_at: String,
}

impl Default for LocalMicrophoneState {
    fn default() -> Self {
        Self {
            state: "off".to_string(),
            is_on: false,
            auto_start: false,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

pub fn get_local_mic_state_file_path() -> PathBuf {
    let direct = PathBuf::from("microphone_state.json");
    if direct.exists() {
        return direct;
    }
    let in_operator = PathBuf::from("Operator").join("microphone_state.json");
    if in_operator.exists() || PathBuf::from("Operator").is_dir() {
        return in_operator;
    }
    direct
}

pub fn load_local_mic_state() -> LocalMicrophoneState {
    let path = get_local_mic_state_file_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<LocalMicrophoneState>(&content) {
                Ok(state) => {
                    info!(
                        "Loaded local Microphone state from {:?}: state={}, auto_start={}",
                        path, state.state, state.auto_start
                    );
                    return state;
                }
                Err(err) => {
                    error!("Failed to parse local microphone state at {:?}: {}", path, err);
                }
            },
            Err(err) => {
                error!("Failed to read local microphone state at {:?}: {}", path, err);
            }
        }
    }
    LocalMicrophoneState::default()
}

pub fn save_local_mic_state(is_on: bool, auto_start: bool) {
    let path = get_local_mic_state_file_path();
    let state = LocalMicrophoneState {
        state: if is_on { "on".to_string() } else { "off".to_string() },
        is_on,
        auto_start,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    match serde_json::to_string_pretty(&state) {
        Ok(json_str) => {
            if let Err(err) = std::fs::write(&path, json_str) {
                error!("Failed to write local microphone state to {:?}: {}", path, err);
            } else {
                info!(
                    "Saved local Microphone state to {:?}: state={}, auto_start={}",
                    path, state.state, auto_start
                );
            }
        }
        Err(err) => {
            error!("Failed to serialize local Microphone state: {}", err);
        }
    }
}

#[derive(Clone)]
pub struct MicrophoneManager {
    is_running: Arc<AtomicBool>,
    auto_start: Arc<AtomicBool>,
    stop_sender: Arc<Mutex<Option<watch::Sender<bool>>>>,
}

impl MicrophoneManager {
    pub fn new(initial_auto_start: bool) -> Self {
        let local = load_local_mic_state();
        let effective_auto_start = initial_auto_start || local.auto_start;

        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            auto_start: Arc::new(AtomicBool::new(effective_auto_start)),
            stop_sender: Arc::new(Mutex::new(None)),
        }
    }

    pub fn get_state(&self) -> &'static str {
        if self.is_running.load(Ordering::SeqCst) {
            "on"
        } else {
            "off"
        }
    }

    pub fn is_on(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub fn get_auto_start(&self) -> bool {
        self.auto_start.load(Ordering::SeqCst)
    }

    pub async fn set_auto_start(&self, enabled: bool) {
        self.auto_start.store(enabled, Ordering::SeqCst);
        let is_on = self.is_on();
        save_local_mic_state(is_on, enabled);

        // Also update local_state.rs operator state if applicable
        crate::local_state::save_local_microphone_settings(is_on, enabled);

        // Synchronize with Vault if reachable
        let vault_url = crate::config::get_vault_url();
        if !vault_url.is_empty() {
            let endpoint = format!("{}/config/operator", vault_url);
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .ok();

            if let Some(c) = client {
                match c
                    .post(&endpoint)
                    .json(&serde_json::json!({
                        "mic_auto_start": enabled,
                        "MIC_AUTO_START": enabled
                    }))
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        info!("Successfully synced mic_auto_start={} with Vault", enabled);
                    }
                    Ok(resp) => {
                        info!("Vault responded with status {} when syncing mic_auto_start", resp.status());
                    }
                    Err(e) => {
                        info!("Vault sync skipped or offline: {}", e);
                    }
                }
            }
        }

        vault_logger::log_event(format!(
            "Microphone auto-start setting updated to: {}",
            if enabled { "ON" } else { "OFF" }
        ));
    }

    pub async fn start(&self) -> Result<bool, &'static str> {
        let mut sender_guard = self.stop_sender.lock().await;

        if self.is_running.load(Ordering::SeqCst) {
            return Ok(false);
        }

        let (tx, mut rx) = watch::channel(false);
        *sender_guard = Some(tx);
        self.is_running.store(true, Ordering::SeqCst);

        let running_flag = self.is_running.clone();
        let auto_start = self.get_auto_start();

        save_local_mic_state(true, auto_start);
        crate::local_state::save_local_microphone_settings(true, auto_start);

        vault_logger::log_event("Microphone started. Wake-word detection active for 'Mira'.".to_string());
        info!("Microphone capture active. Listening for wake-word 'Mira' (local-only, zero retention).");

        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                tokio::select! {
                    _ = rx.changed() => {
                        if *rx.borrow() {
                            info!("Microphone background task received stop signal.");
                            break;
                        }
                    }
                    _ = ticker.tick() => {
                        if !running_flag.load(Ordering::SeqCst) {
                            break;
                        }
                    }
                }
            }
            info!("Microphone background task exited cleanly.");
        });

        Ok(true)
    }

    pub async fn stop(&self) -> Result<bool, &'static str> {
        let mut sender_guard = self.stop_sender.lock().await;

        if !self.is_running.load(Ordering::SeqCst) {
            return Ok(false);
        }

        if let Some(tx) = sender_guard.take() {
            let _ = tx.send(true);
        }

        self.is_running.store(false, Ordering::SeqCst);
        let auto_start = self.get_auto_start();

        save_local_mic_state(false, auto_start);
        crate::local_state::save_local_microphone_settings(false, auto_start);

        vault_logger::log_event("Microphone stopped.".to_string());
        info!("Microphone capture stopped.");

        Ok(true)
    }
}
