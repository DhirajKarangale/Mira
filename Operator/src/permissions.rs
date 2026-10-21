use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPermission {
    pub app_name: String,
    pub app_id: String,
    pub allowed_to_capture: bool,
}

#[derive(Clone)]
pub struct PermissionsManager {
    restricted_apps: Arc<RwLock<HashSet<String>>>,
    all_apps: Arc<RwLock<Vec<AppPermission>>>,
}

impl PermissionsManager {
    pub fn new() -> Self {
        Self {
            restricted_apps: Arc::new(RwLock::new(HashSet::new())),
            all_apps: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn is_allowed(&self, app_id: &str) -> bool {
        let key = app_id.to_lowercase();
        let restricted = self.restricted_apps.read().await;
        !restricted.contains(&key)
    }

    pub async fn update_permission(&self, app_id: &str, allowed_to_capture: bool) {
        let key = app_id.to_lowercase();
        {
            let mut restricted = self.restricted_apps.write().await;
            if allowed_to_capture {
                restricted.remove(&key);
            } else {
                restricted.insert(key.clone());
            }
        }

        {
            let mut apps = self.all_apps.write().await;
            let mut found = false;
            for app in apps.iter_mut() {
                if app.app_id.eq_ignore_ascii_case(&key) {
                    app.allowed_to_capture = allowed_to_capture;
                    found = true;
                    break;
                }
            }
            if !found {
                apps.push(AppPermission {
                    app_id: key.clone(),
                    app_name: app_id.strip_suffix(".exe").unwrap_or(app_id).to_string(),
                    allowed_to_capture,
                });
            }
        }

        info!(
            "Updated capture permission for app '{}': allowed_to_capture={}",
            app_id, allowed_to_capture
        );
    }

    pub async fn get_all_apps(&self) -> Vec<AppPermission> {
        self.all_apps.read().await.clone()
    }

    #[allow(dead_code)]
    pub async fn get_restricted_apps(&self) -> HashSet<String> {
        self.restricted_apps.read().await.clone()
    }

    pub async fn sync_with_vault(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let vault_url = crate::config::get_vault_url();
        if vault_url.is_empty() {
            info!("Vault URL is not configured yet; skipping sync_with_vault");
            return Ok(());
        }
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()?;

        info!("Discovering system applications...");
        let discovered = crate::app_discovery::discover_system_apps();
        info!(
            "Discovered {} system applications. Refreshing with Vault...",
            discovered.len()
        );

        let refresh_url = format!("{}/apps/refresh", vault_url);
        let refresh_res = client.post(&refresh_url).json(&discovered).send().await;

        match refresh_res {
            Ok(res) if res.status().is_success() => {
                info!("Successfully refreshed app list with Vault");
            }
            Ok(res) => {
                warn!("Vault refresh returned status {}: {}", res.status(), refresh_url);
            }
            Err(e) => {
                warn!("Failed to reach Vault refresh endpoint at {}: {}", refresh_url, e);
            }
        }

        let apps_url = format!("{}/apps", vault_url);
        let fetch_res = client.get(&apps_url).send().await;

        match fetch_res {
            Ok(res) if res.status().is_success() => {
                let apps: Vec<AppPermission> = res.json().await?;
                let mut restricted_set = HashSet::new();
                for app in &apps {
                    if !app.allowed_to_capture {
                        restricted_set.insert(app.app_id.to_lowercase());
                    }
                }

                info!(
                    "Loaded {} apps from Vault. Restricted apps count: {}",
                    apps.len(),
                    restricted_set.len()
                );

                *self.restricted_apps.write().await = restricted_set;
                *self.all_apps.write().await = apps;
            }
            Ok(res) => {
                error!("Vault /apps returned status {}: {}", res.status(), apps_url);
            }
            Err(e) => {
                error!("Failed to fetch apps from Vault at {}: {}", apps_url, e);
            }
        }

        Ok(())
    }

    pub async fn sync_permission_to_vault(
        &self,
        app_id: &str,
        allowed_to_capture: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let vault_url = crate::config::get_vault_url();
        if vault_url.is_empty() {
            return Err("Vault URL is not configured".into());
        }
        let endpoint = format!("{}/apps/permission", vault_url);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()?;

        let body = serde_json::json!({
            "app_id": app_id,
            "allowed_to_capture": allowed_to_capture,
        });

        let res = client.post(&endpoint).json(&body).send().await?;
        if !res.status().is_success() {
            return Err(format!(
                "Vault returned status {} on permission update",
                res.status()
            )
            .into());
        }
        Ok(())
    }
}
