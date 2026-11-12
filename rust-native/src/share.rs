//! Session-only, read-only LAN sharing. This router never receives AppState.
use crate::model::{now_ms, Download};
use argon2::password_hash::{PasswordHash, SaltString};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::{File, Metadata, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Component, Path as FsPath, PathBuf};
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};
use tokio::sync::{mpsc, Mutex as AsyncMutex, OwnedSemaphorePermit, Semaphore};
use tokio::task::JoinHandle;
use tokio::time::Instant;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const LIFETIME: Duration = Duration::from_secs(8 * 60 * 60);
const PERSISTENT_COOKIE: u64 = 365 * 24 * 60 * 60;
const CHUNK_SIZE: usize = 64 * 1024;
const MAX_FILES: usize = 200;
const ATTEMPT_WINDOW: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS: usize = 5;
const MAX_CHECKS: usize = 2;
const MAX_RATE_PEERS: usize = 64;
const PASSWORD_ERROR: &str = "Password must be 8 to 128 characters";
const FILE_ERROR: &str =
    "Selected files must be completed regular files inside their download folder, without links";
const FOLDER_ERROR: &str = "The downloads folder is not available for sharing";
const MAX_RELATIVE_PATH: usize = 1024;
const MAX_LIST_ENTRIES: usize = 1000;

#[derive(Clone, Serialize, Deserialize)]
pub struct LanInterface {
    pub address: String,
    pub label: String,
    pub prefix: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareStatus {
    enabled: bool,
    url: Option<String>,
    file_ids: Vec<String>,
    interfaces: Vec<LanInterface>,
    expires_at: Option<u64>,
    password_protected: bool,
    folder: bool,
    lifetime: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartShare {
    pub address: String,
    #[serde(default)]
    pub file_ids: Vec<String>,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub folder: bool,
    #[serde(default)]
    pub lifetime: String,
}

#[derive(Default)]
pub struct ShareManager {
    running: Arc<AsyncMutex<Option<Running>>>,
}

struct Running {
    session: Arc<Session>,
    url: String,
    file_ids: Vec<String>,
    server: JoinHandle<()>,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.session.cancel.cancel();
    }
}

impl Running {
    async fn stop(mut self) {
        self.session.cancel.cancel();
        if tokio::time::timeout(Duration::from_secs(1), &mut self.server)
            .await
            .is_err()
        {
            self.server.abort();
        }
    }
}

impl ShareManager {
    pub async fn status(&self) -> ShareStatus {
        let interfaces = interfaces().await;
        let mut running = self.running.lock().await;
        if running.as_ref().is_some_and(|r| !r.session.active()) {
            if let Some(old) = running.take() {
                old.stop().await;
            }
        }
        status_of(running.as_ref(), interfaces)
    }

    pub async fn stop(&self) -> ShareStatus {
        let mut running = self.running.lock().await;
        if let Some(old) = running.take() {
            old.stop().await;
        }
        status_of(None, interfaces().await)
    }

    pub async fn start(
        &self,
        input: StartShare,
        downloads: Vec<Download>,
        download_dir: String,
    ) -> Result<ShareStatus, &'static str> {
        // Serialize start/stop, including validation, so a late start cannot undo a stop.
        let mut running = self.running.lock().await;
        let available = interfaces().await;
        let interface = verified_interface(&input.address, &available)?;
        let address: Ipv4Addr = interface
            .address
            .parse()
            .map_err(|_| "Invalid LAN address")?;
        let prefix = interface.prefix;
        let password = validated_password(input.password)?;
        let (lifetime, lifetime_label) = share_lifetime(&input.lifetime)?;
        let (content, file_ids) = if input.folder {
            let folder = tokio::task::spawn_blocking(move || {
                FolderRoot::new(FsPath::new(&download_dir))
            })
            .await
            .map_err(|_| FOLDER_ERROR)?
            .map_err(|_| FOLDER_ERROR)?;
            (ShareContent::Folder(Arc::new(folder)), Vec::new())
        } else {
            let ids = input.file_ids;
            let file_ids = ids.clone();
            let files = tokio::task::spawn_blocking(move || prepare_files(&ids, &downloads))
                .await
                .map_err(|_| FILE_ERROR)??;
            (ShareContent::Files(files), file_ids)
        };
        let password = match password {
            Some(password) => Some(
                tokio::task::spawn_blocking(move || hash_password(&password))
                    .await
                    .map_err(|_| PASSWORD_ERROR)??,
            ),
            None => None,
        };
        let listener = tokio::net::TcpListener::bind((address, 0))
            .await
            .map_err(|_| "Could not listen on the selected LAN interface")?;
        let socket = listener
            .local_addr()
            .map_err(|_| "Could not read LAN listener address")?;
        let token = new_secret();
        let mut session = Session::new(
            address,
            prefix,
            socket.port(),
            content,
            &token,
            password,
        );
        session.set_lifetime(lifetime, lifetime_label);
        let session = Arc::new(session);
        // Failed validation/bind preserves the existing share. Successful replacement revokes it.
        if let Some(old) = running.take() {
            old.stop().await;
        }
        let server_session = session.clone();
        let server = tokio::spawn(async move {
            let cancel = server_session.cancel.clone();
            let app = lan_router(server_session);
            let _ = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(cancel.clone().cancelled_owned())
            .await;
            cancel.cancel();
        });
        let url = format!("http://{socket}/#{token}");
        *running = Some(Running {
            session: session.clone(),
            url,
            file_ids,
            server,
        });
        self.expire(session);
        Ok(status_of(running.as_ref(), available))
    }

    fn expire(&self, session: Arc<Session>) -> JoinHandle<()> {
        let weak = Arc::downgrade(&self.running);
        tokio::spawn(async move {
            match session.deadline {
                Some(deadline) => {
                    tokio::select! {
                        _ = session.cancel.cancelled() => {},
                        _ = tokio::time::sleep_until(deadline) => session.cancel.cancel(),
                    }
                }
                None => session.cancel.cancelled().await,
            }
            if let Some(manager) = weak.upgrade() {
                let old = {
                    let mut slot = manager.lock().await;
                    if slot
                        .as_ref()
                        .is_some_and(|r| Arc::ptr_eq(&r.session, &session))
                    {
                        slot.take()
                    } else {
                        None
                    }
                };
                if let Some(old) = old {
                    old.stop().await;
                }
            }
        })
    }
}

fn status_of(running: Option<&Running>, interfaces: Vec<LanInterface>) -> ShareStatus {
    ShareStatus {
        enabled: running.is_some(),
        url: running.map(|r| r.url.clone()),
        file_ids: running.map(|r| r.file_ids.clone()).unwrap_or_default(),
        expires_at: running.and_then(|r| r.session.expires_at),
        password_protected: running.is_some_and(|r| r.session.password.is_some()),
        folder: running.is_some_and(|r| r.session.folder()),
        lifetime: running
            .map(|r| r.session.lifetime.clone())
            .unwrap_or_default(),
        interfaces,
    }
}

fn share_lifetime(value: &str) -> Result<(Option<Duration>, &'static str), &'static str> {
    match value {
        "" | "8h" => Ok((Some(Duration::from_secs(8 * 60 * 60)), "8h")),
        "1h" => Ok((Some(Duration::from_secs(60 * 60)), "1h")),
        "24h" => Ok((Some(Duration::from_secs(24 * 60 * 60)), "24h")),
        "always" => Ok((None, "always")),
        _ => Err("Invalid access period"),
    }
}

fn validated_password(password: String) -> Result<Option<String>, &'static str> {
    if password.is_empty() {
        return Ok(None);
    }
    if password.chars().count() < 8 || password.chars().count() > 128 || password.len() > 512 {
        return Err(PASSWORD_ERROR);
    }
    Ok(Some(password))
}

fn hash_password(password: &str) -> Result<Arc<PasswordCheck>, &'static str> {
    let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes()).map_err(|_| PASSWORD_ERROR)?;
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| PASSWORD_ERROR)?
        .to_string();
    Ok(Arc::new(PasswordCheck {
        hash,
        rate: Mutex::new(RateState::default()),
    }))
}

struct PasswordCheck {
    hash: String,
    rate: Mutex<RateState>,
}

#[derive(Default)]
struct RateState {
    recent: HashMap<IpAddr, VecDeque<Instant>>,
    checking: usize,
}

struct PasswordAttempt {
    ip: IpAddr,
    peer: Arc<PasswordCheck>,
    finished: bool,
}

impl PasswordAttempt {
    fn finish(mut self, success: bool) {
        self.finished = true;
        let mut rate = self.peer.rate.lock();
        rate.checking = rate.checking.saturating_sub(1);
        if success {
            rate.recent.remove(&self.ip);
        }
    }
}

impl Drop for PasswordAttempt {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        let mut rate = self.peer.rate.lock();
        rate.checking = rate.checking.saturating_sub(1);
    }
}

impl PasswordCheck {
    fn begin(self: &Arc<Self>, ip: IpAddr) -> Result<PasswordAttempt, Option<u64>> {
        let now = Instant::now();
        let mut rate = self.rate.lock();
        rate.recent.retain(|_, attempts| {
            while attempts
                .front()
                .is_some_and(|at| now.duration_since(*at) >= ATTEMPT_WINDOW)
            {
                attempts.pop_front();
            }
            !attempts.is_empty()
        });
        if let Some(attempts) = rate.recent.get(&ip) {
            if attempts.len() >= MAX_ATTEMPTS {
                let retry = attempts
                    .front()
                    .map(|at| (ATTEMPT_WINDOW - now.duration_since(*at)).as_secs().max(1))
                    .unwrap_or(60);
                return Err(Some(retry));
            }
        }
        if rate.checking >= MAX_CHECKS || rate.recent.len() >= MAX_RATE_PEERS {
            return Err(None);
        }
        rate.checking += 1;
        rate.recent
            .entry(ip)
            .or_insert_with(VecDeque::new)
            .push_back(now);
        Ok(PasswordAttempt {
            ip,
            peer: self.clone(),
            finished: false,
        })
    }

    fn verify(&self, password: &str) -> bool {
        let Ok(parsed) = PasswordHash::new(&self.hash) else {
            return false;
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    }
}

fn verified_interface<'a>(
    address: &str,
    available: &'a [LanInterface],
) -> Result<&'a LanInterface, &'static str> {
    let ip = address
        .parse::<Ipv4Addr>()
        .map_err(|_| "Select a private local IPv4 interface")?;
    if !ip.is_private() {
        return Err("Select a private local IPv4 interface");
    }
    available
        .iter()
        .find(|i| i.address == address && (1..=32).contains(&i.prefix))
        .ok_or("The selected private LAN interface is not available")
}

async fn interfaces() -> Vec<LanInterface> {
    #[cfg(windows)]
    {
        // Fixed command, no user interpolation, no discovery traffic or external service.
        const SCRIPT: &str = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ConvertTo-Json -Compress -InputObject @(Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction Stop | Select-Object @{Name='address';Expression={$_.IPAddress}},@{Name='label';Expression={$_.InterfaceAlias}},@{Name='prefix';Expression={$_.PrefixLength}})";
        let mut command = tokio::process::Command::new("powershell.exe");
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            SCRIPT,
        ]);
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        command.kill_on_drop(true);
        if let Ok(Ok(output)) = tokio::time::timeout(Duration::from_secs(5), command.output()).await
        {
            if output.status.success() {
                if let Ok(mut values) = serde_json::from_slice::<Vec<LanInterface>>(&output.stdout)
                {
                    values.retain(|i| {
                        i.address.parse::<Ipv4Addr>().is_ok_and(|a| a.is_private())
                            && (1..=32).contains(&i.prefix)
                    });
                    values.sort_by(|a, b| a.address.cmp(&b.address));
                    values.dedup_by(|a, b| a.address == b.address);
                    return values;
                }
            }
        }
    }
    // Fail closed on unsupported platforms or enumeration failure.
    Vec::new()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileInfo {
    id: String,
    name: String,
    size: u64,
    media_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified: Option<u64>,
}

struct SharedFile {
    info: FileInfo,
    mime: &'static str,
    file: Mutex<File>,
}

enum ShareContent {
    Files(HashMap<String, Arc<SharedFile>>),
    Folder(Arc<FolderRoot>),
}

struct FolderRoot {
    root: PathBuf,
    name: String,
}

#[derive(Serialize)]
struct FolderEntry {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderListing {
    path: String,
    parent: Option<String>,
    root: String,
    folders: Vec<FolderEntry>,
    files: Vec<FileInfo>,
    truncated: bool,
}

impl FolderRoot {
    fn new(path: &FsPath) -> io::Result<Self> {
        if !path.is_dir() {
            std::fs::create_dir_all(path)?;
        }
        reject_links(path)?;
        let root = path.canonicalize()?;
        if !root.is_dir() || root.parent().is_none() {
            return Err(invalid_file());
        }
        let name = root
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.chars().filter(|c| !c.is_control()).take(80).collect())
            .filter(|name: &String| !name.is_empty())
            .unwrap_or_else(|| "Downloads".to_string());
        Ok(Self { root, name })
    }

    fn resolve(&self, relative: &str) -> io::Result<PathBuf> {
        if relative.len() > MAX_RELATIVE_PATH || relative.contains(['\0', '\\']) {
            return Err(invalid_file());
        }
        let mut target = self.root.clone();
        for component in FsPath::new(relative).components() {
            let Component::Normal(name) = component else {
                return Err(invalid_file());
            };
            let Some(text) = name.to_str() else {
                return Err(invalid_file());
            };
            if text.is_empty() || text.starts_with('.') {
                return Err(invalid_file());
            }
            target.push(name);
            let metadata = std::fs::symlink_metadata(&target)?;
            if metadata.file_type().is_symlink() || reparse(&metadata) || hidden(&metadata) {
                return Err(invalid_file());
            }
            if !metadata.is_dir() && !metadata.is_file() {
                return Err(invalid_file());
            }
        }
        if relative.is_empty() {
            return Ok(target);
        }
        let canonical = target.canonicalize()?;
        if !canonical.starts_with(&self.root) {
            return Err(invalid_file());
        }
        Ok(canonical)
    }

    fn list(&self, relative: &str) -> io::Result<FolderListing> {
        let target = self.resolve(relative)?;
        if !target.is_dir() {
            return Err(invalid_file());
        }
        let mut folders = Vec::new();
        let mut files = Vec::new();
        let mut truncated = false;
        for entry in std::fs::read_dir(&target)? {
            let Ok(entry) = entry else { continue };
            if folders.len() + files.len() >= MAX_LIST_ENTRIES {
                truncated = true;
                break;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if reparse(&metadata) || hidden(&metadata) {
                continue;
            }
            let Some(name) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if name.is_empty()
                || name.len() > 240
                || name.starts_with('.')
                || name.contains(['\0', '\\'])
                || name.chars().any(char::is_control)
            {
                continue;
            }
            let child = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            if metadata.is_dir() {
                folders.push(FolderEntry {
                    name,
                    path: child,
                });
            } else if metadata.is_file() {
                let (media_type, _) = media(&name);
                files.push(FileInfo {
                    id: encode_id(&child),
                    name,
                    size: metadata.len(),
                    media_type,
                    modified: modified(&metadata),
                });
            }
        }
        folders.sort_by(|a, b| {
            a.name
                .to_lowercase()
                .cmp(&b.name.to_lowercase())
                .then_with(|| a.name.cmp(&b.name))
        });
        files.sort_by(|a, b| {
            a.name
                .to_lowercase()
                .cmp(&b.name.to_lowercase())
                .then_with(|| a.name.cmp(&b.name))
        });
        let parent = if relative.is_empty() {
            None
        } else {
            Some(relative.rsplit_once('/').map_or("", |(parent, _)| parent).to_string())
        };
        Ok(FolderListing {
            path: relative.to_string(),
            parent,
            root: self.name.clone(),
            folders,
            files,
            truncated,
        })
    }

    fn open_file(self: &Arc<Self>, id: &str) -> io::Result<Arc<SharedFile>> {
        let relative = decode_id(id).ok_or_else(invalid_file)?;
        if relative.is_empty() || encode_id(&relative) != id {
            return Err(invalid_file());
        }
        let target = self.resolve(&relative)?;
        if !target.is_file() {
            return Err(invalid_file());
        }
        let file = pin_file(&target, &self.root)?;
        let metadata = file.metadata()?;
        let name = target
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(invalid_file)?
            .to_string();
        let (media_type, mime) = media(&name);
        Ok(Arc::new(SharedFile {
            info: FileInfo {
                id: id.to_string(),
                name,
                size: metadata.len(),
                media_type,
                modified: modified(&metadata),
            },
            mime,
            file: Mutex::new(file),
        }))
    }
}

fn encode_id(relative: &str) -> String {
    let mut encoded = String::with_capacity(relative.len() * 2);
    for byte in relative.as_bytes() {
        encoded.push_str(&format!("{byte:02x}"));
    }
    encoded
}

fn decode_id(id: &str) -> Option<String> {
    if id.is_empty()
        || id.len() > MAX_RELATIVE_PATH * 2
        || id.len() % 2 != 0
        || !id.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return None;
    }
    let bytes = (0..id.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&id[index..index + 2], 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    String::from_utf8(bytes).ok()
}

fn modified(metadata: &Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|age| age.as_millis() as u64)
}

#[cfg(windows)]
fn reparse(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(windows))]
fn reparse(_metadata: &Metadata) -> bool {
    false
}

#[cfg(windows)]
fn hidden(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & (0x2 | 0x4) != 0
}

#[cfg(not(windows))]
fn hidden(_metadata: &Metadata) -> bool {
    false
}

fn prepare_files(
    ids: &[String],
    downloads: &[Download],
) -> Result<HashMap<String, Arc<SharedFile>>, &'static str> {
    if ids.is_empty() || ids.len() > MAX_FILES {
        return Err("Select between 1 and 200 completed downloads");
    }
    let mut seen = HashSet::new();
    let mut files = HashMap::new();
    for id in ids {
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            || !seen.insert(id)
        {
            return Err("Selected download IDs must be unique opaque IDs");
        }
        let dl = downloads.iter().find(|d| &d.id == id).ok_or(FILE_ERROR)?;
        if dl.status != "completed" {
            return Err(FILE_ERROR);
        }
        let target = FsPath::new(dl.save_path.as_deref().ok_or(FILE_ERROR)?);
        let folder = FsPath::new(&dl.folder);
        let file = pin_file(target, folder).map_err(|_| FILE_ERROR)?;
        let size = file.metadata().map_err(|_| FILE_ERROR)?.len();
        let name = target
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or(FILE_ERROR)?;
        let name: String = name.chars().filter(|c| !c.is_control()).take(240).collect();
        let (media_type, mime) = media(&name);
        files.insert(
            id.clone(),
            Arc::new(SharedFile {
                info: FileInfo {
                    id: id.clone(),
                    name,
                    size,
                    media_type,
                    modified: None,
                },
                mime,
                file: Mutex::new(file),
            }),
        );
    }
    Ok(files)
}

fn invalid_file() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, FILE_ERROR)
}

fn reject_links(path: &FsPath) -> io::Result<()> {
    if !path.is_absolute() {
        return Err(invalid_file());
    }
    let mut partial = PathBuf::new();
    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::CurDir) {
            return Err(invalid_file());
        }
        partial.push(component.as_os_str());
        if matches!(component, Component::Prefix(_) | Component::RootDir) {
            continue;
        }
        let metadata = std::fs::symlink_metadata(&partial)?;
        if metadata.file_type().is_symlink() {
            return Err(invalid_file());
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            // Includes junctions and other reparse points, not just symbolic links.
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(invalid_file());
            }
        }
    }
    Ok(())
}

fn pin_file(target: &FsPath, folder: &FsPath) -> io::Result<File> {
    reject_links(folder)?;
    reject_links(target)?;
    let root = folder.canonicalize()?;
    let expected = target.canonicalize()?;
    if expected == root || !expected.starts_with(&root) || !root.is_dir() || !expected.is_file() {
        return Err(invalid_file());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Deny writes/deletes while sharing. Open the reparse point itself if raced.
        options.share_mode(1).custom_flags(0x00200000); // FILE_FLAG_OPEN_REPARSE_POINT
    }
    let file = options.open(&expected)?;
    if !file.metadata()?.is_file() {
        return Err(invalid_file());
    }
    // Verify the opened handle, not a second path-based open: catches ancestor-swap races.
    let actual = opened_path(&file)?;
    if actual != expected || !actual.starts_with(&root) {
        return Err(invalid_file());
    }
    reject_links(target)?;
    Ok(file)
}

#[cfg(windows)]
fn opened_path(file: &File) -> io::Result<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::GetFinalPathNameByHandleW;
    let mut buffer = vec![0u16; 32768];
    // SAFETY: file owns a live handle; the buffer is writable for its supplied length.
    let length = unsafe {
        GetFinalPathNameByHandleW(
            file.as_raw_handle(),
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            0,
        )
    };
    if length == 0 || length as usize >= buffer.len() {
        return Err(invalid_file());
    }
    Ok(PathBuf::from(std::ffi::OsString::from_wide(
        &buffer[..length as usize],
    )))
}

#[cfg(target_os = "linux")]
fn opened_path(file: &File) -> io::Result<PathBuf> {
    use std::os::fd::AsRawFd;
    std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

#[cfg(not(any(windows, target_os = "linux")))]
fn opened_path(_file: &File) -> io::Result<PathBuf> {
    Err(invalid_file())
}

fn media(name: &str) -> (&'static str, &'static str) {
    let extension = FsPath::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match extension.as_str() {
        "mp4" | "m4v" => ("video", "video/mp4"),
        "webm" => ("video", "video/webm"),
        "ogv" => ("video", "video/ogg"),
        "mp3" => ("audio", "audio/mpeg"),
        "m4a" => ("audio", "audio/mp4"),
        "ogg" | "oga" | "opus" => ("audio", "audio/ogg"),
        "wav" => ("audio", "audio/wav"),
        "flac" => ("audio", "audio/flac"),
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "png" => ("image", "image/png"),
        "webp" => ("image", "image/webp"),
        _ => ("file", "application/octet-stream"),
    }
}

struct Session {
    address: Ipv4Addr,
    prefix: u8,
    host: String,
    token_hash: [u8; 32],
    cookie: String,
    cookie_hash: [u8; 32],
    password: Option<Arc<PasswordCheck>>,
    content: ShareContent,
    expires_at: Option<u64>,
    deadline: Option<Instant>,
    lifetime: String,
    cancel: CancellationToken,
    streams: Arc<Semaphore>,
}

impl Session {
    fn new(
        address: Ipv4Addr,
        prefix: u8,
        port: u16,
        content: ShareContent,
        token: &str,
        password: Option<Arc<PasswordCheck>>,
    ) -> Self {
        let cookie = new_secret();
        Self {
            address,
            prefix,
            host: format!("{address}:{port}"),
            token_hash: hash(token),
            cookie_hash: hash(&cookie),
            cookie,
            password,
            content,
            expires_at: Some(now_ms() + LIFETIME.as_millis() as u64),
            deadline: Some(Instant::now() + LIFETIME),
            lifetime: "8h".into(),
            cancel: CancellationToken::new(),
            streams: Arc::new(Semaphore::new(8)),
        }
    }

    fn set_lifetime(&mut self, lifetime: Option<Duration>, label: &str) {
        self.lifetime = label.into();
        self.expires_at = lifetime.map(|lifetime| now_ms() + lifetime.as_millis() as u64);
        self.deadline = lifetime.map(|lifetime| Instant::now() + lifetime);
    }

    fn active(&self) -> bool {
        !self.cancel.is_cancelled() && self.deadline.map_or(true, |deadline| Instant::now() < deadline)
    }

    fn folder(&self) -> bool {
        matches!(self.content, ShareContent::Folder(_))
    }

    fn authenticated(&self, headers: &HeaderMap) -> bool {
        if !self.active() {
            return false;
        }
        let mut cookie = None;
        for value in headers.get_all(header::COOKIE) {
            let Ok(value) = value.to_str() else {
                return false;
            };
            for part in value.split(';') {
                if let Some(("arus_share", value)) = part.trim().split_once('=') {
                    if cookie.replace(value).is_some() {
                        return false;
                    }
                }
            }
        }
        cookie.is_some_and(|value| secret_matches(value, &self.cookie_hash))
    }

    fn peer_allowed(&self, peer: IpAddr) -> bool {
        let IpAddr::V4(peer) = peer else {
            return false;
        };
        if !peer.is_private() || !self.address.is_private() || !(1..=32).contains(&self.prefix) {
            return false;
        }
        let mask = u32::MAX << (32 - self.prefix);
        u32::from(peer) & mask == u32::from(self.address) & mask
    }
}

fn new_secret() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}
fn hash(value: &str) -> [u8; 32] {
    Sha256::digest(value.as_bytes()).into()
}
fn secret_matches(value: &str, expected: &[u8; 32]) -> bool {
    if value.len() != 64 {
        return false;
    }
    let actual = hash(value);
    // Fixed 32-byte comparison, with no data-dependent early exit.
    let mut difference = 0u8;
    for index in 0..32 {
        difference |= std::hint::black_box(actual[index] ^ expected[index]);
    }
    std::hint::black_box(difference) == 0
}

/// Used by the loopback share controls as well as the isolated receiver.
/// Requests without browser headers remain available to local CLI clients.
pub(crate) fn same_origin(headers: &HeaderMap, host: &str) -> bool {
    let origins = headers.get_all(header::ORIGIN);
    if origins.iter().count() > 1 {
        return false;
    }
    if let Some(origin) = origins.iter().next() {
        if origin.to_str().ok() != Some(format!("http://{host}").as_str()) {
            return false;
        }
    }
    let sites = headers.get_all("sec-fetch-site");
    if sites.iter().count() > 1 {
        return false;
    }
    sites
        .iter()
        .all(|value| matches!(value.to_str(), Ok("same-origin" | "none")))
}

fn lan_router(session: Arc<Session>) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/share.js", get(script))
        .route("/share.css", get(styles))
        .route("/api/session", post(exchange))
        .route("/api/files", get(list_files))
        .route("/files/{id}", get(serve_file))
        .fallback(|| async { failure(StatusCode::NOT_FOUND, "Not found") })
        .layer(DefaultBodyLimit::max(1024))
        .layer(middleware::from_fn_with_state(session.clone(), lan_guard))
        .with_state(session)
}

async fn lan_guard(State(session): State<Arc<Session>>, req: Request, next: Next) -> Response {
    let hosts = req.headers().get_all(header::HOST);
    let host_ok = hosts.iter().count() == 1
        && hosts.iter().next().and_then(|v| v.to_str().ok()) == Some(&session.host);
    let peer_ok = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .is_some_and(|peer| session.peer_allowed(peer.0.ip()));
    let response = if !session.active() {
        failure(StatusCode::GONE, "Share is no longer available")
    } else if !host_ok || !peer_ok || !same_origin(req.headers(), &session.host) {
        failure(StatusCode::FORBIDDEN, "Request is not allowed")
    } else {
        next.run(req).await
    };
    secure_headers(response)
}

pub(crate) fn secure_headers(mut response: Response) -> Response {
    for (name, value) in [
        ("cache-control", "no-store"),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("cross-origin-resource-policy", "same-origin"),
        ("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"),
        ("permissions-policy", "camera=(), microphone=(), geolocation=()"),
    ] { response.headers_mut().insert(name, HeaderValue::from_static(value)); }
    response
}

fn failure(status: StatusCode, message: &'static str) -> Response {
    (status, Json(json!({"error": message}))).into_response()
}

fn failure_password(status: StatusCode, message: &'static str) -> Response {
    (
        status,
        Json(json!({"error": message, "passwordRequired": true})),
    )
        .into_response()
}

async fn index() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        include_str!("../../public/share.html"),
    )
}
async fn script() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        include_str!("../../public/share.js"),
    )
}
async fn styles() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../../public/share.css"),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TokenInput {
    token: String,
    #[serde(default)]
    password: String,
}

async fn exchange(
    State(session): State<Arc<Session>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(input): Json<TokenInput>,
) -> Response {
    if !session.active() || !secret_matches(&input.token, &session.token_hash) {
        return failure(StatusCode::UNAUTHORIZED, "Invalid or expired share token");
    }
    if let Some(check) = &session.password {
        if input.password.is_empty() {
            return failure_password(StatusCode::UNAUTHORIZED, "Password required");
        }
        let attempt = match check.begin(peer.ip()) {
            Ok(attempt) => attempt,
            Err(retry) => {
                let mut response =
                    failure_password(StatusCode::TOO_MANY_REQUESTS, "Too many attempts");
                response.headers_mut().insert(
                    header::RETRY_AFTER,
                    HeaderValue::from_str(&retry.unwrap_or(5).to_string())
                        .unwrap_or(HeaderValue::from_static("5")),
                );
                return response;
            }
        };
        let check = check.clone();
        let password = input.password;
        // The permit is released by the blocking task itself so an aborted
        // request cannot leak a slot and lock out every other peer.
        let valid = tokio::task::spawn_blocking(move || {
            let valid = check.verify(&password);
            attempt.finish(valid);
            valid
        })
        .await
        .unwrap_or(false);
        if !valid || !session.active() {
            return failure_password(StatusCode::UNAUTHORIZED, "Password required");
        }
    }
    let remaining = session
        .deadline
        .map_or(PERSISTENT_COOKIE, |deadline| {
            deadline
                .saturating_duration_since(Instant::now())
                .as_secs()
                .max(1)
        });
    let cookie = format!(
        "arus_share={}; HttpOnly; SameSite=Strict; Path=/; Max-Age={remaining}",
        session.cookie
    );
    let mut response = Json(json!({"ok": true, "expiresAt": session.expires_at})).into_response();
    if let Ok(cookie) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, cookie);
    }
    response
}

async fn list_files(
    State(session): State<Arc<Session>>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    if !session.authenticated(&headers) {
        return failure(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match &session.content {
        ShareContent::Files(files) => {
            let mut files: Vec<_> = files.values().map(|file| &file.info).collect();
            files.sort_by(|a, b| {
                a.name
                    .to_lowercase()
                    .cmp(&b.name.to_lowercase())
                    .then_with(|| a.name.cmp(&b.name))
            });
            Json(json!({"mode": "files", "files": files, "expiresAt": session.expires_at}))
                .into_response()
        }
        ShareContent::Folder(root) => {
            let relative = query.get("path").cloned().unwrap_or_default();
            let root = root.clone();
            let listing = tokio::task::spawn_blocking(move || root.list(&relative)).await;
            match listing {
                Ok(Ok(listing)) => Json(json!({
                    "mode": "folder",
                    "root": listing.root,
                    "path": listing.path,
                    "parent": listing.parent,
                    "folders": listing.folders,
                    "files": listing.files,
                    "truncated": listing.truncated,
                    "expiresAt": session.expires_at
                }))
                .into_response(),
                _ => failure(StatusCode::NOT_FOUND, "Folder is not available"),
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct FileRange {
    start: u64,
    length: u64,
    partial: bool,
}

fn parse_range(value: Option<&str>, size: u64) -> Result<FileRange, ()> {
    let Some(value) = value else {
        return Ok(FileRange {
            start: 0,
            length: size,
            partial: false,
        });
    };
    let value = value.strip_prefix("bytes=").ok_or(())?;
    let (start, end) = value.split_once('-').ok_or(())?;
    fn number(value: &str) -> Result<u64, ()> {
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
            return Err(());
        }
        value.parse().map_err(|_| ())
    }
    if size == 0 {
        return Err(());
    }
    let (start, end) = if start.is_empty() {
        let suffix = number(end)?;
        if suffix == 0 {
            return Err(());
        }
        (size.saturating_sub(suffix), size - 1)
    } else {
        let start = number(start)?;
        let end = if end.is_empty() {
            size - 1
        } else {
            number(end)?.min(size - 1)
        };
        if start >= size || start > end {
            return Err(());
        }
        (start, end)
    };
    Ok(FileRange {
        start,
        length: end - start + 1,
        partial: true,
    })
}

fn disposition(name: &str, attachment: bool) -> String {
    let encoded: String =
        percent_encoding::utf8_percent_encode(name, percent_encoding::NON_ALPHANUMERIC).to_string();
    format!(
        "{}; filename=\"download\"; filename*=UTF-8''{encoded}",
        if attachment { "attachment" } else { "inline" }
    )
}

async fn serve_file(
    State(session): State<Arc<Session>>,
    Path(id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    if !session.authenticated(&headers) {
        return failure(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    let file = match &session.content {
        ShareContent::Files(files) => files.get(&id).cloned(),
        ShareContent::Folder(root) => {
            let root = root.clone();
            tokio::task::spawn_blocking(move || root.open_file(&id))
                .await
                .ok()
                .and_then(Result::ok)
        }
    };
    let Some(file) = file else {
        return failure(StatusCode::NOT_FOUND, "File not found");
    };
    let range_headers = headers.get_all(header::RANGE);
    // HEAD ignores Range. With no validator on offer, If-Range cannot be proven
    // equal, so the complete representation is returned instead.
    let range = if method == Method::HEAD || headers.contains_key(header::IF_RANGE) {
        parse_range(None, file.info.size)
    } else if range_headers.iter().count() > 1 {
        Err(())
    } else {
        match range_headers.iter().next() {
            Some(value) => value
                .to_str()
                .map_err(|_| ())
                .and_then(|value| parse_range(Some(value), file.info.size)),
            None => parse_range(None, file.info.size),
        }
    };
    let range = match range {
        Ok(range) => range,
        Err(()) => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{}", file.info.size))
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, "0")
                .body(Body::empty())
                .unwrap();
        }
    };
    let mut response = Response::builder()
        .status(if range.partial {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_TYPE, file.mime)
        .header(header::CONTENT_LENGTH, range.length)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(
            header::CONTENT_DISPOSITION,
            disposition(
                &file.info.name,
                file.info.media_type == "file" || query.get("download").is_some_and(|v| v == "1"),
            ),
        );
    if range.partial {
        response = response.header(
            header::CONTENT_RANGE,
            format!(
                "bytes {}-{}/{}",
                range.start,
                range.start + range.length - 1,
                file.info.size
            ),
        );
    }
    if method == Method::HEAD || range.length == 0 {
        return response.body(Body::empty()).unwrap();
    }
    let Ok(permit) = session.streams.clone().try_acquire_owned() else {
        return failure(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many simultaneous file streams",
        );
    };
    response
        .body(stream_file(session, file, range, permit))
        .unwrap()
}

fn stream_file(
    session: Arc<Session>,
    file: Arc<SharedFile>,
    range: FileRange,
    permit: OwnedSemaphorePermit,
) -> Body {
    let (tx, rx) = mpsc::channel::<io::Result<Bytes>>(1);
    let body_session = session.clone();
    tokio::spawn(async move {
        let _permit = permit;
        let mut offset = range.start;
        let mut remaining = range.length;
        while remaining > 0 && session.active() && !tx.is_closed() {
            let count = remaining.min(CHUNK_SIZE as u64) as usize;
            let chunk_file = file.clone();
            let chunk_session = session.clone();
            let mut read = tokio::task::spawn_blocking(move || {
                if !chunk_session.active() {
                    return Err(io::Error::from(io::ErrorKind::Interrupted));
                }
                // Seek and read are one critical section; cloned handles would share an offset.
                let mut file = chunk_file.file.lock();
                if !chunk_session.active() {
                    return Err(io::Error::from(io::ErrorKind::Interrupted));
                }
                file.seek(SeekFrom::Start(offset))?;
                let mut bytes = vec![0; count];
                file.read_exact(&mut bytes)?;
                Ok(Bytes::from(bytes))
            });
            let chunk = tokio::select! {
                biased;
                _ = session.cancel.cancelled() => {
                    read.abort();
                    let _ = read.await;
                    break;
                },
                _ = tx.closed() => {
                    read.abort();
                    let _ = read.await;
                    break;
                },
                result = &mut read => result.unwrap_or_else(|_| Err(io::Error::other("File read failed"))),
            };
            let failed = chunk.is_err();
            tokio::select! {
                biased;
                _ = session.cancel.cancelled() => break,
                result = tx.send(chunk) => if result.is_err() { break; },
            }
            if failed {
                break;
            }
            offset += count as u64;
            remaining -= count as u64;
        }
    });
    // A queued chunk must not be delivered after revocation.
    Body::from_stream(ReceiverStream::new(rx).map(move |chunk| {
        if body_session.active() {
            chunk
        } else {
            Err(io::Error::from(io::ErrorKind::Interrupted))
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Extension;

    struct Fixture {
        root: PathBuf,
        downloads: Vec<Download>,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("arus-share-test-{}", Uuid::new_v4()));
            let folder = root.join("downloads");
            std::fs::create_dir_all(&folder).unwrap();
            let mut downloads = Vec::new();
            for (id, name, data) in [
                ("video", "clip.mp4", b"0123456789".to_vec()),
                ("empty", "empty.bin", vec![]),
                ("html", "unsafe.html", b"<script>alert(1)</script>".to_vec()),
                (
                    "large",
                    "large.bin",
                    (0..CHUNK_SIZE * 8).map(|i| (i % 251) as u8).collect(),
                ),
            ] {
                let path = folder.join(name);
                std::fs::write(&path, data).unwrap();
                downloads.push(Download {
                    id: id.into(),
                    status: "completed".into(),
                    folder: folder.to_string_lossy().into(),
                    save_path: Some(path.to_string_lossy().into()),
                    filename: Some(name.into()),
                    ..Download::default()
                });
            }
            Self { root, downloads }
        }
        fn files(&self) -> HashMap<String, Arc<SharedFile>> {
            prepare_files(
                &self
                    .downloads
                    .iter()
                    .map(|d| d.id.clone())
                    .collect::<Vec<_>>(),
                &self.downloads,
            )
            .unwrap()
        }
        fn session(&self) -> Arc<Session> {
            Arc::new(Session::new(
                Ipv4Addr::new(192, 168, 42, 1),
                24,
                9876,
                ShareContent::Files(self.files()),
                &"a".repeat(64),
                None,
            ))
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    struct TestServer {
        base: String,
        session: Arc<Session>,
        task: JoinHandle<()>,
        client: reqwest::Client,
    }
    impl TestServer {
        async fn new(session: Arc<Session>) -> Self {
            Self::with_peer(session, SocketAddr::from(([192, 168, 42, 2], 34567))).await
        }

        async fn with_peer(session: Arc<Session>, peer: SocketAddr) -> Self {
            // Only loopback sockets in tests; inject the peer metadata production obtains from TCP.
            let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
                .await
                .unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let app = lan_router(session.clone()).layer(Extension(ConnectInfo(peer)));
            let cancel = session.cancel.clone();
            let task = tokio::spawn(async move {
                axum::serve(listener, app)
                    .with_graceful_shutdown(cancel.cancelled_owned())
                    .await
                    .unwrap();
            });
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap();
            Self {
                base,
                session,
                task,
                client,
            }
        }
        fn request(&self, method: Method, path: &str, auth: bool) -> reqwest::RequestBuilder {
            let mut request = self
                .client
                .request(method, format!("{}{path}", self.base))
                .header(header::HOST, &self.session.host);
            if auth {
                request = request.header(
                    header::COOKIE,
                    format!("arus_share={}", self.session.cookie),
                );
            }
            request
        }
        async fn stop(self) {
            self.session.cancel.cancel();
            drop(self.client);
            tokio::time::timeout(Duration::from_secs(2), self.task)
                .await
                .unwrap()
                .unwrap();
        }
    }

    #[test]
    fn ranges_cover_empty_suffix_open_invalid_multiple_and_overflow() {
        assert_eq!(
            parse_range(None, 0),
            Ok(FileRange {
                start: 0,
                length: 0,
                partial: false
            })
        );
        assert_eq!(
            parse_range(None, 10),
            Ok(FileRange {
                start: 0,
                length: 10,
                partial: false
            })
        );
        for (input, start, length) in [
            ("bytes=0-0", 0, 1),
            ("bytes=2-5", 2, 4),
            ("bytes=8-", 8, 2),
            ("bytes=-3", 7, 3),
            ("bytes=-20", 0, 10),
            ("bytes=2-999", 2, 8),
        ] {
            assert_eq!(
                parse_range(Some(input), 10),
                Ok(FileRange {
                    start,
                    length,
                    partial: true
                })
            );
        }
        for input in [
            "",
            "items=0-1",
            "bytes=",
            "bytes=-",
            "bytes=-0",
            "bytes=10-",
            "bytes=6-5",
            "bytes=0-1,3-4",
            "bytes=1--2",
            "bytes=+1-2",
            "bytes=1- 2",
            "bytes=18446744073709551616-",
            "bytes=-18446744073709551616",
        ] {
            assert!(parse_range(Some(input), 10).is_err(), "{input}");
        }
        assert!(parse_range(Some("bytes=0-"), 0).is_err());
        assert_eq!(
            parse_range(Some("bytes=0-18446744073709551615"), u64::MAX)
                .unwrap()
                .length,
            u64::MAX
        );
    }

    #[test]
    fn selection_paths_and_nonregular_files_fail_closed() {
        let fixture = Fixture::new();
        let video = &fixture.downloads[0];
        assert!(prepare_files(&[], &fixture.downloads).is_err());
        assert!(prepare_files(&vec!["video".into(); 201], &fixture.downloads).is_err());
        for ids in [
            vec!["missing".into()],
            vec!["video".into(), "video".into()],
            vec!["../video".into()],
        ] {
            assert!(prepare_files(&ids, &fixture.downloads).is_err());
        }
        let mut dl = video.clone();
        dl.status = "downloading".into();
        assert!(prepare_files(&[dl.id.clone()], &[dl.clone()]).is_err());
        dl.status = "completed".into();
        dl.save_path = Some(dl.folder.clone());
        assert!(prepare_files(&[dl.id.clone()], &[dl.clone()]).is_err());
        let outside = fixture.root.join("outside.bin");
        std::fs::write(&outside, b"private").unwrap();
        dl.save_path = Some(outside.to_string_lossy().into());
        assert!(prepare_files(&[dl.id.clone()], &[dl.clone()]).is_err());
        dl.save_path = Some(
            FsPath::new(&dl.folder)
                .join("../outside.bin")
                .to_string_lossy()
                .into(),
        );
        assert!(prepare_files(&[dl.id.clone()], &[dl.clone()]).is_err());
        dl.save_path = Some(
            FsPath::new(&dl.folder)
                .join("missing.bin")
                .to_string_lossy()
                .into(),
        );
        assert!(prepare_files(&[dl.id.clone()], &[dl]).is_err());
        assert!(pin_file(FsPath::new("relative.bin"), FsPath::new(&video.folder)).is_err());
        for name in [
            "attack.html",
            "attack.svg",
            "attack.js",
            "file.pdf",
            "file.exe",
        ] {
            assert_eq!(media(name), ("file", "application/octet-stream"));
            assert!(disposition(name, true).starts_with("attachment;"));
        }
        let header = disposition("a\"\r\n;é.mp4", false);
        assert!(!header.contains(['\r', '\n']));
        assert!(header.contains("filename*=UTF-8''a%22%0D%0A%3B%C3%A9%2Emp4"));
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_and_path_replacement_cannot_change_pinned_file() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let dl = &fixture.downloads[0];
        let path = FsPath::new(dl.save_path.as_ref().unwrap());
        let folder = FsPath::new(&dl.folder);
        let link = folder.join("link.mp4");
        symlink(path, &link).unwrap();
        assert!(pin_file(&link, folder).is_err());
        let mut pinned = pin_file(path, folder).unwrap();
        std::fs::rename(path, folder.join("original.mp4")).unwrap();
        std::fs::write(path, b"replacement").unwrap();
        let mut text = String::new();
        pinned.read_to_string(&mut text).unwrap();
        assert_eq!(text, "0123456789");
    }

    #[cfg(windows)]
    #[test]
    fn junctions_rejected_and_open_handle_denies_replacement() {
        let fixture = Fixture::new();
        let dl = &fixture.downloads[0];
        let path = FsPath::new(dl.save_path.as_ref().unwrap());
        let folder = FsPath::new(&dl.folder);
        let pinned = pin_file(path, folder).unwrap();
        assert!(std::fs::remove_file(path).is_err());
        assert!(std::fs::write(path, b"replacement").is_err());
        drop(pinned);
        // Junctions need no developer mode or administrator privilege.
        let junction = fixture.root.join("junction");
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&junction)
            .arg(folder)
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(pin_file(&junction.join("clip.mp4"), &junction).is_err());
        assert!(pin_file(&junction.join("clip.mp4"), folder).is_err());
        std::fs::remove_dir(&junction).unwrap();
    }

    #[test]
    fn exact_origins_and_private_subnet_required() {
        let host = "127.0.0.1:4477";
        let mut headers = HeaderMap::new();
        assert!(same_origin(&headers, host));
        for origin in [
            "http://127.0.0.1:4478",
            "http://localhost:4477",
            "https://127.0.0.1:4477",
            "chrome-extension://example",
            "moz-extension://example",
            "null",
            "http://evil.test",
        ] {
            headers.insert(header::ORIGIN, HeaderValue::from_str(origin).unwrap());
            assert!(!same_origin(&headers, host), "{origin}");
        }
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("http://127.0.0.1:4477"),
        );
        assert!(same_origin(&headers, host));
        for site in ["cross-site", "same-site"] {
            headers.insert("sec-fetch-site", HeaderValue::from_static(site));
            assert!(!same_origin(&headers, host));
        }
        headers.remove("sec-fetch-site");
        headers.append(
            header::ORIGIN,
            HeaderValue::from_static("http://127.0.0.1:4477"),
        );
        assert!(!same_origin(&headers, host));
        let session = Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(HashMap::new()),
            &new_secret(),
            None,
        );
        assert!(session.peer_allowed("192.168.42.200".parse().unwrap()));
        for ip in [
            "192.168.43.1",
            "10.0.0.1",
            "8.8.8.8",
            "127.0.0.1",
            "::1",
            "::ffff:192.168.42.2",
        ] {
            assert!(!session.peer_allowed(ip.parse().unwrap()), "{ip}");
        }
        let available = vec![LanInterface {
            address: "192.168.42.1".into(),
            label: "test".into(),
            prefix: 24,
        }];
        assert!(verified_interface("192.168.42.1", &available).is_ok());
        for ip in ["127.0.0.1", "0.0.0.0", "8.8.8.8", "192.168.42.2", "::1"] {
            assert!(verified_interface(ip, &available).is_err());
        }
        let status = serde_json::to_value(status_of(None, vec![])).unwrap();
        assert_eq!(
            status,
            json!({"enabled":false,"url":null,"fileIds":[],"folder":false,"interfaces":[],"expiresAt":null,"passwordProtected":false,"lifetime":""})
        );
    }

    #[tokio::test]
    async fn http_auth_origin_host_unselected_and_safe_metadata() {
        let fixture = Fixture::new();
        let server = TestServer::new(fixture.session()).await;
        for path in ["/api/files", "/files/video"] {
            assert_eq!(
                server
                    .request(Method::GET, path, false)
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
        }
        let invalid = server
            .request(Method::POST, "/api/session", false)
            .json(&json!({"token":"b".repeat(64)}))
            .send()
            .await
            .unwrap();
        assert_eq!(invalid.status(), StatusCode::UNAUTHORIZED);
        assert!(!invalid.headers().contains_key(header::SET_COOKIE));
        let valid = server
            .request(Method::POST, "/api/session", false)
            .header(header::ORIGIN, format!("http://{}", server.session.host))
            .json(&json!({"token":"a".repeat(64)}))
            .send()
            .await
            .unwrap();
        assert_eq!(valid.status(), StatusCode::OK);
        let cookie = valid.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(cookie.contains("HttpOnly; SameSite=Strict; Path=/; Max-Age="));
        let cookie_pair = cookie.split(';').next().unwrap();
        let listing = server
            .request(Method::GET, "/api/files", false)
            .header(header::COOKIE, cookie_pair)
            .send()
            .await
            .unwrap();
        assert_eq!(listing.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(listing.headers()["referrer-policy"], "no-referrer");
        assert!(!listing
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
        let listing: serde_json::Value = listing.json().await.unwrap();
        assert_eq!(listing["files"].as_array().unwrap().len(), 4);
        for file in listing["files"].as_array().unwrap() {
            assert_eq!(file.as_object().unwrap().len(), 4);
            assert!(file.get("savePath").is_none() && file.get("url").is_none());
        }
        for path in [
            "/files/not-selected",
            "/api/state",
            "/api/downloads",
            "/api/share",
        ] {
            assert_eq!(
                server
                    .request(Method::GET, path, true)
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::NOT_FOUND
            );
        }
        for origin in [
            "http://evil.test",
            "http://192.168.42.1:9877",
            "chrome-extension://extension",
        ] {
            let response = server
                .request(Method::POST, "/api/session", false)
                .header(header::ORIGIN, origin)
                .json(&json!({"token":"a".repeat(64)}))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }
        for host in [
            "evil.test:9876",
            "192.168.42.1",
            "192.168.42.1:9877",
            "127.0.0.1:9876",
        ] {
            assert_eq!(
                server
                    .request(Method::GET, "/api/files", true)
                    .header(header::HOST, host)
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );
        }
        assert_eq!(
            server
                .request(Method::GET, "/api/files", true)
                .header("sec-fetch-site", "cross-site")
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            server
                .request(Method::POST, "/api/session", false)
                .json(&json!({"token":"a".repeat(2048)}))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        server.stop().await;
    }

    #[tokio::test]
    async fn http_ranges_head_attachment_and_stream_limit() {
        let fixture = Fixture::new();
        let server = TestServer::new(fixture.session()).await;
        for (range, expected, content_range) in [
            ("bytes=2-5", "2345", "bytes 2-5/10"),
            ("bytes=8-", "89", "bytes 8-9/10"),
            ("bytes=-3", "789", "bytes 7-9/10"),
        ] {
            let response = server
                .request(Method::GET, "/files/video", true)
                .header(header::RANGE, range)
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
            assert_eq!(response.headers()[header::CONTENT_RANGE], content_range);
            assert_eq!(response.headers()[header::ACCEPT_RANGES], "bytes");
            assert_eq!(response.text().await.unwrap(), expected);
        }
        for range in ["bytes=20-", "bytes=0-1,4-5", "bytes=18446744073709551616-"] {
            let response = server
                .request(Method::GET, "/files/video", true)
                .header(header::RANGE, range)
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
            assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes */10");
        }
        let head = server
            .request(Method::HEAD, "/files/video", true)
            .header(header::RANGE, "bytes=2-5")
            .send()
            .await
            .unwrap();
        assert_eq!(head.status(), StatusCode::OK);
        assert_eq!(head.headers()[header::CONTENT_LENGTH], "10");
        assert_eq!(head.headers()[header::CONTENT_TYPE], "video/mp4");
        assert!(head.bytes().await.unwrap().is_empty());
        let head = server
            .request(Method::HEAD, "/files/video", true)
            .header(header::RANGE, "bytes=20-")
            .send()
            .await
            .unwrap();
        assert_eq!(head.status(), StatusCode::OK);
        assert_eq!(head.headers()[header::CONTENT_LENGTH], "10");
        let if_range = server
            .request(Method::GET, "/files/video", true)
            .header(header::RANGE, "bytes=2-5")
            .header(header::IF_RANGE, "\"no-validator\"")
            .send()
            .await
            .unwrap();
        assert_eq!(if_range.status(), StatusCode::OK);
        assert_eq!(if_range.headers()[header::CONTENT_LENGTH], "10");
        assert_eq!(if_range.text().await.unwrap(), "0123456789");
        let head = server
            .request(Method::HEAD, "/files/video", true)
            .send()
            .await
            .unwrap();
        assert_eq!(head.status(), StatusCode::OK);
        assert_eq!(head.headers()[header::CONTENT_LENGTH], "10");
        assert!(head.bytes().await.unwrap().is_empty());
        let empty = server
            .request(Method::GET, "/files/empty", true)
            .send()
            .await
            .unwrap();
        assert_eq!(empty.status(), StatusCode::OK);
        assert!(empty.bytes().await.unwrap().is_empty());
        assert_eq!(
            server
                .request(Method::HEAD, "/files/empty", true)
                .header(header::RANGE, "bytes=-1")
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        for path in ["/files/html", "/files/video?download=1"] {
            let response = server
                .request(Method::GET, path, true)
                .send()
                .await
                .unwrap();
            assert!(response.headers()[header::CONTENT_DISPOSITION]
                .to_str()
                .unwrap()
                .starts_with("attachment;"));
            if path.ends_with("html") {
                assert_eq!(
                    response.headers()[header::CONTENT_TYPE],
                    "application/octet-stream"
                );
            }
        }
        let permits = server
            .session
            .streams
            .clone()
            .acquire_many_owned(8)
            .await
            .unwrap();
        assert_eq!(
            server
                .request(Method::GET, "/files/video", true)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(
            server
                .request(Method::HEAD, "/files/video", true)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        drop(permits);
        server.stop().await;
    }

    #[tokio::test]
    async fn http_rejects_nonlocal_peers_and_old_credentials() {
        let fixture = Fixture::new();
        for address in [[127, 0, 0, 1], [192, 168, 43, 2], [8, 8, 8, 8]] {
            let server =
                TestServer::with_peer(fixture.session(), SocketAddr::from((address, 1234))).await;
            assert_eq!(
                server
                    .request(Method::GET, "/api/files", true)
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );
            server.stop().await;
        }
        let old_token = new_secret();
        let token = new_secret();
        assert_ne!(old_token, token);
        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|b| b.is_ascii_hexdigit()));
        let old = Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(HashMap::new()),
            &old_token,
            None,
        );
        let replacement = Arc::new(Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(fixture.files()),
            &token,
            None,
        ));
        let server = TestServer::new(replacement).await;
        assert_eq!(
            server
                .request(Method::POST, "/api/session", false)
                .json(&json!({"token":old_token}))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            server
                .request(Method::GET, "/api/files", false)
                .header(header::COOKIE, format!("arus_share={}", old.cookie))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            server
                .request(Method::GET, "/api/files", true)
                .header(
                    header::COOKIE,
                    format!(
                        "arus_share={}; arus_share={}",
                        server.session.cookie, server.session.cookie
                    )
                )
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        let response = server
            .request(Method::GET, "/files/video", true)
            .header(header::RANGE, "bytes=0-1")
            .header(header::RANGE, "bytes=3-4")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        server.stop().await;
    }

    #[tokio::test]
    async fn expiry_and_stop_clear_manager_and_close_listener() {
        let fixture = Fixture::new();
        let manager = ShareManager::default();
        assert!(manager.running.lock().await.is_none());
        let mut session = Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(fixture.files()),
            &new_secret(),
            None,
        );
        session.deadline = Some(Instant::now());
        let session = Arc::new(session);
        let server = TestServer::new(session.clone()).await;
        let base = server.base.clone();
        *manager.running.lock().await = Some(Running {
            session: session.clone(),
            url: format!("{base}/#test"),
            file_ids: vec!["video".into()],
            server: server.task,
        });
        tokio::time::timeout(Duration::from_secs(2), manager.expire(session.clone()))
            .await
            .unwrap()
            .unwrap();
        assert!(session.cancel.is_cancelled());
        assert!(manager.running.lock().await.is_none());
        assert!(server.client.get(&base).send().await.is_err());
        let session = fixture.session();
        let server = TestServer::new(session.clone()).await;
        let base = server.base.clone();
        *manager.running.lock().await = Some(Running {
            session: session.clone(),
            url: format!("{base}/#test"),
            file_ids: vec!["video".into()],
            server: server.task,
        });
        let stopped = manager.stop().await;
        assert!(!stopped.enabled && stopped.url.is_none() && stopped.file_ids.is_empty());
        assert!(session.cancel.is_cancelled());
        assert!(manager.running.lock().await.is_none());
        assert!(server.client.get(&base).send().await.is_err());
    }

    #[tokio::test]
    async fn concurrent_offsets_cancellation_disconnect_and_expiration() {
        let fixture = Fixture::new();
        let session = fixture.session();
        let ShareContent::Files(files) = &session.content else {
            unreachable!()
        };
        let file = files["large"].clone();
        let body = |start, length| {
            stream_file(
                session.clone(),
                file.clone(),
                FileRange {
                    start,
                    length,
                    partial: false,
                },
                session.streams.clone().try_acquire_owned().unwrap(),
            )
        };
        let (left, right) = tokio::join!(
            axum::body::to_bytes(body(0, CHUNK_SIZE as u64 * 3), CHUNK_SIZE * 3),
            axum::body::to_bytes(body(123, CHUNK_SIZE as u64 * 2), CHUNK_SIZE * 2),
        );
        assert_eq!(
            left.unwrap().as_ref(),
            (0..CHUNK_SIZE * 3)
                .map(|i| (i % 251) as u8)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            right.unwrap().as_ref(),
            (123..123 + CHUNK_SIZE * 2)
                .map(|i| (i % 251) as u8)
                .collect::<Vec<_>>()
        );
        let disconnected = body(0, file.info.size);
        drop(disconnected);
        // Acquiring all permits waits for the disconnected producer to release its permit.
        let permits = tokio::time::timeout(
            Duration::from_secs(2),
            session.streams.clone().acquire_many_owned(8),
        )
        .await
        .unwrap()
        .unwrap();
        drop(permits);
        let mut cancelled = body(0, file.info.size).into_data_stream();
        let first = cancelled.next().await.unwrap().unwrap();
        assert!(first.len() <= CHUNK_SIZE);
        session.cancel.cancel();
        if let Some(next) = tokio::time::timeout(Duration::from_secs(2), cancelled.next())
            .await
            .unwrap()
        {
            assert!(next.is_err());
        }
        let permits = tokio::time::timeout(
            Duration::from_secs(2),
            session.streams.clone().acquire_many_owned(8),
        )
        .await
        .unwrap()
        .unwrap();
        drop(permits);
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_str(&format!("arus_share={}", session.cookie)).unwrap(),
        );
        assert!(!session.authenticated(&headers));
        let replacement = fixture.session();
        assert!(!replacement.authenticated(&headers));
        let mut expired = Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(HashMap::new()),
            &new_secret(),
            None,
        );
        expired.deadline = Some(Instant::now());
        assert!(!expired.active());
        assert!(!expired.authenticated(&headers));
        let server = TestServer::new(Arc::new(expired)).await;
        assert_eq!(
            server
                .request(Method::GET, "/", false)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::GONE
        );
        server.stop().await;
    }

    #[test]
    fn password_policy_and_attempt_limit_are_bounded() {
        assert!(validated_password(String::new()).unwrap().is_none());
        for bad in ["short".to_string(), "a".repeat(129)] {
            assert!(validated_password(bad).is_err());
        }
        assert_eq!(
            validated_password("  eight  ".into()).unwrap().as_deref(),
            Some("  eight  ")
        );
        assert!(validated_password("é".repeat(128)).is_ok());
        assert!(validated_password("é".repeat(257)).is_err());

        let check = hash_password("limiter-test").unwrap();
        let ip: IpAddr = "192.168.42.9".parse().unwrap();
        let held = [check.begin(ip).unwrap(), check.begin(ip).unwrap()];
        assert!(matches!(check.begin(ip), Err(None)));
        for attempt in held {
            attempt.finish(true);
        }
        let rate_ip: IpAddr = "192.168.42.11".parse().unwrap();
        for _ in 0..MAX_ATTEMPTS {
            check.begin(rate_ip).unwrap().finish(false);
        }
        assert!(matches!(check.begin(rate_ip), Err(Some(1..=60))));
        assert!(check.begin("192.168.42.10".parse().unwrap()).is_ok());

        let drop_check = hash_password("limiter-drop").unwrap();
        let drop_ip: IpAddr = "192.168.42.12".parse().unwrap();
        let held = [
            drop_check.begin(drop_ip).unwrap(),
            drop_check.begin(drop_ip).unwrap(),
        ];
        assert!(matches!(drop_check.begin(drop_ip), Err(None)));
        drop(held);
        assert!(drop_check.begin(drop_ip).is_ok());
    }

    #[tokio::test]
    async fn password_gate_issues_only_a_post_auth_cookie() {
        let fixture = Fixture::new();
        let password = "correct horse battery";
        let token = "c".repeat(64);
        let session = Arc::new(Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(fixture.files()),
            &token,
            Some(hash_password(password).unwrap()),
        ));
        let origin = format!("http://{}", session.host);
        let server = TestServer::new(session.clone()).await;

        let missing = server
            .request(Method::POST, "/api/session", false)
            .header(header::ORIGIN, &origin)
            .json(&json!({"token": token}))
            .send()
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);
        assert!(!missing.headers().contains_key(header::SET_COOKIE));
        let body: serde_json::Value = missing.json().await.unwrap();
        assert_eq!(body["passwordRequired"], true);

        assert_eq!(
            server
                .request(Method::GET, "/api/files", false)
                .header(header::COOKIE, format!("arus_share={token}"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );

        let wrong = server
            .request(Method::POST, "/api/session", false)
            .header(header::ORIGIN, &origin)
            .json(&json!({"token": token, "password": "wrong password"}))
            .send()
            .await
            .unwrap();
        assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
        assert!(!wrong.headers().contains_key(header::SET_COOKIE));
        let body: serde_json::Value = wrong.json().await.unwrap();
        assert_eq!(body["passwordRequired"], true);

        let valid = server
            .request(Method::POST, "/api/session", false)
            .header(header::ORIGIN, &origin)
            .json(&json!({"token": token, "password": password}))
            .send()
            .await
            .unwrap();
        assert_eq!(valid.status(), StatusCode::OK);
        let cookie = valid.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(cookie.contains("HttpOnly; SameSite=Strict; Path=/; Max-Age="));
        let pair = cookie.split(';').next().unwrap();
        assert!(!pair.contains(&token));
        assert_eq!(
            server
                .request(Method::GET, "/api/files", false)
                .header(header::COOKIE, pair)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        server.stop().await;
    }

    #[test]
    fn access_periods_are_bounded_and_persistent_is_explicit() {
        for (value, seconds, label) in [
            ("", 8 * 3600, "8h"),
            ("8h", 8 * 3600, "8h"),
            ("1h", 3600, "1h"),
            ("24h", 24 * 3600, "24h"),
        ] {
            assert_eq!(
                share_lifetime(value).unwrap(),
                (Some(Duration::from_secs(seconds)), label),
                "{value}"
            );
        }
        assert_eq!(share_lifetime("always").unwrap(), (None, "always"));
        for bad in ["0h", "forever", "7d", "8H", " always"] {
            assert!(share_lifetime(bad).is_err(), "{bad}");
        }
        let mut session = Session::new(
            Ipv4Addr::new(192, 168, 42, 1),
            24,
            9876,
            ShareContent::Files(HashMap::new()),
            &new_secret(),
            None,
        );
        session.set_lifetime(None, "always");
        assert!(session.active());
        assert_eq!(session.expires_at, None);
        assert_eq!(session.lifetime, "always");
        session.set_lifetime(Some(Duration::ZERO), "1h");
        assert!(!session.active());
        assert!(session.expires_at.is_some());
        assert_eq!(session.lifetime, "1h");
    }

    struct FolderFixture {
        root: PathBuf,
        folder: PathBuf,
    }
    impl FolderFixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("arus-folder-test-{}", Uuid::new_v4()));
            let folder = root.join("downloads");
            std::fs::create_dir_all(folder.join("Movies/Season 2")).unwrap();
            std::fs::create_dir_all(folder.join("Music")).unwrap();
            std::fs::create_dir_all(folder.join("Empty")).unwrap();
            std::fs::create_dir_all(root.join("outside")).unwrap();
            std::fs::write(folder.join("notes.txt"), b"hello").unwrap();
            std::fs::write(folder.join("Movies/Episode 01.mp4"), b"video-data").unwrap();
            std::fs::write(folder.join("Movies/Season 2/deep.txt"), b"deep").unwrap();
            std::fs::write(folder.join("Music/track.mp3"), b"audio").unwrap();
            std::fs::write(folder.join(".hidden.txt"), b"hidden").unwrap();
            std::fs::write(root.join("outside/secret.txt"), b"secret").unwrap();
            Self { root, folder }
        }
        fn content(&self) -> Arc<FolderRoot> {
            Arc::new(FolderRoot::new(FsPath::new(&self.folder)).unwrap())
        }
        fn session(&self) -> Arc<Session> {
            Arc::new(Session::new(
                Ipv4Addr::new(192, 168, 42, 1),
                24,
                9876,
                ShareContent::Folder(self.content()),
                &new_secret(),
                None,
            ))
        }
    }
    impl Drop for FolderFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn folder_listing_browses_and_scopes_ids() {
        let fixture = FolderFixture::new();
        let root = fixture.content();
        let listing = root.list("").unwrap();
        assert_eq!(listing.root, "downloads");
        assert_eq!(listing.path, "");
        assert_eq!(listing.parent, None);
        assert!(!listing.truncated);
        assert_eq!(
            listing.folders.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(),
            vec!["Empty", "Movies", "Music"]
        );
        assert_eq!(
            listing.files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(),
            vec!["notes.txt"]
        );
        let nested = root.list("Movies").unwrap();
        assert_eq!(nested.parent.as_deref(), Some(""));
        assert_eq!(nested.folders[0].name, "Season 2");
        assert_eq!(nested.folders[0].path, "Movies/Season 2");
        assert_eq!(nested.files[0].name, "Episode 01.mp4");
        assert_eq!(nested.files[0].media_type, "video");
        assert_eq!(nested.files[0].size, 10);
        assert!(nested.files[0].modified.is_some());
        let id = encode_id("Movies/Episode 01.mp4");
        assert_eq!(nested.files[0].id, id);
        let file = root.open_file(&id).unwrap();
        assert_eq!(file.info.name, "Episode 01.mp4");
        assert_eq!(file.mime, "video/mp4");
        assert!(root.open_file(&id.to_uppercase()).is_err());
        for bad in [
            "../outside/secret.txt",
            "/notes.txt",
            "\\notes.txt",
            "Movies/../notes.txt",
            "Movies\\Episode 01.mp4",
            ".hidden.txt",
            "C:/Windows/win.ini",
            "",
        ] {
            assert!(root.open_file(&encode_id(bad)).is_err(), "{bad}");
        }
        for bad in ["..", "../outside", ".hidden.txt", "notes.txt"] {
            assert!(root.list(bad).is_err(), "{bad}");
        }
        assert!(root.list("Movies/Season 2").is_ok());
    }

    #[test]
    fn folder_reflects_new_and_removed_files() {
        let fixture = FolderFixture::new();
        let root = fixture.content();
        let id = encode_id("fresh.txt");
        std::fs::write(fixture.folder.join("fresh.txt"), b"new").unwrap();
        assert!(root.list("").unwrap().files.iter().any(|f| f.id == id));
        drop(root.open_file(&id).unwrap());
        std::fs::remove_file(fixture.folder.join("fresh.txt")).unwrap();
        assert!(!root.list("").unwrap().files.iter().any(|f| f.id == id));
        assert!(root.open_file(&id).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn folder_hidden_entries_and_junctions_are_skipped() {
        let fixture = FolderFixture::new();
        let hidden = fixture.folder.join("private.txt");
        std::fs::write(&hidden, b"private").unwrap();
        let status = std::process::Command::new("attrib")
            .arg("+h")
            .arg(&hidden)
            .status()
            .unwrap();
        assert!(status.success());
        let junction = fixture.folder.join("linked");
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&junction)
            .arg(fixture.root.join("outside"))
            .output()
            .unwrap();
        assert!(output.status.success());
        let root = fixture.content();
        let listing = root.list("").unwrap();
        assert!(!listing.files.iter().any(|f| f.name == "private.txt"));
        assert!(!listing.folders.iter().any(|f| f.name == "linked"));
        assert!(root.list("linked").is_err());
        assert!(root.open_file(&encode_id("linked/secret.txt")).is_err());
        std::fs::remove_dir(&junction).unwrap();
        std::fs::remove_file(&hidden).unwrap();
    }

    #[test]
    fn folder_listing_is_capped() {
        let fixture = FolderFixture::new();
        let many = fixture.folder.join("Many");
        std::fs::create_dir_all(&many).unwrap();
        for index in 0..MAX_LIST_ENTRIES + 5 {
            std::fs::write(many.join(format!("f{index:04}.txt")), b"x").unwrap();
        }
        let listing = fixture.content().list("Many").unwrap();
        assert_eq!(listing.files.len(), MAX_LIST_ENTRIES);
        assert!(listing.truncated);
    }

    #[tokio::test]
    async fn folder_http_browses_streams_and_rejects_bad_paths() {
        let fixture = FolderFixture::new();
        let server = TestServer::new(fixture.session()).await;
        let listing: serde_json::Value = server
            .request(Method::GET, "/api/files", true)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(listing["mode"], "folder");
        assert_eq!(listing["root"], "downloads");
        assert_eq!(listing["path"], "");
        assert!(listing["folders"]
            .as_array()
            .unwrap()
            .iter()
            .any(|folder| folder["path"] == "Movies"));
        let id = encode_id("Movies/Episode 01.mp4");
        let file = server
            .request(Method::GET, &format!("/files/{id}"), true)
            .send()
            .await
            .unwrap();
        assert_eq!(file.status(), StatusCode::OK);
        assert_eq!(file.headers()[header::CONTENT_TYPE], "video/mp4");
        assert_eq!(file.bytes().await.unwrap().as_ref(), b"video-data");
        let nested: serde_json::Value = server
            .request(Method::GET, "/api/files?path=Movies", true)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(nested["path"], "Movies");
        assert_eq!(nested["parent"], "");
        assert_eq!(nested["files"][0]["id"], id);
        for path in ["/api/files?path=..", "/api/files?path=Movies%2F..%2F..", "/api/files?path=.hidden.txt"] {
            assert_eq!(
                server.request(Method::GET, path, true).send().await.unwrap().status(),
                StatusCode::NOT_FOUND,
                "{path}"
            );
        }
        for path in ["/files/ABCDEF", "/files/zz", "/files/"] {
            assert_eq!(
                server.request(Method::GET, path, true).send().await.unwrap().status(),
                StatusCode::NOT_FOUND,
                "{path}"
            );
        }
        assert_eq!(
            server.request(Method::GET, "/api/files", false).send().await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
        server.stop().await;
    }
}
