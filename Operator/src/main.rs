mod api;
mod app_discovery;
mod broker_client;
mod capture;
mod config;
mod flow;
mod local_state;
mod permissions;
mod vault_logger;

use api::{create_router, AppState};
use flow::CaptureManager;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

fn parse_server_port() -> u16 {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];
        if arg == "--port" || arg == "-p" {
            if i + 1 < args.len() {
                if let Ok(p) = args[i + 1].parse::<u16>() {
                    return p;
                }
            }
        } else if let Some(val) = arg.strip_prefix("--port=") {
            if let Ok(p) = val.parse::<u16>() {
                return p;
            }
        }
        i += 1;
    }

    if let Ok(env_port) = std::env::var("PORT").or_else(|_| std::env::var("OPERATOR_PORT")) {
        if let Ok(p) = env_port.parse::<u16>() {
            return p;
        }
    }

    if let Some((_, port)) = config::get_operator_host_and_port() {
        return port;
    }

    panic!("Operator port not specified! Set via --port CLI arg, PORT env var, or services.json");
}

fn parse_server_host() -> String {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];
        if arg == "--host" || arg == "-h" {
            if i + 1 < args.len() {
                return args[i + 1].clone();
            }
        } else if let Some(val) = arg.strip_prefix("--host=") {
            return val.to_string();
        }
        i += 1;
    }

    if let Ok(h) = std::env::var("HOST").or_else(|_| std::env::var("OPERATOR_HOST")) {
        return h;
    }

    if let Some((host, _)) = config::get_operator_host_and_port() {
        return host;
    }

    "127.0.0.1".to_string()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(windows)]
    capture::enable_dpi_awareness();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "operator=info,tower_http=info".into()),
        )
        .init();

    info!("Starting Operator module...");

    let host = parse_server_host();
    let port = parse_server_port();

    let cfg = config::init_config().await;
    info!(
        "Loaded configuration from Vault: CAPTURE_INTERVAL_SECS={}s, OS={}",
        cfg.capture_interval_secs, cfg.os
    );

    vault_logger::log_event(format!(
        "Operator module initialized. Ready to receive requests on {}:{}",
        host, port
    ));

    let permissions = permissions::PermissionsManager::new();
    if let Err(e) = permissions.sync_with_vault().await {
        tracing::error!("Failed to synchronize app permissions with Vault on startup: {}", e);
    }

    let manager = CaptureManager::new(permissions.clone());

    local_state::save_local_state(false);

    if cfg.auto_start {
        info!("AUTO_START is enabled in Vault config. Scheduling screenshot capture with a 10-second delay...");
        let auto_manager = manager.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
            info!("10-second startup delay elapsed: auto-starting screenshot capture...");
            match auto_manager.start_capture().await {
                Ok(true) => info!("Auto-start screenshot capture loop initiated successfully."),
                Ok(false) => info!("Auto-start capture: loop is already running."),
                Err(err) => tracing::error!("Failed to auto-start screenshot capture: {}", err),
            }
        });
    }

    let state = AppState { manager, permissions };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = create_router(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;
    info!("Operator web server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
