use crate::model::*;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct RateLimiter {
    next_at: Mutex<u64>,
}

impl RateLimiter {
    pub fn reset(&self) {
        *self.next_at.lock() = 0;
    }

    pub async fn consume(
        &self,
        bytes: u64,
        rate: u64,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        if rate == 0 || bytes == 0 {
            return Ok(());
        }
        let now = now_ms();
        let start = {
            let mut next = self.next_at.lock();
            let start = now.max(*next);
            *next = start + (bytes as f64 / rate as f64 * 1000.0) as u64;
            start
        };
        if start > now {
            sleep_cancellable(start - now, token).await?;
        }
        Ok(())
    }
}

pub struct Core {
    pub settings: Settings,
    pub downloads: Vec<Download>,
    pub stats: Lifetime,
    pub active: HashSet<String>,
    pub cancels: HashMap<String, CancellationToken>,
    pub samples: HashMap<String, (u64, u64)>,
    pub reserved: HashSet<String>,
    last_emit: u64,
    emit_pending: bool,
}

pub type WindowOpener = Arc<dyn Fn() + Send + Sync>;

#[derive(Clone)]
pub struct CompletedNotice {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub folder: Option<String>,
    pub error: Option<String>,
}

pub type CompletedHook = Arc<dyn Fn(CompletedNotice) + Send + Sync>;
pub type CanceledHook = Arc<dyn Fn(String) + Send + Sync>;

#[derive(Clone)]
pub struct StartedNotice {
    pub id: String,
    pub name: String,
}

pub type StartedHook = Arc<dyn Fn(StartedNotice) + Send + Sync>;

pub struct AppState {
    pub core: Mutex<Core>,
    pub data_dir: PathBuf,
    pub temp_dir: PathBuf,
    pub store_path: PathBuf,
    pub ui_dir: PathBuf,
    pub assets_dir: PathBuf,
    pub extension_dir: PathBuf,
    pub version: String,
    pub tx: broadcast::Sender<String>,
    pub limiter: RateLimiter,
    pub client: reqwest::Client,
    pub ffmpeg: bool,
    opener: Mutex<Option<WindowOpener>>,
    completed_hook: Mutex<Option<CompletedHook>>,
    started_hook: Mutex<Option<StartedHook>>,
    canceled_hook: Mutex<Option<CanceledHook>>,
    clipboard: Mutex<Option<(String, u64)>>,
    save_pending: AtomicBool,
    extension_seen_at: AtomicU64,
    pub update_cache: Mutex<Option<(u64, Value)>>,
}

pub enum RunError {
    Cancelled,
    Failed(String),
}

impl RunError {
    pub fn failed(message: impl Into<String>) -> Self {
        RunError::Failed(message.into())
    }
}

impl From<std::io::Error> for RunError {
    fn from(err: std::io::Error) -> Self {
        RunError::Failed(err.to_string())
    }
}

pub fn is_cancelled(err: &RunError) -> bool {
    matches!(err, RunError::Cancelled)
}

pub async fn sleep_cancellable(ms: u64, token: &CancellationToken) -> Result<(), RunError> {
    tokio::select! {
        _ = token.cancelled() => Err(RunError::Cancelled),
        _ = tokio::time::sleep(Duration::from_millis(ms)) => Ok(()),
    }
}

pub async fn send_cancellable(
    request: reqwest::RequestBuilder,
    token: &CancellationToken,
) -> Result<reqwest::Response, RunError> {
    tokio::select! {
        _ = token.cancelled() => Err(RunError::Cancelled),
        result = request.send() => result.map_err(|err| RunError::Failed(err.to_string())),
    }
}

pub async fn next_chunk(
    response: &mut reqwest::Response,
    token: &CancellationToken,
) -> Result<Option<bytes::Bytes>, RunError> {
    tokio::select! {
        _ = token.cancelled() => Err(RunError::Cancelled),
        result = response.chunk() => result.map_err(|err| RunError::Failed(err.to_string())),
    }
}

pub async fn read_body(
    response: &mut reqwest::Response,
    token: &CancellationToken,
) -> Result<Vec<u8>, RunError> {
    let mut out = Vec::new();
    while let Some(chunk) = next_chunk(response, token).await? {
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

pub fn clean_headers(input: HashMap<String, String>) -> BTreeMap<String, String> {
    const ALLOWED: [&str; 7] = [
        "referer",
        "origin",
        "cookie",
        "user-agent",
        "accept",
        "accept-language",
        "authorization",
    ];
    let mut out = BTreeMap::new();
    for (key, value) in input {
        let name = key.to_ascii_lowercase();
        if !ALLOWED.contains(&name.as_str()) {
            continue;
        }
        if value.is_empty() || value.len() > 8192 || value.contains(['\r', '\n']) {
            continue;
        }
        out.insert(name, value);
    }
    out
}

pub fn request_headers(dl: &Download, extra: &[(&str, String)]) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderName, HeaderValue};
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        HeaderValue::from_static(USER_AGENT),
    );
    for (name, value) in &dl.headers {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            headers.insert(name, value);
        }
    }
    for (name, value) in extra {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            headers.insert(name, value);
        }
    }
    headers
}

impl AppState {
    pub fn new(
        data_dir: PathBuf,
        ui_dir: PathBuf,
        assets_dir: PathBuf,
        extension_dir: PathBuf,
    ) -> Arc<Self> {
        let _ = std::fs::create_dir_all(&data_dir);
        let temp_dir = data_dir.join("temp");
        let _ = std::fs::create_dir_all(&temp_dir);
        let store_path = data_dir.join("state.json");
        let mut persist = crate::store::load(&store_path);
        for dl in &mut persist.downloads {
            if dl.status == "downloading" {
                dl.status = "queued".into();
            }
            dl.speed = 0.0;
            dl.eta = None;
            for seg in &mut dl.segments {
                seg.downloaded = seg.downloaded.min(seg.end.saturating_sub(seg.start) + 1);
            }
        }
        let stats = persist.stats.clone().unwrap_or_default();
        let core = Core {
            settings: persist.settings,
            downloads: persist.downloads,
            stats,
            active: HashSet::new(),
            cancels: HashMap::new(),
            samples: HashMap::new(),
            reserved: HashSet::new(),
            last_emit: 0,
            emit_pending: false,
        };
        let (tx, _) = broadcast::channel(32);
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .connect_timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        let ffmpeg = std::process::Command::new("ffmpeg")
            .arg("-version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        Arc::new(Self {
            core: Mutex::new(core),
            data_dir,
            temp_dir,
            store_path,
            ui_dir,
            assets_dir,
            extension_dir,
            version: env!("CARGO_PKG_VERSION").to_string(),
            tx,
            limiter: RateLimiter::default(),
            client,
            ffmpeg,
            opener: Mutex::new(None),
            completed_hook: Mutex::new(None),
            started_hook: Mutex::new(None),
            canceled_hook: Mutex::new(None),
            clipboard: Mutex::new(None),
            save_pending: AtomicBool::new(false),
            extension_seen_at: AtomicU64::new(0),
            update_cache: Mutex::new(None),
        })
    }

    pub fn mark_extension_seen(&self) {
        self.extension_seen_at.store(now_ms(), Ordering::Relaxed);
    }

    pub fn extension_seen_at(&self) -> u64 {
        self.extension_seen_at.load(Ordering::Relaxed)
    }

    pub fn extension_connected(&self) -> bool {
        self.extension_seen_at() > 0
    }

    pub fn set_window_opener(&self, opener: WindowOpener) {
        *self.opener.lock() = Some(opener);
    }

    pub fn set_completed_hook(&self, hook: CompletedHook) {
        *self.completed_hook.lock() = Some(hook);
    }

    pub fn set_started_hook(&self, hook: StartedHook) {
        *self.started_hook.lock() = Some(hook);
    }

    pub fn set_canceled_hook(&self, hook: CanceledHook) {
        *self.canceled_hook.lock() = Some(hook);
    }

    pub fn open_window(&self) {
        let opener = self.opener.lock().clone();
        if let Some(opener) = opener {
            opener();
        }
    }

    pub fn start_background(self: &Arc<Self>) {
        let state = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(500));
            loop {
                interval.tick().await;
                state.tick();
            }
        });
        self.persist();
        self.schedule();
    }

    pub fn snapshot_value(&self) -> Value {
        let clipboard = self.clipboard.lock().clone();
        let core = self.core.lock();
        let downloads: Vec<Value> = core.downloads.iter().map(public_download).collect();
        let active = core
            .downloads
            .iter()
            .filter(|d| d.status == "downloading")
            .count();
        let queued = core
            .downloads
            .iter()
            .filter(|d| d.status == "queued")
            .count();
        let paused = core
            .downloads
            .iter()
            .filter(|d| d.status == "paused")
            .count();
        let completed = core
            .downloads
            .iter()
            .filter(|d| d.status == "completed")
            .count();
        let failed = core
            .downloads
            .iter()
            .filter(|d| d.status == "failed")
            .count();
        let now = now_ms();
        let scheduled = core
            .downloads
            .iter()
            .filter(|d| {
                d.status == "queued" && d.start_at.map(|t| t > now).unwrap_or(false)
            })
            .count();
        let saved_bytes: u64 = core
            .downloads
            .iter()
            .filter(|d| d.status == "completed")
            .map(|d| d.size.unwrap_or(0))
            .sum();
        let total_speed: f64 = core
            .downloads
            .iter()
            .filter(|d| d.status == "downloading")
            .map(|d| d.speed)
            .sum();
        let total_speed = if total_speed == 0.0 { 0.0 } else { total_speed };
        json!({
            "version": self.version,
            "settings": core.settings,
            "downloads": downloads,
            "stats": {
                "active": active,
                "queued": queued,
                "paused": paused,
                "completed": completed,
                "failed": failed,
                "scheduled": scheduled,
                "savedBytes": saved_bytes,
                "totalSpeed": total_speed,
                "lifetime": core.stats,
            },
            "capabilities": { "ffmpeg": self.ffmpeg },
            "clipboard": clipboard.map(|(url, at)| json!({ "url": url, "at": at })),
        })
    }

    pub fn set_clipboard_link(self: &Arc<Self>, url: String) {
        {
            let mut clipboard = self.clipboard.lock();
            if clipboard
                .as_ref()
                .map(|(existing, _)| existing == &url)
                .unwrap_or(false)
            {
                return;
            }
            *clipboard = Some((url, now_ms()));
        }
        self.emit(true);
    }

    pub fn broadcast_state(&self) {
        if self.tx.receiver_count() == 0 {
            return;
        }
        let value = self.snapshot_value();
        if let Ok(text) = serde_json::to_string(&value) {
            let _ = self.tx.send(text);
        }
    }

    pub fn emit(self: &Arc<Self>, force: bool) {
        let now = now_ms();
        let mut send_now = false;
        let mut spawn_trailing = false;
        {
            let mut core = self.core.lock();
            if force || now.saturating_sub(core.last_emit) >= 220 {
                core.last_emit = now;
                core.emit_pending = false;
                send_now = true;
            } else if !core.emit_pending {
                core.emit_pending = true;
                spawn_trailing = true;
            }
        }
        if send_now {
            self.broadcast_state();
        }
        if spawn_trailing {
            let state = self.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(220)).await;
                {
                    let mut core = state.core.lock();
                    core.emit_pending = false;
                    core.last_emit = now_ms();
                }
                state.broadcast_state();
            });
        }
    }

    pub fn save_soon(self: &Arc<Self>) {
        if self.save_pending.swap(true, Ordering::SeqCst) {
            return;
        }
        let state = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(700)).await;
            state.save_pending.store(false, Ordering::SeqCst);
            state.persist();
        });
    }

    pub fn persist(&self) {
        let persist = {
            let core = self.core.lock();
            PersistState {
                settings: core.settings.clone(),
                downloads: core.downloads.clone(),
                stats: Some(core.stats.clone()),
            }
        };
        if let Err(err) = crate::store::save(&self.store_path, &persist) {
            eprintln!("[store] save failed: {err}");
        }
    }

    pub fn rate_for(&self, id: &str) -> u64 {
        let core = self.core.lock();
        let per_download = core
            .downloads
            .iter()
            .find(|d| d.id == id)
            .map(|d| d.speed_limit)
            .unwrap_or(0);
        combined_rate(core.settings.speed_limit, per_download)
    }

    pub fn update_download<F: FnOnce(&mut Download)>(&self, id: &str, update: F) {
        let mut core = self.core.lock();
        if let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) {
            update(dl);
        }
    }

    pub fn get_download(&self, id: &str) -> Option<Download> {
        self.core
            .lock()
            .downloads
            .iter()
            .find(|d| d.id == id)
            .cloned()
    }

    pub fn add(self: &Arc<Self>, input: AddInput) -> Result<Download, String> {
        let url = validate_url(&input.url)?;
        if is_protected_video_host(&host_of(&url)) {
            return Err(PROTECTED_VIDEO_MESSAGE.to_string());
        }
        let mut start_at = normalize_start_at(input.start_at);
        let kind = if input.kind.as_deref() == Some("hls") || is_hls_url(&url) {
            "hls"
        } else if input.kind.as_deref() == Some("dash") || is_dash_url(&url) {
            "dash"
        } else {
            "file"
        };
        let now = now_ms();
        if let Some(t) = start_at {
            if t <= now {
                start_at = None;
            }
        }

        let new_id;
        {
            let mut core = self.core.lock();
            if let Some(existing) = core.downloads.iter_mut().find(|d| {
                d.url == url && (d.status == "queued" || d.status == "downloading" || d.status == "paused")
            }) {
                if existing.status == "paused" {
                    existing.status = "queued".into();
                    existing.error = None;
                    existing.retry_at = None;
                    existing.attempts = 0;
                    let id = existing.id.clone();
                    drop(core);
                    self.emit(true);
                    self.persist();
                    self.schedule();
                    return self.get_download(&id).ok_or_else(|| "Download vanished".to_string());
                }
                return Ok(existing.clone());
            }

            let settings = core.settings.clone();
            let connections = input
                .connections
                .unwrap_or(settings.connections)
                .clamp(1, 32);
            let mut dl = Download {
                id: uuid::Uuid::new_v4().to_string(),
                url: url.clone(),
                kind: kind.to_string(),
                page_url: input.page_url.clone(),
                filename: input.filename.as_deref().map(sanitize_filename),
                folder: input
                    .folder
                    .clone()
                    .filter(|f| !f.trim().is_empty())
                    .unwrap_or(settings.download_dir.clone()),
                connections,
                speed_limit: input.speed_limit.unwrap_or(0),
                headers: clean_headers(input.headers.clone()),
                priority: normalize_priority(input.priority.as_deref()),
                start_at,
                created_at: now,
                ..Download::default()
            };
            if let Some(name) = &dl.filename {
                dl.category = category_for(name, kind);
                dl.media_kind = media_kind_for(&dl.category);
            }
            new_id = dl.id.clone();
            core.downloads.insert(0, dl);
        }
        self.emit(true);
        self.persist();
        self.schedule();
        self.get_download(&new_id)
            .ok_or_else(|| "Download vanished".to_string())
    }
}

impl AppState {
    pub fn schedule(self: &Arc<Self>) {
        let mut to_start = Vec::new();
        let mut started = Vec::new();
        {
            let mut core = self.core.lock();
            let limit = core.settings.max_concurrent.clamp(1, 8) as usize;
            loop {
                if core.active.len() >= limit || to_start.len() >= 32 {
                    break;
                }
                let now = now_ms();
                let mut best: Option<(usize, i32, u64)> = None;
                for (index, dl) in core.downloads.iter().enumerate() {
                    if dl.status != "queued" {
                        continue;
                    }
                    if dl.start_at.map(|t| t > now).unwrap_or(false) {
                        continue;
                    }
                    if dl.retry_at.map(|t| t > now).unwrap_or(false) {
                        continue;
                    }
                    let rank = priority_rank(&dl.priority);
                    let better = match best {
                        None => true,
                        Some((_, best_rank, best_created)) => {
                            rank > best_rank
                                || (rank == best_rank && dl.created_at < best_created)
                        }
                    };
                    if better {
                        best = Some((index, rank, dl.created_at));
                    }
                }
                let Some((index, _, _)) = best else {
                    break;
                };
                let (id, name) = {
                    let dl = &mut core.downloads[index];
                    dl.status = "downloading".into();
                    dl.error = None;
                    dl.speed = 0.0;
                    dl.eta = None;
                    (
                        dl.id.clone(),
                        dl.filename.clone().unwrap_or_else(|| dl.url.clone()),
                    )
                };
                core.active.insert(id.clone());
                started.push(StartedNotice { id: id.clone(), name });
                to_start.push(id);
            }
        }
        for id in to_start {
            self.spawn_run(id);
        }
        if let Some(hook) = self.started_hook.lock().clone() {
            for notice in started {
                hook(notice);
            }
        }
    }

    pub fn spawn_run(self: &Arc<Self>, id: String) {
        let state = self.clone();
        tokio::spawn(async move {
            let token = CancellationToken::new();
            {
                let mut core = state.core.lock();
                core.cancels.insert(id.clone(), token.clone());
            }
            state.emit(true);
            state.persist();
            let result = state.run_download(&id, &token).await;
            state.finalize(&id, result).await;
        });
    }

    async fn run_download(
        self: &Arc<Self>,
        id: &str,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let kind = match self.get_download(id) {
            Some(dl) if dl.status != "canceled" => dl.kind,
            _ => return Err(RunError::Cancelled),
        };
        match kind.as_str() {
            "hls" => self.run_hls(id, token).await,
            "dash" => self.run_dash(id, token).await,
            _ => self.run_file(id, token).await,
        }
    }

    async fn finalize(self: &Arc<Self>, id: &str, result: Result<(), RunError>) {
        let mut stat_completed = 0u64;
        let mut stat_bytes = 0u64;
        let mut stat_failed = 0u64;
        let mut finished: Option<CompletedNotice> = None;
        {
            let mut core = self.core.lock();
            core.cancels.remove(id);
            core.active.remove(id);
            core.samples.remove(id);
            let Some(index) = core.downloads.iter().position(|d| d.id == id) else {
                drop(core);
                self.emit(true);
                self.save_soon();
                self.schedule();
                return;
            };
            let now = now_ms();
            let retry_limit = core.settings.auto_retry.clamp(0, 5);
            let dl = &mut core.downloads[index];
            match result {
                Ok(()) => {
                    dl.status = "completed".into();
                    dl.completed_at = Some(now);
                    dl.speed = 0.0;
                    dl.eta = Some(0.0);
                    if dl.kind == "file" {
                        if let Some(size) = dl.size {
                            dl.received = size;
                        }
                    }
                    dl.error = None;
                    stat_completed = 1;
                    stat_bytes = dl.size.unwrap_or(dl.received);
                    let folder = dl
                        .save_path
                        .as_deref()
                        .and_then(|path| std::path::Path::new(path).parent())
                        .map(|parent| parent.to_string_lossy().to_string())
                        .filter(|parent| !parent.is_empty())
                        .or_else(|| (!dl.folder.is_empty()).then(|| dl.folder.clone()));
                    finished = Some(CompletedNotice {
                        id: dl.id.clone(),
                        name: dl.filename.clone().unwrap_or_else(|| dl.url.clone()),
                        bytes: dl.size.unwrap_or(dl.received),
                        folder,
                        error: None,
                    });
                }
                Err(RunError::Cancelled) => {
                    if dl.status != "canceled" {
                        dl.status = "paused".into();
                    }
                    dl.speed = 0.0;
                    dl.eta = None;
                    dl.retry_at = None;
                }
                Err(RunError::Failed(message)) => {
                    if dl.status == "canceled" {
                        dl.speed = 0.0;
                        dl.eta = None;
                        dl.retry_at = None;
                    } else {
                        let status = http_status_of(&message);
                        let retryable =
                            !(status >= 400 && status < 500 && status != 408 && status != 429);
                        let attempts = dl.attempts;
                        dl.speed = 0.0;
                        dl.eta = None;
                        if retryable && attempts < retry_limit {
                            dl.attempts = attempts + 1;
                            dl.status = "queued".into();
                            dl.error = Some(message);
                            let wait =
                                1500u64.saturating_mul(2u64.saturating_pow(attempts.min(6)));
                            dl.retry_at = Some(now + wait.min(60000));
                        } else {
                            dl.status = "failed".into();
                            dl.error = Some(message.clone());
                            dl.retry_at = None;
                            stat_failed = 1;
                            finished = Some(CompletedNotice {
                                id: dl.id.clone(),
                                name: dl.filename.clone().unwrap_or_else(|| dl.url.clone()),
                                bytes: dl.received,
                                folder: None,
                                error: Some(message),
                            });
                        }
                    }
                }
            }
            core.stats.completed += stat_completed;
            core.stats.bytes += stat_bytes;
            core.stats.failed += stat_failed;
        }
        self.emit(true);
        self.persist();
        self.schedule();
        if let Some(notice) = finished {
            let hook = self.completed_hook.lock().clone();
            if let Some(hook) = hook {
                hook(notice);
            }
        }
    }

    pub fn tick(self: &Arc<Self>) {
        let mut dirty = false;
        let need_schedule;
        {
            let mut core = self.core.lock();
            let now = now_ms();
            let Core {
                downloads, samples, ..
            } = &mut *core;
            for dl in downloads.iter_mut() {
                if dl.status == "downloading" {
                    let bytes = if dl.kind == "file"
                        && dl.resumable == Some(true)
                        && !dl.segments.is_empty()
                    {
                        dl.segments.iter().map(|s| s.downloaded).sum()
                    } else {
                        dl.received
                    };
                    match samples.get(&dl.id).copied() {
                        None => {
                            samples.insert(dl.id.clone(), (now, bytes));
                        }
                        Some((at, prev_bytes)) => {
                            if now.saturating_sub(at) >= 400 {
                                let elapsed = (now - at) as f64 / 1000.0;
                                let instant = if elapsed > 0.0 {
                                    bytes.saturating_sub(prev_bytes) as f64 / elapsed
                                } else {
                                    0.0
                                };
                                dl.speed = if dl.speed > 0.0 {
                                    dl.speed * 0.55 + instant * 0.45
                                } else {
                                    instant
                                };
                                dl.received = bytes;
                                if let Some(size) = dl.size {
                                    if size > 0 && dl.speed > 1.0 {
                                        dl.eta = Some(
                                            (size.saturating_sub(bytes) as f64 / dl.speed).max(0.0),
                                        );
                                    } else {
                                        dl.eta = None;
                                    }
                                } else {
                                    dl.eta = None;
                                }
                                samples.insert(dl.id.clone(), (now, bytes));
                                dirty = true;
                            }
                        }
                    }
                } else if dl.speed != 0.0 || dl.eta.is_some() {
                    dl.speed = 0.0;
                    dl.eta = None;
                    dirty = true;
                }
            }
            need_schedule = core.downloads.iter().any(|d| {
                d.status == "queued"
                    && (d.start_at.map(|t| t <= now).unwrap_or(false)
                        || d.retry_at.map(|t| t <= now).unwrap_or(false))
            });
        }
        if dirty {
            self.emit(false);
            self.save_soon();
        }
        if need_schedule {
            self.schedule();
        }
    }

    pub fn pause(self: &Arc<Self>, id: &str) {
        let mut changed = false;
        {
            let mut core = self.core.lock();
            let token = core.cancels.get(id).cloned();
            let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) else {
                return;
            };
            if dl.status == "downloading" {
                dl.status = "paused".into();
                if dl.kind == "file" && dl.resumable == Some(true) && !dl.segments.is_empty() {
                    dl.received = dl.segments.iter().map(|s| s.downloaded).sum();
                }
                if let Some(token) = token {
                    token.cancel();
                }
                changed = true;
            } else if dl.status == "queued" {
                dl.status = "paused".into();
                changed = true;
            }
            if !changed {
                return;
            }
            dl.speed = 0.0;
            dl.eta = None;
            dl.retry_at = None;
        }
        self.emit(true);
        self.persist();
        self.schedule();
    }

    pub fn cancel(self: &Arc<Self>, id: &str) {
        let mut changed = false;
        {
            let mut core = self.core.lock();
            let token = core.cancels.get(id).cloned();
            let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) else {
                return;
            };
            if !matches!(dl.status.as_str(), "downloading" | "queued" | "paused") {
                return;
            }
            dl.status = "canceled".into();
            if dl.kind == "file" && dl.resumable == Some(true) && !dl.segments.is_empty() {
                dl.received = dl.segments.iter().map(|s| s.downloaded).sum();
            }
            dl.speed = 0.0;
            dl.eta = None;
            dl.retry_at = None;
            dl.attempts = 0;
            if let Some(token) = token {
                token.cancel();
            }
            changed = true;
        }
        if changed {
            self.emit(true);
            self.persist();
            self.schedule();
            let hook = self.canceled_hook.lock().clone();
            if let Some(hook) = hook {
                hook(id.to_string());
            }
        }
    }

    pub fn resume(self: &Arc<Self>, id: &str) {
        {
            let mut core = self.core.lock();
            let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) else {
                return;
            };
            if dl.status != "paused" && dl.status != "failed" {
                return;
            }
            dl.status = "queued".into();
            dl.error = None;
            dl.attempts = 0;
            dl.retry_at = None;
        }
        self.emit(true);
        self.persist();
        self.schedule();
    }

    pub fn retry(self: &Arc<Self>, id: &str) {
        {
            let mut core = self.core.lock();
            if core.active.contains(id) {
                return;
            }
            let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) else {
                return;
            };
            dl.status = "queued".into();
            dl.error = None;
            dl.attempts = 0;
            dl.retry_at = None;
        }
        self.emit(true);
        self.persist();
        self.schedule();
    }

    pub fn start_now(self: &Arc<Self>, id: &str) {
        {
            let mut core = self.core.lock();
            if core.active.contains(id) {
                return;
            }
            let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) else {
                return;
            };
            if dl.status == "downloading" || dl.status == "completed" {
                return;
            }
            dl.status = "downloading".into();
            dl.start_at = None;
            dl.retry_at = None;
            dl.attempts = 0;
            dl.error = None;
            dl.speed = 0.0;
            dl.eta = None;
            core.active.insert(id.to_string());
        }
        self.emit(true);
        self.persist();
        self.spawn_run(id.to_string());
    }

    pub fn set_priority(self: &Arc<Self>, id: &str, priority: Option<&str>) {
        let mut found = false;
        {
            let mut core = self.core.lock();
            if let Some(dl) = core.downloads.iter_mut().find(|d| d.id == id) {
                dl.priority = normalize_priority(priority);
                found = true;
            }
        }
        if found {
            self.emit(true);
            self.persist();
            self.schedule();
        }
    }

    pub fn again(self: &Arc<Self>, id: &str) -> Result<Option<Download>, String> {
        let dl = match self.get_download(id) {
            Some(dl) => dl,
            None => return Ok(None),
        };
        let headers: HashMap<String, String> =
            dl.headers.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        let added = self.add(AddInput {
            url: dl.url,
            filename: dl.filename,
            kind: Some(dl.kind),
            page_url: dl.page_url,
            headers,
            connections: Some(dl.connections),
            priority: Some(dl.priority),
            folder: Some(dl.folder),
            start_at: None,
            speed_limit: Some(dl.speed_limit).filter(|limit| *limit > 0),
        })?;
        Ok(Some(added))
    }

    pub fn remove(self: &Arc<Self>, id: &str, delete_file: bool) {
        let mut removed = None;
        {
            let mut core = self.core.lock();
            if let Some(token) = core.cancels.get(id) {
                token.cancel();
            }
            if let Some(index) = core.downloads.iter().position(|d| d.id == id) {
                removed = Some(core.downloads.remove(index));
            }
        }
        if let Some(dl) = removed {
            let temp = self.temp_dir.join(id);
            tokio::spawn(async move {
                let _ = tokio::fs::remove_dir_all(&temp).await;
            });
            if delete_file {
                if let Some(path) = dl.save_path {
                    tokio::spawn(async move {
                        let _ = tokio::fs::remove_file(&path).await;
                    });
                }
            }
            self.emit(true);
            self.persist();
            self.schedule();
        }
    }

    pub fn clear_history(self: &Arc<Self>) -> usize {
        let mut removed_ids = Vec::new();
        {
            let mut core = self.core.lock();
            core.downloads.retain(|dl| {
                let terminal = matches!(dl.status.as_str(), "completed" | "failed" | "canceled");
                if terminal {
                    removed_ids.push(dl.id.clone());
                }
                !terminal
            });
        }
        if removed_ids.is_empty() {
            return 0;
        }
        let count = removed_ids.len();
        for id in removed_ids {
            let temp = self.temp_dir.join(id);
            tokio::spawn(async move {
                let _ = tokio::fs::remove_dir_all(&temp).await;
            });
        }
        self.emit(true);
        self.persist();
        count
    }

    pub fn pause_all(self: &Arc<Self>) {
        let ids: Vec<String> = {
            let core = self.core.lock();
            core.downloads
                .iter()
                .filter(|d| d.status == "downloading" || d.status == "queued")
                .map(|d| d.id.clone())
                .collect()
        };
        for id in ids {
            self.pause(&id);
        }
    }

    pub fn resume_all(self: &Arc<Self>) {
        let ids: Vec<String> = {
            let core = self.core.lock();
            core.downloads
                .iter()
                .filter(|d| d.status == "paused")
                .map(|d| d.id.clone())
                .collect()
        };
        for id in ids {
            self.resume(&id);
        }
    }

    pub fn update_settings(self: &Arc<Self>, patch: &Value) {
        {
            let mut core = self.core.lock();
            let previous_dir = core.settings.download_dir.clone();
            let mut next_dir = previous_dir.clone();
            if let Some(dir) = patch.get("downloadDir").and_then(|v| v.as_str()) {
                let dir = dir.trim();
                if !dir.is_empty() {
                    next_dir = dir.to_string();
                }
            }
            core.settings.download_dir = next_dir.clone();
            let settings = &mut core.settings;
            if let Some(value) = patch.get("maxConcurrent") {
                let number = value.as_f64().unwrap_or(0.0);
                settings.max_concurrent = if number > 0.0 {
                    number.clamp(1.0, 8.0) as u32
                } else {
                    3
                };
            }
            if let Some(value) = patch.get("connections") {
                let number = value.as_f64().unwrap_or(0.0);
                settings.connections = if number > 0.0 {
                    number.clamp(1.0, 32.0) as u32
                } else {
                    8
                };
            }
            if let Some(value) = patch.get("speedLimit") {
                let number = value.as_f64().unwrap_or(0.0);
                settings.speed_limit = if number.is_finite() && number > 0.0 {
                    (number.min(1024.0 * 1024.0 * 1024.0)) as u64
                } else {
                    0
                };
                self.limiter.reset();
            }
            if let Some(value) = patch.get("autoRetry") {
                let number = value.as_f64().unwrap_or(0.0);
                settings.auto_retry = number.clamp(0.0, 5.0) as u32;
            }
            if let Some(value) = patch.get("organizeByCategory") {
                settings.organize_by_category = value.as_bool().unwrap_or(false);
            }
            for key in [
                "clipboardWatch",
                "notifications",
                "minimizeToTray",
                "launchAtLogin",
                "checkUpdates",
            ] {
                if let Some(value) = patch.get(key) {
                    let flag = value.as_bool().unwrap_or(false);
                    match key {
                        "clipboardWatch" => settings.clipboard_watch = flag,
                        "notifications" => settings.notifications = flag,
                        "minimizeToTray" => settings.minimize_to_tray = flag,
                        "launchAtLogin" => settings.launch_at_login = flag,
                        "checkUpdates" => settings.check_updates = flag,
                        _ => {}
                    }
                }
            }
            if let Some(theme) = patch.get("theme").and_then(|v| v.as_str()) {
                if theme == "dark" || theme == "light" {
                    settings.theme = theme.to_string();
                }
            }
            if let Some(value) = patch.get("compactMode") {
                settings.compact_mode = value.as_bool().unwrap_or(false);
            }
            if let Some(value) = patch.get("reduceMotion") {
                settings.reduce_motion = value.as_bool().unwrap_or(false);
            }
            if next_dir != previous_dir {
                for dl in core.downloads.iter_mut() {
                    if matches!(dl.status.as_str(), "queued" | "downloading" | "paused")
                        && dl.folder.trim() == previous_dir.trim()
                    {
                        dl.folder = next_dir.clone();
                    }
                }
            }
        }
        self.emit(true);
        self.persist();
        self.schedule();
    }

    pub async fn compute_hash(self: &Arc<Self>, id: &str) -> Result<Value, String> {
        use sha2::{Digest, Sha256};
        let dl = self.get_download(id).ok_or("Download not found")?;
        let path = dl.save_path.clone().ok_or("The file is not ready yet")?;
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|err| err.to_string())?;
        let size = metadata.len();
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let (Some(cached), Some(hash_size), Some(hash_mtime)) =
            (&dl.sha256, dl.hash_size, dl.hash_mtime_ms)
        {
            if hash_size == size && hash_mtime == mtime_ms {
                return Ok(json!({ "sha256": cached, "size": size, "cached": true }));
            }
        }
        let mut file = tokio::fs::File::open(&path)
            .await
            .map_err(|err| err.to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 256 * 1024];
        use tokio::io::AsyncReadExt;
        loop {
            let read = file
                .read(&mut buffer)
                .await
                .map_err(|err| err.to_string())?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        let sha256 = hex::encode(hasher.finalize());
        self.update_download(id, |record| {
            record.sha256 = Some(sha256.clone());
            record.hash_size = Some(size);
            record.hash_mtime_ms = Some(mtime_ms);
        });
        self.emit(true);
        self.persist();
        Ok(json!({ "sha256": sha256, "size": size, "cached": false }))
    }
}

pub struct AddInput {
    pub url: String,
    pub filename: Option<String>,
    pub kind: Option<String>,
    pub page_url: Option<String>,
    pub headers: HashMap<String, String>,
    pub connections: Option<u32>,
    pub priority: Option<String>,
    pub folder: Option<String>,
    pub start_at: Option<u64>,
    pub speed_limit: Option<u64>,
}

impl Default for AddInput {
    fn default() -> Self {
        Self {
            url: String::new(),
            filename: None,
            kind: None,
            page_url: None,
            headers: HashMap::new(),
            connections: None,
            priority: None,
            folder: None,
            start_at: None,
            speed_limit: None,
        }
    }
}

pub fn validate_url(value: &str) -> Result<String, String> {
    let url = url::Url::parse(value.trim()).map_err(|_| "Invalid URL".to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(url.to_string()),
        _ => Err("Only http and https URLs are supported".into()),
    }
}

pub fn normalize_start_at(value: Option<u64>) -> Option<u64> {
    value.filter(|t| *t > now_ms())
}

pub fn is_hls_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let stripped = lower.split(['?', '#']).next().unwrap_or("");
    stripped.ends_with(".m3u8")
}

pub fn is_dash_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let stripped = lower.split(['?', '#']).next().unwrap_or("");
    stripped.ends_with(".mpd")
}

pub fn http_status_of(message: &str) -> u32 {
    let re = regex::Regex::new(r"(?:HTTP|returned)\s+(\d{3})").unwrap();
    re.captures(message)
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0)
}

pub fn disposition_filename(value: &str) -> Option<String> {
    let star = regex::Regex::new(r#"(?i)filename\*=(?:UTF-8'')?([^;]+)"#).ok()?;
    if let Some(caps) = star.captures(value) {
        let raw = caps.get(1)?.as_str().trim().trim_matches('"');
        if let Ok(decoded) = percent_encoding::percent_decode_str(raw).decode_utf8() {
            return Some(decoded.to_string());
        }
    }
    let plain = regex::Regex::new(r#"(?i)filename=("([^"]+)"|([^;]+))"#).ok()?;
    if let Some(caps) = plain.captures(value) {
        let name = caps
            .get(2)
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().trim().to_string());
        return name.filter(|n| !n.is_empty());
    }
    None
}

pub fn find_part_file(dir: &Path, index: u32) -> PathBuf {
    dir.join(format!("part-{index}"))
}

pub fn find_hls_segment_file(dir: &Path, index: usize) -> PathBuf {
    dir.join(format!("hls-{index:05}"))
}

pub fn dash_file_name(key: &str, index: usize) -> String {
    format!("{key}-{index:06}")
}
