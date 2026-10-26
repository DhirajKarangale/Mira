use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalOperatorState {
    pub is_capturing: bool,
    #[serde(default = "default_mic_state")]
    pub microphone_state: String,
    #[serde(default)]
    pub is_microphone_on: bool,
    #[serde(default)]
    pub mic_auto_start: bool,
    #[serde(default)]
    pub updated_at: String,
}

fn default_mic_state() -> String {
    "off".to_string()
}

impl Default for LocalOperatorState {
    fn default() -> Self {
        Self {
            is_capturing: false,
            microphone_state: "off".to_string(),
            is_microphone_on: false,
            mic_auto_start: false,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

pub fn get_local_state_file_path() -> PathBuf {
    let direct = PathBuf::from("operator_state.json");
    if direct.exists() {
        return direct;
    }
    let in_operator = PathBuf::from("Operator").join("operator_state.json");
    if in_operator.exists() || PathBuf::from("Operator").is_dir() {
        return in_operator;
    }
    direct
}

pub fn load_local_state() -> LocalOperatorState {
    let path = get_local_state_file_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<LocalOperatorState>(&content) {
                Ok(state) => {
                    info!(
                        "Loaded local Operator state from {:?}: is_capturing={}, mic_state={}",
                        path, state.is_capturing, state.microphone_state
                    );
                    return state;
                }
                Err(err) => {
                    error!("Failed to parse local state file at {:?}: {}", path, err);
                }
            },
            Err(err) => {
                error!("Failed to read local state file at {:?}: {}", path, err);
            }
        }
    }
    LocalOperatorState::default()
}

pub fn save_local_state(is_capturing: bool) {
    let current = load_local_state();
    let path = get_local_state_file_path();
    let state = LocalOperatorState {
        is_capturing,
        microphone_state: current.microphone_state,
        is_microphone_on: current.is_microphone_on,
        mic_auto_start: current.mic_auto_start,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    match serde_json::to_string_pretty(&state) {
        Ok(json_str) => {
            if let Err(err) = std::fs::write(&path, json_str) {
                error!("Failed to write local Operator state to {:?}: {}", path, err);
            } else {
                info!(
                    "Saved local Operator state to {:?}: is_capturing={}",
                    path, is_capturing
                );
            }
        }
        Err(err) => {
            error!("Failed to serialize local Operator state: {}", err);
        }
    }
}

pub fn save_local_microphone_settings(is_microphone_on: bool, mic_auto_start: bool) {
    let current = load_local_state();
    let path = get_local_state_file_path();
    let state = LocalOperatorState {
        is_capturing: current.is_capturing,
        microphone_state: if is_microphone_on { "on".to_string() } else { "off".to_string() },
        is_microphone_on,
        mic_auto_start,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    match serde_json::to_string_pretty(&state) {
        Ok(json_str) => {
            if let Err(err) = std::fs::write(&path, json_str) {
                error!("Failed to write local Operator state to {:?}: {}", path, err);
            } else {
                info!(
                    "Saved local Operator state to {:?}: mic_on={}, auto_start={}",
                    path, is_microphone_on, mic_auto_start
                );
            }
        }
        Err(err) => {
            error!("Failed to serialize local Operator state: {}", err);
        }
    }
}
