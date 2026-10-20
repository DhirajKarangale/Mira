use serde::{Deserialize, Serialize};
use tracing::{error, info};

pub const SCREENSHOT_CONSUMER_KEY: &str = "screenshot_process";

/// Job payload as required by Section 4:
/// - job_id: UUID
/// - app_name: Name of the currently active application at capture time
/// - timestamp: System timestamp in dd/mm/yyyyTHH:mm:ss format
/// - image_path: Path to the saved screenshot file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotJob {
    pub job_id: String,
    pub consumer_key: String,
    pub app_name: String,
    pub timestamp: String,
    pub image_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AddJobResponse {
    pub message: String,
}

/// Dispatch the captured screenshot job to the Message Broker (which queues it into Redis Streams).
pub async fn dispatch_screenshot_job(
    job: &ScreenshotJob,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mb_url = crate::config::get_message_broker_url();
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
