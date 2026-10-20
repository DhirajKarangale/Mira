mod api;
mod broker_client;
mod capture;
mod config;
mod flow;
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

    let (_, port) = config::get_operator_host_and_port();
    port
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

    let (host, _) = config::get_operator_host_and_port();
    host
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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
        "Loaded configuration from Vault: CAPTURE_INTERVAL_SECS={}s",
        cfg.capture_interval_secs
    );

    vault_logger::log_event(format!(
        "Operator module initialized. Ready to receive requests on {}:{}",
        host, port
    ));

    let manager = CaptureManager::new();
    let state = AppState { manager };

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
