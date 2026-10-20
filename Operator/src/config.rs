use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperatorConfig {
    pub capture_interval_secs: u64,
    pub screenshots_dir: PathBuf,
}

static CONFIG: OnceLock<OperatorConfig> = OnceLock::new();
static SERVICE_URLS: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Structure representing response from Vault GET /config/operator
/// Vault stores only the operator-specific parameters (CAPTURE_INTERVAL_SECS)
#[derive(Debug, Deserialize)]
struct VaultOperatorConfigResponse {
    #[serde(rename = "CAPTURE_INTERVAL_SECS")]
    capture_interval_secs: Option<u64>,
}

/// Find and load the global services.json file without any hardcoded fallback dictionaries
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

/// Get the base URL for any module by name from loaded services.json without fallback
pub fn get_service_url(module_name: &str) -> String {
    let urls = load_service_urls();
    let key = module_name.to_lowercase();
    urls.get(&key)
        .or_else(|| urls.get(&key.replace('-', "_")))
        .unwrap_or_else(|| panic!("Module '{}' not defined in services.json", module_name))
        .trim_end_matches('/')
        .to_string()
}

/// Get the Vault base URL strictly from services.json (or VAULT_URL env override)
pub fn get_vault_url() -> String {
    std::env::var("VAULT_URL")
        .unwrap_or_else(|_| get_service_url("vault"))
        .trim_end_matches('/')
        .to_string()
}

/// Get the Message Broker base URL strictly from services.json (or MESSAGE_BROKER_URL env override)
pub fn get_message_broker_url() -> String {
    std::env::var("MESSAGE_BROKER_URL")
        .unwrap_or_else(|_| get_service_url("message_broker"))
        .trim_end_matches('/')
        .to_string()
}

/// Get default operator host and port parsed strictly from services.json
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

/// Fetch configuration strictly from Vault at startup, store it in memory, and provide it to callers.
/// No fallbacks are permitted; fails fast if Vault is unreachable or configuration is missing.
pub async fn init_config() -> &'static OperatorConfig {
    if let Some(cfg) = CONFIG.get() {
        return cfg;
    }

    // Ensure global services.json is loaded
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

    let screenshots_dir = std::env::var("SCREENSHOTS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("screenshots"));

    if let Err(e) = std::fs::create_dir_all(&screenshots_dir) {
        panic!("Failed to create screenshots directory {:?}: {}", screenshots_dir, e);
    }

    let config = OperatorConfig {
        capture_interval_secs,
        screenshots_dir,
    };

    CONFIG.set(config).ok();
    CONFIG.get().expect("Configuration initialized")
}

/// Retrieve the cached configuration from memory
pub fn get_config() -> &'static OperatorConfig {
    CONFIG
        .get()
        .expect("Configuration must be initialized with init_config() before access")
}
