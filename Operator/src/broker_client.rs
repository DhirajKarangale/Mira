use serde::{Deserialize, Serialize};
use tracing::{error, info};

pub const SCREENSHOT_CONSUMER_KEY: &str = "screenshot_process";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotJob {
    pub job_id: String,
    pub consumer_key: String,
    pub os: String,
    pub app_name: String,
    pub timestamp: String,
    pub image_path: String,
}

pub async fn dispatch_screenshot_job(
    job: &ScreenshotJob,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mb_url = crate::config::get_message_broker_url();
    if mb_url.is_empty() {
        return Err("Message Broker URL is not configured".into());
    }
    let endpoint = format!("{}/jobs", mb_url.trim_end_matches('/'));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()?;

    let response = client.post(&endpoint).json(job).send().await?;

    if response.status().is_success() {
        info!(
            "Successfully dispatched screenshot job {} (app: '{}') to Message Broker",
            job.job_id, job.app_name
        );
        crate::vault_logger::log_event(format!(
            "Dispatched screenshot job {} for application '{}' to Message Broker",
            job.job_id, job.app_name
        ));
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let err_msg = format!(
            "Message Broker rejected job {} with status {}: {}",
            job.job_id, status, body
        );
        error!("{}", err_msg);
        crate::vault_logger::log_event(format!("ERROR: {}", err_msg));
        Err(err_msg.into())
    }
}
