use crate::engine::{AddInput, AppState};
use crate::model::{now_ms, public_download, Download};
use crate::scan::scan_page;
use axum::body::Bytes;
use axum::extract::{Path, Request, State};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio_stream::wrappers::ReceiverStream;

pub struct ServerInfo {
    pub url: String,
    pub port: u16,
}

pub async fn start(state: Arc<AppState>) -> Result<ServerInfo, String> {
    state.start_background();
    let base_port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(4477);
    let mut last_error = None;
    for offset in 0..10u16 {
        let port = base_port.saturating_add(offset);
        match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => {
                let app = router(state.clone());
                tokio::spawn(async move {
                    if let Err(err) = axum::serve(listener, app).await {
                        eprintln!("[server] {err}");
                    }
                });
                return Ok(ServerInfo {
                    url: format!("http://127.0.0.1:{port}"),
                    port,
                });
            }
            Err(err) => {
                let in_use = err.kind() == std::io::ErrorKind::AddrInUse;
                last_error = Some(err.to_string());
                if !in_use {
                    break;
                }
            }
        }
    }
    Err(format!(
        "No available port: {}",
        last_error.unwrap_or_default()
    ))
}

fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/state", get(api_state))
        .route("/api/events", get(api_events))
        .route("/api/meta", get(api_meta))
        .route("/api/update-check", get(api_update_check))
        .route("/api/show", post(api_show))
        .route("/api/downloads", post(api_add))
        .route("/api/history/clear", post(api_clear_history))
        .route("/api/downloads/pause-all", post(api_pause_all))
        .route("/api/downloads/resume-all", post(api_resume_all))
        .route("/api/downloads/{id}", get(api_download))
        .route("/api/downloads/{id}/{action}", post(api_action))
        .route("/api/settings", patch(api_settings))
        .route("/api/scan", post(api_scan))
        .route("/api/capture", post(api_capture))
        .route("/api/open-extension-folder", post(api_open_extension))
        .route(
            "/api/open-extension-browser",
            post(api_open_extension_browser),
        )
        .route("/api/open-url", post(api_open_url))
        .route("/api/open-downloads-folder", post(api_open_downloads))
        .route("/api/open-data-folder", post(api_open_data))
        .route("/", get(api_index))
        .route("/index.html", get(api_index))
        .route("/app.js", get(api_app))
        .route("/i18n.js", get(api_i18n))
        .route("/styles.css", get(api_styles))
        .route("/theme.css", get(api_theme))
        .route("/popup.html", get(api_popup))
        .route("/progress.html", get(api_progress))
        .route("/assets/{name}", get(api_asset))
        .route("/vendor/{name}", get(api_vendor))
        .route("/favicon.ico", get(api_favicon))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state)
}

async fn guard(State(state): State<Arc<AppState>>, req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let host_header = req
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let host_name = hostname_of_header(&host_header);
    if !matches!(host_name.as_str(), "127.0.0.1" | "localhost" | "::1") {
        return forbid("Loopback host required");
    }
    let origin = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let mut cors_origin = None;
    if let Some(origin) = &origin {
        if !is_allowed_origin(origin, &host_header) {
            return forbid("Origin is not allowed");
        }
        if is_extension_origin(origin) {
            if !extension_may_use(&method, &path) {
                return forbid("Extension origin cannot use this endpoint");
            }
            state.mark_extension_seen();
        }
        cors_origin = Some(origin.clone());
    }
    if method == Method::OPTIONS && path.starts_with("/api/") {
        let mut response = StatusCode::NO_CONTENT.into_response();
        apply_common_headers(&mut response);
        if let Some(origin) = &cors_origin {
            apply_cors(&mut response, origin);
        }
        return response;
    }
    let mut response = next.run(req).await;
    apply_common_headers(&mut response);
    if path.starts_with("/api/") {
        if let Some(origin) = &cors_origin {
            apply_cors(&mut response, origin);
        }
    }
    response
}

fn apply_common_headers(response: &mut Response) {
    response.headers_mut().insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    response
        .headers_mut()
        .insert("referrer-policy", HeaderValue::from_static("no-referrer"));
}

fn apply_cors(response: &mut Response, origin: &str) {
    if let Ok(value) = HeaderValue::from_str(origin) {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
    }
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static("Origin"));
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET,POST,PATCH,OPTIONS"),
    );
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Content-Type"),
    );
    response.headers_mut().insert(
        header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static("86400"),
    );
}

fn forbid(message: &str) -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(json!({ "error": message })),
    )
        .into_response()
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn hostname_of_header(value: &str) -> String {
    let host = value.trim().to_ascii_lowercase();
    if host.starts_with('[') {
        if let Some(end) = host.find(']') {
            return host[1..end].to_string();
        }
        return host;
    }
    host.split(':').next().unwrap_or("").to_string()
}

fn is_extension_origin(origin: &str) -> bool {
    let lower = origin.to_ascii_lowercase();
    lower.starts_with("chrome-extension://")
        || lower.starts_with("moz-extension://")
        || lower.starts_with("safari-web-extension://")
}

fn is_allowed_origin(origin: &str, host_header: &str) -> bool {
    let Ok(parsed) = url::Url::parse(origin) else {
        return false;
    };
    match parsed.scheme() {
        "chrome-extension" | "moz-extension" | "safari-web-extension" => true,
        _ => parsed
            .host_str()
            .map(|host| host.eq_ignore_ascii_case(&hostname_of_header(host_header)))
            .unwrap_or(false),
    }
}

fn extension_may_use(method: &Method, path: &str) -> bool {
    if method == Method::GET && (path == "/api/meta" || path.starts_with("/api/downloads/")) {
        return true;
    }
    if (method == Method::POST || method == Method::OPTIONS)
        && (path == "/api/capture" || path == "/api/scan")
    {
        return true;
    }
    false
}

async fn api_state(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(state.snapshot_value())
}

async fn api_events(
    State(state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(16);
    let initial = serde_json::to_string(&state.snapshot_value()).unwrap_or_default();
    let _ = tx.send(Ok(Event::default().event("state").data(initial))).await;
    let mut subscriber = state.tx.subscribe();
    tokio::spawn(async move {
        loop {
            match subscriber.recv().await {
                Ok(text) => {
                    if tx
                        .send(Ok(Event::default().event("state").data(text)))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });
    Sse::new(ReceiverStream::new(rx))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("ping"))
}

async fn api_meta(State(state): State<Arc<AppState>>) -> Json<Value> {
    let extension_path = state.extension_dir.to_string_lossy().to_string();
    let extension_exists = state.extension_dir.join("manifest.json").exists();
    Json(json!({
        "name": "Arus",
        "version": state.version,
        "engine": "Rust",
        "ffmpeg": state.ffmpeg,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "dataDir": state.data_dir.to_string_lossy(),
        "stateFile": state.store_path.to_string_lossy(),
        "extensionPath": extension_path,
        "extensionExists": extension_exists,
        "extensionConnected": state.extension_connected(),
        "extensionSeenAt": state.extension_seen_at(),
    }))
}

async fn api_update_check(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(check_for_update(&state).await)
}

async fn check_for_update(state: &Arc<AppState>) -> Value {
    const REPO: &str = "arielbudinex-oss/Arus-Download-Manager";
    const CACHE_MS: u64 = 6 * 60 * 60 * 1000;
    const ERROR_CACHE_MS: u64 = 5 * 60 * 1000;
    let now = now_ms();
    {
        let cache = state.update_cache.lock();
        if let Some((expires_at, cached)) = cache.as_ref() {
            if now < *expires_at {
                return cached.clone();
            }
        }
    }
    let api_url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let release_url = format!("https://github.com/{REPO}/releases/latest");
    let mut payload = json!({
        "current": state.version,
        "latest": Value::Null,
        "available": false,
        "url": release_url,
        "checkedAt": now,
        "error": Value::Null,
    });
    let response = state
        .client
        .get(&api_url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .timeout(Duration::from_secs(8))
        .send()
        .await;
    match response {
        Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
            Ok(body) => {
                let tag = body
                    .get("tag_name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .trim();
                let latest = tag.trim_start_matches(['v', 'V']).to_string();
                if !latest.is_empty() {
                    payload["latest"] = json!(latest);
                    payload["available"] = json!(version_newer(&latest, &state.version));
                    if let Some(url) = body.get("html_url").and_then(|value| value.as_str()) {
                        payload["url"] = json!(url);
                    }
                    payload["publishedAt"] = body
                        .get("published_at")
                        .cloned()
                        .unwrap_or(Value::Null);
                }
            }
            Err(err) => payload["error"] = json!(format!("Could not read the release: {err}")),
        },
        Ok(resp) => payload["error"] = json!(format!("GitHub returned {}", resp.status())),
        Err(err) => payload["error"] = json!(format!("Update check failed: {err}")),
    }
    let ttl = if payload["error"].is_null() {
        CACHE_MS
    } else {
        ERROR_CACHE_MS
    };
    *state.update_cache.lock() = Some((now + ttl, payload.clone()));
    payload
}

fn numeric_version(version: &str) -> Vec<u64> {
    version
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|character| character.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

fn version_newer(candidate: &str, current: &str) -> bool {
    let candidate = numeric_version(candidate);
    let current = numeric_version(current);
    for index in 0..candidate.len().max(current.len()) {
        let left = *candidate.get(index).unwrap_or(&0);
        let right = *current.get(index).unwrap_or(&0);
        if left != right {
            return left > right;
        }
    }
    false
}

async fn api_open_url(Json(body): Json<Value>) -> Response {
    let Some(url) = body.get("url").and_then(|value| value.as_str()) else {
        return json_error(StatusCode::BAD_REQUEST, "url is required");
    };
    if !is_allowed_external_url(url) {
        return json_error(StatusCode::BAD_REQUEST, "URL is not allowed");
    }
    open_external(url);
    Json(json!({ "ok": true })).into_response()
}

fn is_allowed_external_url(value: &str) -> bool {
    let Ok(parsed) = url::Url::parse(value) else {
        return false;
    };
    parsed.scheme() == "https"
        && parsed.username().is_empty()
        && matches!(
            parsed.host_str(),
            Some("github.com") | Some("arielbudinex-oss.github.io") | Some("discord.gg")
        )
}

async fn api_open_extension_browser(State(state): State<Arc<AppState>>) -> Response {
    if !state.extension_dir.join("manifest.json").exists() {
        return json_error(StatusCode::NOT_FOUND, "The extension folder is missing");
    }
    let Some(browser) = find_browser() else {
        return json_error(
            StatusCode::FAILED_DEPENDENCY,
            "Chrome, Edge, Brave, or Vivaldi was not found",
        );
    };
    let profile = last_used_profile(&browser.user_data);
    let mut command = std::process::Command::new(&browser.exe);
    if let Some(profile) = &profile {
        command.arg(format!("--profile-directory={profile}"));
    }
    match command.arg(browser.page).spawn() {
        Ok(_) => Json(json!({
            "ok": true,
            "browser": browser.name,
            "page": browser.page,
            "profile": profile,
            "extensionPath": state.extension_dir.to_string_lossy(),
        }))
        .into_response(),
        Err(err) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Could not open {}: {err}", browser.name),
        ),
    }
}

struct BrowserLaunch {
    name: &'static str,
    exe: PathBuf,
    page: &'static str,
    user_data: Option<PathBuf>,
}

fn last_used_profile(user_data: &Option<PathBuf>) -> Option<String> {
    let raw = std::fs::read_to_string(user_data.as_ref()?.join("Local State")).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    let name = value.get("profile")?.get("last_used")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

fn default_browser_prog_id() -> String {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
                "/v",
                "ProgId",
            ])
            .output();
        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(value) = text.split("REG_SZ").nth(1) {
                return value.trim().to_ascii_lowercase();
            }
        }
    }
    String::new()
}

fn find_browser() -> Option<BrowserLaunch> {
    let prog_id = default_browser_prog_id();
    let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let local_data = local_app_data.clone();
    let roots = [
        program_files,
        program_files_x86,
        local_app_data,
    ];
    let join = |base: &PathBuf, parts: &[&str]| -> PathBuf {
        let mut path = base.clone();
        for part in parts {
            path.push(part);
        }
        path
    };
    let mut chrome_paths = Vec::new();
    let mut edge_paths = Vec::new();
    let mut brave_paths = Vec::new();
    let mut vivaldi_paths = Vec::new();
    for root in roots.iter().flatten() {
        chrome_paths.push(join(root, &["Google", "Chrome", "Application", "chrome.exe"]));
        edge_paths.push(join(
            root,
            &["Microsoft", "Edge", "Application", "msedge.exe"],
        ));
        brave_paths.push(join(
            root,
            &["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
        ));
        vivaldi_paths.push(join(root, &["Vivaldi", "Application", "vivaldi.exe"]));
    }
    let user_data = |parts: &[&str]| -> Option<PathBuf> {
        local_data.as_ref().map(|base| join(base, parts))
    };
    let mut browsers: Vec<(&'static str, Vec<PathBuf>, &'static str, Option<PathBuf>)> = vec![
        (
            "Chrome",
            chrome_paths,
            "chrome://extensions",
            user_data(&["Google", "Chrome", "User Data"]),
        ),
        (
            "Edge",
            edge_paths,
            "edge://extensions",
            user_data(&["Microsoft", "Edge", "User Data"]),
        ),
        (
            "Brave",
            brave_paths,
            "chrome://extensions",
            user_data(&["BraveSoftware", "Brave-Browser", "User Data"]),
        ),
        (
            "Vivaldi",
            vivaldi_paths,
            "chrome://extensions",
            user_data(&["Vivaldi", "User Data"]),
        ),
    ];
    let preferred = if prog_id.contains("chrome") {
        Some(0)
    } else if prog_id.contains("edge") {
        Some(1)
    } else if prog_id.contains("brave") {
        Some(2)
    } else if prog_id.contains("vivaldi") {
        Some(3)
    } else {
        None
    };
    if let Some(index) = preferred {
        let entry = browsers.remove(index);
        browsers.insert(0, entry);
    }
    browsers
        .into_iter()
        .find_map(|(name, paths, page, user_data)| {
            paths
                .into_iter()
                .find(|path| path.exists())
                .map(|exe| BrowserLaunch {
                    name,
                    exe,
                    page,
                    user_data,
                })
        })
}

fn open_external(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe").arg(url).spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

async fn api_show(State(state): State<Arc<AppState>>) -> StatusCode {
    state.open_window();
    StatusCode::NO_CONTENT
}

#[derive(Default)]
struct CaptureFields {
    url: Option<String>,
    filename: Option<String>,
    kind: Option<String>,
    page_url: Option<String>,
    referer: Option<String>,
    cookie: Option<String>,
    user_agent: Option<String>,
    origin: Option<String>,
    connections: Option<u32>,
    priority: Option<String>,
    folder: Option<String>,
    start_at: Option<Value>,
    speed_limit: Option<u64>,
}

fn fields_from_value(body: &Value) -> CaptureFields {
    let string = |key: &str| body.get(key).and_then(|v| v.as_str()).map(|v| v.to_string());
    CaptureFields {
        url: string("url"),
        filename: string("filename"),
        kind: string("kind"),
        page_url: string("pageUrl"),
        referer: string("referer"),
        cookie: string("cookie"),
        user_agent: string("userAgent"),
        origin: string("origin"),
        connections: body
            .get("connections")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        priority: string("priority"),
        folder: string("folder"),
        start_at: body.get("startAt").cloned(),
        speed_limit: body
            .get("speedLimit")
            .and_then(|v| v.as_u64())
            .filter(|v| *v > 0),
    }
}

fn start_at_from_value(value: Option<&Value>) -> Result<Option<u64>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) if text.is_empty() => Ok(None),
        Some(Value::String(text)) => text
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
            .map(|v| Some(v as u64))
            .ok_or_else(|| "startAt must be an epoch timestamp".to_string()),
        Some(Value::Number(number)) => number
            .as_f64()
            .filter(|v| v.is_finite())
            .map(|v| Some(v as u64))
            .ok_or_else(|| "startAt must be an epoch timestamp".to_string()),
        _ => Err("startAt must be an epoch timestamp".into()),
    }
}

async fn api_add(State(state): State<Arc<AppState>>, Json(body): Json<Value>) -> Response {
    let fields = fields_from_value(&body);
    let Some(url) = fields.url.filter(|url| !url.trim().is_empty()) else {
        return json_error(StatusCode::BAD_REQUEST, "url is required");
    };
    let start_at = match start_at_from_value(fields.start_at.as_ref()) {
        Ok(value) => value,
        Err(message) => return json_error(StatusCode::BAD_REQUEST, &message),
    };
    let headers: HashMap<String, String> = body
        .get("headers")
        .and_then(|value| value.as_object())
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|value| (key.clone(), value.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();
    let input = AddInput {
        url,
        filename: fields.filename,
        kind: fields.kind,
        page_url: fields.page_url,
        headers,
        connections: fields.connections,
        priority: fields.priority,
        folder: fields.folder,
        start_at,
        speed_limit: fields.speed_limit,
    };
    match state.add(input) {
        Ok(dl) => (StatusCode::CREATED, Json(public_download(&dl))).into_response(),
        Err(message) => json_error(StatusCode::BAD_REQUEST, &message),
    }
}

async fn api_pause_all(State(state): State<Arc<AppState>>) -> Json<Value> {
    state.pause_all();
    Json(json!({ "ok": true }))
}

async fn api_resume_all(State(state): State<Arc<AppState>>) -> Json<Value> {
    state.resume_all();
    Json(json!({ "ok": true }))
}

async fn api_download(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Response {
    match state.get_download(&id) {
        Some(dl) => Json(public_download(&dl)).into_response(),
        None => json_error(StatusCode::NOT_FOUND, "Download not found"),
    }
}

async fn api_clear_history(State(state): State<Arc<AppState>>) -> Response {
    let removed = state.clear_history();
    Json(json!({ "ok": true, "removed": removed })).into_response()
}

async fn api_action(
    State(state): State<Arc<AppState>>,
    Path((id, action)): Path<(String, String)>,
    body: Bytes,
) -> Response {
    let payload: Value = if body.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&body).unwrap_or_else(|_| json!({}))
    };
    let dl = match state.get_download(&id) {
        Some(dl) => dl,
        None => return json_error(StatusCode::NOT_FOUND, "Download not found"),
    };
    match action.as_str() {
        "pause" => state.pause(&id),
        "cancel" => state.cancel(&id),
        "resume" => state.resume(&id),
        "retry" => state.retry(&id),
        "start-now" => state.start_now(&id),
        "priority" => {
            let priority = payload.get("priority").and_then(|v| v.as_str());
            state.set_priority(&id, priority);
        }
        "speed-limit" => {
            let limit = payload
                .get("speedLimit")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            state.update_download(&id, |record| record.speed_limit = limit);
            state.emit(true);
            state.persist();
        }
        "again" => match state.again(&id) {
            Ok(Some(copy)) => {
                return (StatusCode::CREATED, Json(public_download(&copy))).into_response()
            }
            Ok(None) => return json_error(StatusCode::NOT_FOUND, "Download not found"),
            Err(message) => return json_error(StatusCode::BAD_REQUEST, &message),
        },
        "remove" => {
            let delete_file = payload
                .get("deleteFile")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            state.remove(&id, delete_file);
        }
        "open-folder" => {
            if let Some(path) = dl.save_path.as_deref() {
                reveal_in_explorer(path);
            } else if !dl.folder.is_empty() {
                open_folder(&dl.folder);
            } else {
                let folder = state.core.lock().settings.download_dir.clone();
                open_folder(&folder);
            }
        }
        "open-file" => {
            let Some(path) = dl.save_path.as_deref() else {
                return json_error(StatusCode::BAD_REQUEST, "File is not ready");
            };
            open_file(path);
        }
        "hash" => {
            if dl.save_path.is_none() {
                return json_error(StatusCode::BAD_REQUEST, "File is not ready");
            }
            return match state.compute_hash(&id).await {
                Ok(value) => Json(value).into_response(),
                Err(message) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &message),
            };
        }
        _ => return json_error(StatusCode::NOT_FOUND, "Not found"),
    }
    Json(json!({ "ok": true })).into_response()
}

async fn api_settings(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    state.update_settings(&body);
    let snapshot = state.snapshot_value();
    Json(snapshot.get("settings").cloned().unwrap_or(Value::Null))
}

async fn api_scan(State(state): State<Arc<AppState>>, Json(body): Json<Value>) -> Response {
    let Some(url) = body.get("url").and_then(|v| v.as_str()) else {
        return json_error(StatusCode::BAD_REQUEST, "url is required");
    };
    match scan_page(&state, url).await {
        Ok(value) => Json(value).into_response(),
        Err(message) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &message),
    }
}

async fn api_capture(State(state): State<Arc<AppState>>, Json(body): Json<Value>) -> Response {
    let fields = fields_from_value(&body);
    let Some(url) = fields.url.filter(|url| !url.trim().is_empty()) else {
        return json_error(StatusCode::BAD_REQUEST, "url is required");
    };
    let mut headers = HashMap::new();
    if let Some(referer) = fields.referer.or(fields.page_url.clone()) {
        headers.insert("referer".into(), referer);
    }
    if let Some(cookie) = fields.cookie {
        headers.insert("cookie".into(), cookie);
    }
    if let Some(user_agent) = fields.user_agent {
        headers.insert("user-agent".into(), user_agent);
    }
    if let Some(origin) = fields.origin {
        headers.insert("origin".into(), origin);
    }
    let input = AddInput {
        url,
        filename: fields.filename,
        kind: fields.kind,
        page_url: fields.page_url,
        headers,
        connections: None,
        priority: None,
        folder: None,
        start_at: None,
        speed_limit: fields.speed_limit,
    };
    match state.add(input) {
        Ok(dl) => (StatusCode::CREATED, Json(public_download(&dl))).into_response(),
        Err(message) => json_error(StatusCode::BAD_REQUEST, &message),
    }
}

async fn api_open_extension(State(state): State<Arc<AppState>>) -> Response {
    if !state.extension_dir.join("manifest.json").exists() {
        return json_error(StatusCode::NOT_FOUND, "Extension folder is missing");
    }
    open_folder(&state.extension_dir.to_string_lossy());
    Json(json!({ "ok": true })).into_response()
}

async fn api_open_downloads(State(state): State<Arc<AppState>>) -> Response {
    let folder = state.core.lock().settings.download_dir.clone();
    let _ = std::fs::create_dir_all(&folder);
    open_folder(&folder);
    Json(json!({ "ok": true })).into_response()
}

async fn api_open_data(State(state): State<Arc<AppState>>) -> Response {
    let folder = state.data_dir.to_string_lossy().to_string();
    let _ = std::fs::create_dir_all(&folder);
    open_folder(&folder);
    Json(json!({ "ok": true })).into_response()
}

async fn api_index(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "index.html", "text/html; charset=utf-8").await
}

async fn api_app(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "app.js", "text/javascript; charset=utf-8").await
}

async fn api_i18n(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "i18n.js", "text/javascript; charset=utf-8").await
}

async fn api_styles(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "styles.css", "text/css; charset=utf-8").await
}

async fn api_theme(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "theme.css", "text/css; charset=utf-8").await
}

async fn api_popup(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "popup.html", "text/html; charset=utf-8").await
}

async fn api_progress(State(state): State<Arc<AppState>>) -> Response {
    serve_ui(&state, "progress.html", "text/html; charset=utf-8").await
}

async fn serve_ui(state: &AppState, name: &str, content_type: &str) -> Response {
    let path = state.ui_dir.join(name);
    match tokio::fs::read(&path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, content_type),
                (header::CACHE_CONTROL, "no-store"),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

async fn api_asset(State(state): State<Arc<AppState>>, Path(name): Path<String>) -> Response {
    let safe = FsPath::new(&name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if safe.is_empty() || safe != name {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    let path = state.assets_dir.join(safe);
    serve_file(&path, "application/octet-stream").await
}

async fn api_vendor(State(state): State<Arc<AppState>>, Path(name): Path<String>) -> Response {
    let safe = FsPath::new(&name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if safe.is_empty() || safe != name {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    let path = state.ui_dir.join("vendor").join(safe);
    serve_file(&path, "application/octet-stream").await
}

async fn serve_file(path: &FsPath, fallback_mime: &str) -> Response {
    match tokio::fs::read(path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(path)
                .first_raw()
                .unwrap_or(fallback_mime);
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime),
                    (header::CACHE_CONTROL, "no-store"),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

async fn api_favicon(State(state): State<Arc<AppState>>) -> Response {
    let path = state.assets_dir.join("icon.ico");
    match tokio::fs::read(&path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "image/x-icon")],
            bytes,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

fn open_folder(path: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
}

fn reveal_in_explorer(path: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(format!("/select,{path}"))
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let parent = PathBuf::from(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());
        open_folder(&parent);
    }
}

fn open_file(path: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd.exe")
            .args(["/c", "start", "", path])
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
}

#[allow(dead_code)]
fn download_public(dl: &Download) -> Value {
    public_download(dl)
}
