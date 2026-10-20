use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    response::Response,
    routing::post,
    Router,
};
use bytes::Bytes;
use futures_util::Stream;
use http_body_util::{BodyExt, Full};
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use pin_project_lite::pin_project;
use serde_json::Value;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Instant;
use tokio::sync::mpsc::{self, UnboundedSender};
use tracing::{error, info};

pin_project! {
    /// Zero-Blocking custom Stream wrapper around hyper Body.
    /// Synchronously yields SSE chunks directly to the downstream HTTP client
    /// while cloning bytes into an unbounded channel for async microsecond TTFT calculation.
    pub struct ZeroBlockingTelemetryStream<S> {
        #[pin]
        inner: S,
        sender: UnboundedSender<(Bytes, Instant)>,
    }
}

impl<S> ZeroBlockingTelemetryStream<S> {
    pub fn new(inner: S, sender: UnboundedSender<(Bytes, Instant)>) -> Self {
        Self { inner, sender }
    }
}

impl<S> Stream for ZeroBlockingTelemetryStream<S>
where
    S: Stream<Item = Result<Bytes, hyper::Error>>,
{
    type Item = Result<Bytes, hyper::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();
        match this.inner.poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                let now = Instant::now();
                // Send synchronously to unbounded channel without blocking poll
                let _ = this.sender.send((bytes.clone(), now));
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[derive(Clone)]
struct AppState {
    client: Client<HttpConnector, Full<Bytes>>,
    upstream_url: String,
    telemetry_tx: UnboundedSender<(String, Instant, mpsc::UnboundedReceiver<(Bytes, Instant)>)>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let (telemetry_tx, mut telemetry_rx) =
        mpsc::unbounded_channel::<(String, Instant, mpsc::UnboundedReceiver<(Bytes, Instant)>)>();

    // Background Tokio worker that reads chunks to calculate Time-To-First-Token (TTFT)
    tokio::spawn(async move {
        while let Some((req_id, start_time, mut chunk_rx)) = telemetry_rx.recv().await {
            tokio::spawn(async move {
                let mut first_token_recorded = false;
                let mut token_count = 0usize;

                while let Some((chunk, arrival_time)) = chunk_rx.recv().await {
                    if !first_token_recorded {
                        first_token_recorded = true;
                        let ttft = arrival_time.duration_since(start_time);
                        info!(
                            request_id = %req_id,
                            ttft_micros = %ttft.as_micros(),
                            "Time-To-First-Token (TTFT) recorded: {}µs",
                            ttft.as_micros()
                        );
                    }

                    // Count SSE 'data: ' payload events
                    let chunk_str = String::from_utf8_lossy(&chunk);
                    for line in chunk_str.lines() {
                        if line.starts_with("data:") && !line.contains("[DONE]") {
                            token_count += 1;
                        }
                    }
                }

                let total_duration = Instant::now().duration_since(start_time);
                info!(
                    request_id = %req_id,
                    total_tokens = %token_count,
                    total_micros = %total_duration.as_micros(),
                    "Stream finished"
                );
            });
        }
    });

    let client: Client<HttpConnector, Full<Bytes>> =
        Client::builder(TokioExecutor::new()).build(HttpConnector::new());

    let state = AppState {
        client,
        upstream_url: std::env::var("UPSTREAM_URL")
            .unwrap_or_else(|_| "http://localhost:11434".to_string()),
        telemetry_tx,
    };

    let app = Router::new()
        .route("/v1/chat/completions", post(handle_chat_completions))
        .route("/health", axum::routing::get(|| async { "OK" }))
        .with_state(Arc::new(state));

    // Dynamic Port Negotiation starting at 8080
    let mut port = 8080u16;
    let listener = loop {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => {
                info!("Apex-Gateway successfully bound to http://{}", addr);
                break l;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
                info!("Port {} in use, trying next...", port);
                port += 1;
                if port > 8180 {
                    return Err("Failed to find available port for Apex-Gateway".into());
                }
            }
            Err(e) => return Err(e.into()),
        }
    };

    // Update ephemeral .apex/ports.json in root workspace and apex-stack
    if let Ok(current_dir) = std::env::current_dir() {
        let root_dir = if current_dir.ends_with("apex-gateway") {
            current_dir.parent().and_then(|p| p.parent()).unwrap_or(&current_dir)
        } else if current_dir.ends_with("apex-stack") {
            current_dir.parent().unwrap_or(&current_dir)
        } else {
            &current_dir
        };

        let apex_dirs = vec![
            root_dir.join(".apex"),
            root_dir.join("apex-stack").join(".apex"),
        ];

        for apex_dir in apex_dirs {
            let _ = std::fs::create_dir_all(&apex_dir);
            let ports_file = apex_dir.join("ports.json");

            let mut ports_map: serde_json::Map<String, serde_json::Value> = std::fs::read_to_string(&ports_file)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            ports_map.insert("gateway".to_string(), serde_json::json!(port));
            let _ = std::fs::write(&ports_file, serde_json::to_string_pretty(&ports_map).unwrap_or_default());
        }
    }

    axum::serve(listener, app).await?;

    Ok(())
}

async fn handle_chat_completions(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
) -> Result<Response, StatusCode> {
    let req_start = Instant::now();
    let req_id = format!("apex-{}", req_start.elapsed().as_nanos());

    // Extract body bytes
    let body_bytes = req
        .into_body()
        .collect()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .to_bytes();

    let is_streaming = serde_json::from_slice::<Value>(&body_bytes)
        .ok()
        .and_then(|v| v.get("stream").and_then(|s| s.as_bool()))
        .unwrap_or(false);

    let upstream_endpoint = format!("{}/v1/chat/completions", state.upstream_url);

    let upstream_req = Request::builder()
        .method("POST")
        .uri(&upstream_endpoint)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Full::new(body_bytes))
        .map_err(|e| {
            error!("Failed to build upstream request: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let upstream_res = state.client.request(upstream_req).await.map_err(|e| {
        error!("Upstream proxy connection failed: {}", e);
        StatusCode::BAD_GATEWAY
    })?;

    let status = upstream_res.status();

    if is_streaming {
        let (chunk_tx, chunk_rx) = mpsc::unbounded_channel();
        let _ = state
            .telemetry_tx
            .send((req_id.clone(), req_start, chunk_rx));

        // Convert incoming hyper frame stream into Stream<Item = Result<Bytes, hyper::Error>>
        let frame_stream = upstream_res.into_body().into_data_stream();
        let telemetry_stream = ZeroBlockingTelemetryStream::new(frame_stream, chunk_tx);

        let body = Body::from_stream(telemetry_stream);

        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/event-stream")
            .header(header::CACHE_CONTROL, "no-cache")
            .header(header::CONNECTION, "keep-alive")
            .header("X-Apex-Gateway-ID", req_id)
            .body(body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        let res_bytes = upstream_res
            .into_body()
            .collect()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?
            .to_bytes();

        let ttft = req_start.elapsed();
        info!(
            request_id = %req_id,
            ttft_micros = %ttft.as_micros(),
            "Non-streaming response completed in {}µs",
            ttft.as_micros()
        );

        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "application/json")
            .header("X-Apex-Gateway-ID", req_id)
            .header("X-Apex-TTFT-Us", ttft.as_micros().to_string())
            .body(Body::from(res_bytes))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}
