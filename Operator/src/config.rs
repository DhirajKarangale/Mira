use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperatorConfig {
    pub capture_interval_secs: u64,
    pub screenshots_dir: PathBuf,
    pub os: String,
    pub auto_start: bool,
}

use std::sync::RwLock;

static CONFIG: OnceLock<OperatorConfig> = OnceLock::new();
static SERVICE_MAP: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct VaultOperatorConfigResponse {
    #[serde(rename = "CAPTURE_INTERVAL_SECS")]
    capture_interval_secs: Option<u64>,
    #[serde(rename = "AUTO_START")]
    auto_start: Option<bool>,
}

fn get_service_map() -> &'static RwLock<HashMap<String, String>> {
    SERVICE_MAP.get_or_init(|| {
        let mut map = HashMap::new();
        let candidate_paths = [
            std::env::var("SERVICES_JSON_PATH").ok().map(PathBuf::from),
            Some(PathBuf::from("services.json")),
            Some(PathBuf::from("../services.json")),
            Some(PathBuf::from("../../services.json")),
        ];

        for candidate in candidate_paths.into_iter().flatten() {
            if candidate.exists() && candidate.is_file() {
                if let Ok(content) = std::fs::read_to_string(&candidate) {
                    if let Ok(urls) = serde_json::from_str::<HashMap<String, String>>(&content) {
                        map = urls;
                        info!("Loaded initial service URLs from {:?}", candidate);
                        break;
                    }
                }
            }
        }
        RwLock::new(map)
    })
}

pub fn update_service_urls(new_urls: HashMap<String, String>) {
    let map_lock = get_service_map();
    if let Ok(mut map) = map_lock.write() {
        for (k, v) in new_urls {
            map.insert(k.to_lowercase().replace('-', "_"), v.trim_end_matches('/').to_string());
        }
        info!("Updated Operator service registry with {} URLs", map.len());
    }
}

pub fn get_all_service_urls() -> HashMap<String, String> {
    if let Ok(map) = get_service_map().read() {
        map.clone()
    } else {
        HashMap::new()
    }
}

pub fn get_service_url(module_name: &str) -> Option<String> {
    let key = module_name.to_lowercase().replace('-', "_");
    if let Ok(map) = get_service_map().read() {
        if let Some(url) = map.get(&key) {
            return Some(url.trim_end_matches('/').to_string());
        }
    }
    if let Ok(env_val) = std::env::var(format!("{}_URL", module_name.to_uppercase())) {
        return Some(env_val.trim_end_matches('/').to_string());
    }
    None
}

pub fn get_vault_url() -> String {
    std::env::var("VAULT_URL")
        .ok()
        .or_else(|| get_service_url("vault"))
        .unwrap_or_default()
}

pub fn get_message_broker_url() -> String {
    std::env::var("MESSAGE_BROKER_URL")
        .ok()
        .or_else(|| get_service_url("message_broker"))
        .unwrap_or_default()
}

pub fn get_operator_host_and_port() -> (String, u16) {
    if let Some(op_url) = get_service_url("operator") {
        let clean = op_url
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .trim_end_matches('/');

        let parts: Vec<&str> = clean.split(':').collect();
        if parts.len() == 2 {
            if let Ok(port) = parts[1].parse::<u16>() {
                return (parts[0].to_string(), port);
            }
        }
    }
    ("127.0.0.1".to_string(), 1002)
}

pub async fn init_config() -> &'static OperatorConfig {
    if let Some(cfg) = CONFIG.get() {
        return cfg;
    }

    get_service_map();

    let vault_url = get_vault_url();
    let mut capture_interval_secs = 10u64;
    let mut auto_start = false;
    let mut os = "Windows".to_string();

    if !vault_url.is_empty() {
        let endpoint = format!("{}/config/operator", vault_url);
        info!("Fetching Operator configuration from Vault at {}...", endpoint);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .ok();

        if let Some(client) = client {
            if let Ok(response) = client.get(&endpoint).send().await {
                if response.status().is_success() {
                    if let Ok(vault_data) = response.json::<VaultOperatorConfigResponse>().await {
                        if let Some(secs) = vault_data.capture_interval_secs {
                            capture_interval_secs = secs;
                        }
                        auto_start = vault_data.auto_start.unwrap_or(false);
                        info!(
                            "Successfully loaded configuration from Vault: CAPTURE_INTERVAL_SECS={}, AUTO_START={}",
                            capture_interval_secs, auto_start
                        );
                    }
                }
            }

            let os_endpoint = format!("{}/os", vault_url);
            if let Ok(os_response) = client.get(&os_endpoint).send().await {
                if os_response.status().is_success() {
                    if let Ok(loaded_os) = os_response.json::<String>().await {
                        os = loaded_os;
                        info!("Successfully loaded OS from Vault: {}", os);
                    }
                }
            }
        }
    }

    info!("Successfully loaded OS from Vault: {}", os);

    let raw_screenshots_dir = if let Ok(dir) = std::env::var("SCREENSHOTS_DIR") {
        PathBuf::from(dir)
    } else if PathBuf::from("Operator").is_dir() {
        PathBuf::from("Operator").join("screenshots")
    } else {
        PathBuf::from("screenshots")
    };

    if let Err(e) = std::fs::create_dir_all(&raw_screenshots_dir) {
        panic!("Failed to create screenshots directory {:?}: {}", raw_screenshots_dir, e);
    }

    let screenshots_dir = match std::fs::canonicalize(&raw_screenshots_dir) {
        Ok(p) => {
            let s = p.to_string_lossy().to_string();
            if let Some(stripped) = s.strip_prefix(r"\\?\") {
                PathBuf::from(stripped)
            } else {
                p
            }
        }
        Err(_) => raw_screenshots_dir,
    };

    let config = OperatorConfig {
        capture_interval_secs,
        screenshots_dir,
        os,
        auto_start,
    };

    CURRENT_INTERVAL_SECS.store(capture_interval_secs, std::sync::atomic::Ordering::Relaxed);
    CONFIG.set(config).ok();
    CONFIG.get().expect("Configuration initialized")
}

static CURRENT_INTERVAL_SECS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(10);

pub fn get_capture_interval_secs() -> u64 {
    CURRENT_INTERVAL_SECS.load(std::sync::atomic::Ordering::Relaxed)
}

pub fn set_capture_interval_secs(val: u64) {
    if val >= 1 && val <= 3600 {
        CURRENT_INTERVAL_SECS.store(val, std::sync::atomic::Ordering::Relaxed);
    }
}

pub async fn refresh_capture_interval_from_vault() -> u64 {
    let vault_url = get_vault_url();
    if vault_url.is_empty() {
        return CURRENT_INTERVAL_SECS.load(std::sync::atomic::Ordering::Relaxed);
    }
    let endpoint = format!("{}/config/operator", vault_url);
    if let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        if let Ok(response) = client.get(&endpoint).send().await {
            if response.status().is_success() {
                if let Ok(data) = response.json::<VaultOperatorConfigResponse>().await {
                    if let Some(secs) = data.capture_interval_secs {
                        let clamped = secs.clamp(1, 3600);
                        CURRENT_INTERVAL_SECS.store(clamped, std::sync::atomic::Ordering::Relaxed);
                        return clamped;
                    }
                }
            }
        }
    }
    CURRENT_INTERVAL_SECS.load(std::sync::atomic::Ordering::Relaxed)
}

pub fn get_config() -> &'static OperatorConfig {
    CONFIG
        .get()
        .expect("Configuration must be initialized with init_config() before access")
}

#[allow(dead_code)]
pub fn get_os() -> &'static str {
    &get_config().os
}
