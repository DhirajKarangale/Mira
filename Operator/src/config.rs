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
}

static CONFIG: OnceLock<OperatorConfig> = OnceLock::new();
static SERVICE_URLS: OnceLock<HashMap<String, String>> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct VaultOperatorConfigResponse {
    #[serde(rename = "CAPTURE_INTERVAL_SECS")]
    capture_interval_secs: Option<u64>,
}

pub fn load_service_urls() -> &'static HashMap<String, String> {
    SERVICE_URLS.get_or_init(|| {
        let candidate_paths = [
            std::env::var("SERVICES_JSON_PATH").ok().map(PathBuf::from),
            Some(PathBuf::from("services.json")),
            Some(PathBuf::from("../services.json")),
            Some(PathBuf::from("../../services.json")),
        ];

        for candidate in candidate_paths.into_iter().flatten() {
            if candidate.exists() && candidate.is_file() {
                let content = std::fs::read_to_string(&candidate)
                    .unwrap_or_else(|e| panic!("Failed to read services.json at {:?}: {}", candidate, e));
                let urls: HashMap<String, String> = serde_json::from_str(&content)
                    .unwrap_or_else(|e| panic!("Failed to parse services.json at {:?}: {}", candidate, e));
                info!("Loaded global service URLs from {:?}", candidate);
                return urls;
            }
        }

        panic!("services.json was not found in project workspace!");
    })
}

pub fn get_service_url(module_name: &str) -> String {
    let urls = load_service_urls();
    let key = module_name.to_lowercase();
    urls.get(&key)
        .or_else(|| urls.get(&key.replace('-', "_")))
        .unwrap_or_else(|| panic!("Module '{}' not defined in services.json", module_name))
        .trim_end_matches('/')
        .to_string()
}

pub fn get_vault_url() -> String {
    std::env::var("VAULT_URL")
        .unwrap_or_else(|_| get_service_url("vault"))
        .trim_end_matches('/')
        .to_string()
}

pub fn get_message_broker_url() -> String {
    std::env::var("MESSAGE_BROKER_URL")
        .unwrap_or_else(|_| get_service_url("message_broker"))
        .trim_end_matches('/')
        .to_string()
}

pub fn get_operator_host_and_port() -> (String, u16) {
    let op_url = get_service_url("operator");
    let clean = op_url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/');

    let parts: Vec<&str> = clean.split(':').collect();
    if parts.len() != 2 {
        panic!("Invalid operator URL in services.json: '{}', expected 'http://host:port'", op_url);
    }

    let host = parts[0].to_string();
    let port = parts[1]
        .parse::<u16>()
        .unwrap_or_else(|e| panic!("Invalid port in operator URL '{}': {}", op_url, e));

    (host, port)
}

pub async fn init_config() -> &'static OperatorConfig {
    if let Some(cfg) = CONFIG.get() {
        return cfg;
    }

    load_service_urls();

    let vault_url = get_vault_url();
    let endpoint = format!("{}/config/operator", vault_url);
    info!("Fetching Operator configuration from Vault at {}...", endpoint);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("Failed to build HTTP client");

    let response = client
        .get(&endpoint)
        .send()
        .await
        .unwrap_or_else(|e| panic!("Failed to connect to Vault at {}: {}", endpoint, e));

    if !response.status().is_success() {
        panic!(
            "Vault returned error status {} for endpoint {}",
            response.status(),
            endpoint
        );
    }

    let vault_data = response
        .json::<VaultOperatorConfigResponse>()
        .await
        .unwrap_or_else(|e| panic!("Failed to parse JSON response from Vault at {}: {}", endpoint, e));

    let capture_interval_secs = vault_data
        .capture_interval_secs
        .expect("CAPTURE_INTERVAL_SECS is missing from Vault operator configuration table");

    info!(
        "Successfully loaded configuration from Vault: CAPTURE_INTERVAL_SECS={}",
        capture_interval_secs
    );

    let os_endpoint = format!("{}/os", vault_url);
    info!("Fetching OS from Vault at {}...", os_endpoint);
    let os_response = client
        .get(&os_endpoint)
        .send()
        .await
        .unwrap_or_else(|e| panic!("Failed to connect to Vault at {}: {}", os_endpoint, e));

    if !os_response.status().is_success() {
        panic!(
            "Vault returned error status {} for endpoint {}",
            os_response.status(),
            os_endpoint
        );
    }

    let os: String = os_response
        .json::<String>()
        .await
        .unwrap_or_else(|e| panic!("Failed to parse OS response from Vault at {}: {}", os_endpoint, e));

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
    };

    CONFIG.set(config).ok();
    CONFIG.get().expect("Configuration initialized")
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
