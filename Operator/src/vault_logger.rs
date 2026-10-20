use serde::Serialize;
use tracing::{error, info};

const MODULE_NAME: &str = "operator";

#[derive(Debug, Serialize)]
struct VaultLogPayload<'a> {
    module_name: &'a str,
    data: &'a str,
}

pub fn log_event(message: impl Into<String>) {
    let msg = message.into();
    info!("[{}] {}", MODULE_NAME, msg);

    let vault_url = crate::config::get_vault_url();

    tokio::spawn(async move {
        let endpoint = format!("{}/logs", vault_url);
        let payload = VaultLogPayload {
            module_name: MODULE_NAME,
            data: &msg,
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .unwrap_or_default();

        match client.post(&endpoint).json(&payload).send().await {
            Ok(resp) if resp.status().is_success() => {}
            Ok(resp) => {
                error!(
                    "[{}] Vault log delivery failed with status {}: {}",
                    MODULE_NAME,
                    resp.status(),
                    msg
                );
            }
            Err(e) => {
                error!(
                    "[{}] Vault log delivery fallback ({}): {}",
                    MODULE_NAME, e, msg
                );
            }
        }
    });
}
