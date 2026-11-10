use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Arus/1.0";
pub const MIN_SEGMENT: u64 = 1024 * 1024;
pub const MAX_RETRIES: u32 = 4;
pub const PROTECTED_VIDEO_MESSAGE: &str =
    "YouTube video streams are protected and cannot be downloaded by Arus. Send a direct video, HLS, or DASH link instead.";

pub fn is_protected_video_host(host: &str) -> bool {
    let host = host.trim_start_matches("www.").to_ascii_lowercase();
    host == "youtu.be"
        || host == "youtube.com"
        || host.ends_with(".youtube.com")
        || host == "youtube-nocookie.com"
        || host.ends_with(".youtube-nocookie.com")
        || host == "googlevideo.com"
        || host.ends_with(".googlevideo.com")
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub download_dir: String,
    pub max_concurrent: u32,
    pub connections: u32,
    pub speed_limit: u64,
    pub auto_retry: u32,
    pub organize_by_category: bool,
    pub clipboard_watch: bool,
    pub notifications: bool,
    pub minimize_to_tray: bool,
    pub launch_at_login: bool,
    pub check_updates: bool,
    pub theme: String,
    pub compact_mode: bool,
    pub reduce_motion: bool,
}

impl Default for Settings {
    fn default() -> Self {
        let download_dir = std::path::Path::new(&home_dir())
            .join("Downloads")
            .join("Arus")
            .to_string_lossy()
            .to_string();
        Self {
            download_dir,
            max_concurrent: 4,
            connections: 16,
            speed_limit: 0,
            auto_retry: 3,
            organize_by_category: false,
            clipboard_watch: true,
            notifications: true,
            minimize_to_tray: true,
            launch_at_login: true,
            check_updates: true,
            theme: "dark".into(),
            compact_mode: false,
            reduce_motion: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Segment {
    pub index: u32,
    pub start: u64,
    pub end: u64,
    pub downloaded: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ByteRange {
    pub offset: u64,
    pub length: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Resource {
    pub url: String,
    pub range: Option<ByteRange>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HlsKey {
    pub method: String,
    pub url: String,
    pub iv: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HlsSegment {
    pub url: String,
    pub duration: f64,
    pub key: Option<HlsKey>,
    pub range: Option<ByteRange>,
    pub seq: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HlsVariant {
    pub bandwidth: u64,
    pub resolution: Option<String>,
    pub url: String,
    pub codecs: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HlsState {
    pub total_segments: u64,
    pub completed_segments: u64,
    pub duration: f64,
    pub init: Option<Resource>,
    pub segments: Vec<HlsSegment>,
    pub variant: Option<HlsVariant>,
    pub variants: Vec<HlsVariant>,
    pub output_ext: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DashSegment {
    pub url: String,
    pub range: Option<ByteRange>,
    pub duration: f64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DashTrack {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub bandwidth: u64,
    pub codecs: Option<String>,
    pub lang: Option<String>,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub resolution: Option<String>,
    pub init: Option<Resource>,
    pub segments: Vec<DashSegment>,
    pub single: bool,
    pub duration: f64,
    pub drm: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DashState {
    pub total_segments: u64,
    pub completed_segments: u64,
    pub duration: f64,
    pub output_ext: String,
    pub muxed: bool,
    pub video: Option<DashTrack>,
    pub audio: Option<DashTrack>,
    pub variants: Vec<DashVariant>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DashVariant {
    pub bandwidth: u64,
    pub resolution: Option<String>,
    pub codecs: Option<String>,
    pub id: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Download {
    pub id: String,
    pub url: String,
    pub final_url: Option<String>,
    pub kind: String,
    pub page_url: Option<String>,
    pub filename: Option<String>,
    pub folder: String,
    pub save_path: Option<String>,
    pub size: Option<u64>,
    pub received: u64,
    pub content_type: Option<String>,
    pub resumable: Option<bool>,
    pub status: String,
    pub error: Option<String>,
    pub connections: u32,
    pub speed_limit: u64,
    pub headers: BTreeMap<String, String>,
    pub category: String,
    pub media_kind: Option<String>,
    pub segments: Vec<Segment>,
    pub hls: Option<HlsState>,
    pub dash: Option<DashState>,
    pub priority: String,
    pub attempts: u32,
    pub retry_at: Option<u64>,
    pub start_at: Option<u64>,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub speed: f64,
    pub eta: Option<f64>,
    pub sha256: Option<String>,
    pub hash_size: Option<u64>,
    pub hash_mtime_ms: Option<u64>,
    pub hls_variant: Option<HlsVariant>,
}

impl Default for Download {
    fn default() -> Self {
        Self {
            id: String::new(),
            url: String::new(),
            final_url: None,
            kind: "file".into(),
            page_url: None,
            filename: None,
            folder: String::new(),
            save_path: None,
            size: None,
            received: 0,
            content_type: None,
            resumable: None,
            status: "queued".into(),
            error: None,
            connections: 16,
            speed_limit: 0,
            headers: BTreeMap::new(),
            category: "other".into(),
            media_kind: None,
            segments: Vec::new(),
            hls: None,
            dash: None,
            priority: "normal".into(),
            attempts: 0,
            retry_at: None,
            start_at: None,
            created_at: now_ms(),
            completed_at: None,
            speed: 0.0,
            eta: None,
            sha256: None,
            hash_size: None,
            hash_mtime_ms: None,
            hls_variant: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Lifetime {
    pub completed: u64,
    pub failed: u64,
    pub bytes: u64,
    pub since: u64,
}

impl Default for Lifetime {
    fn default() -> Self {
        Self {
            completed: 0,
            failed: 0,
            bytes: 0,
            since: now_ms(),
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistState {
    pub settings: Settings,
    pub downloads: Vec<Download>,
    pub stats: Option<Lifetime>,
}

pub fn combined_rate(global: u64, per_download: u64) -> u64 {
    match (global, per_download) {
        (0, per) => per,
        (global, 0) => global,
        (global, per) => global.min(per),
    }
}

pub fn priority_rank(value: &str) -> i32 {
    match value {
        "high" => 2,
        "low" => 0,
        _ => 1,
    }
}

pub fn normalize_priority(value: Option<&str>) -> String {
    match value {
        Some("high") => "high".into(),
        Some("low") => "low".into(),
        _ => "normal".into(),
    }
}

pub fn sanitize_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => out.push('_'),
            c if (c as u32) < 0x20 => out.push('_'),
            c => out.push(c),
        }
    }
    let out = out
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let out = out.trim_end_matches(['.', ' ']).to_string();
    let out = if out.is_empty() { "download".to_string() } else { out };
    let lower = out.to_ascii_lowercase();
    let reserved = {
        let stem = lower.split('.').next().unwrap_or("");
        ["con", "prn", "aux", "nul"].contains(&stem)
            || (stem.len() == 4
                && (stem.starts_with("com") || stem.starts_with("lpt"))
                && stem.as_bytes()[3].is_ascii_digit())
    };
    let out = if reserved { format!("_{out}") } else { out };
    out.chars().take(160).collect()
}

pub fn extension_of(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| !e.is_empty())
}

pub fn category_for(name: &str, kind: &str) -> String {
    if kind == "hls" {
        return "video".into();
    }
    let ext = extension_of(name);
    if kind == "dash" {
        return match ext.as_deref() {
            Some(e) if category_by_ext(e) == Some("audio") => "audio".into(),
            _ => "video".into(),
        };
    }
    ext.as_deref()
        .and_then(category_by_ext)
        .unwrap_or("other")
        .to_string()
}

fn category_by_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "webm" | "flv" | "m4v" | "ts" | "mpg"
        | "mpeg" | "3gp" => Some("video"),
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "opus" | "wma" => Some("audio"),
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "epub" | "csv"
        | "rtf" | "md" | "vtt" | "srt" | "ass" | "ssa" | "ttml" | "dfxp" => Some("document"),
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "cab" => Some("archive"),
        "exe" | "msi" | "dmg" | "pkg" | "deb" | "rpm" | "apk" | "appx" | "msix" | "bat"
        | "cmd" => Some("program"),
        "jpg" | "jpeg" | "jfif" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tif"
        | "tiff" | "avif" | "heic" | "heif" => Some("image"),
        _ => None,
    }
}

pub fn media_kind_for(category: &str) -> Option<String> {
    match category {
        "video" | "audio" => Some(category.to_string()),
        _ => None,
    }
}

pub fn category_folder(category: &str) -> &'static str {
    match category {
        "video" => "Video",
        "audio" => "Audio",
        "document" => "Documents",
        "archive" => "Archives",
        "program" => "Programs",
        "image" => "Images",
        _ => "Other",
    }
}

pub fn mime_ext(content_type: &str) -> Option<&'static str> {
    let base = content_type.split(';').next().unwrap_or("").trim();
    match base {
        "video/mp4" => Some("mp4"),
        "video/webm" => Some("webm"),
        "video/quicktime" => Some("mov"),
        "video/x-matroska" => Some("mkv"),
        "video/x-msvideo" => Some("avi"),
        "audio/mpeg" => Some("mp3"),
        "audio/mp4" => Some("m4a"),
        "audio/aac" => Some("aac"),
        "audio/ogg" => Some("ogg"),
        "audio/opus" => Some("opus"),
        "audio/flac" => Some("flac"),
        "audio/wav" | "audio/x-wav" => Some("wav"),
        "image/heic" | "image/heif" => Some("heic"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/avif" => Some("avif"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        "application/pdf" => Some("pdf"),
        "application/zip" => Some("zip"),
        "application/x-rar-compressed" | "application/vnd.rar" => Some("rar"),
        "application/x-7z-compressed" => Some("7z"),
        "application/gzip" | "application/x-gzip" => Some("gz"),
        "application/x-tar" => Some("tar"),
        "application/msword" => Some("doc"),
        "application/vnd.ms-excel" => Some("xls"),
        "application/vnd.ms-powerpoint" => Some("ppt"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
        "text/plain" => Some("txt"),
        "text/csv" => Some("csv"),
        "text/html" => Some("html"),
        "application/x-msdownload" => Some("exe"),
        "application/vnd.android.package-archive" => Some("apk"),
        "application/vnd.apple.mpegurl" => Some("m3u8"),
        "application/x-mpegurl" => Some("m3u8"),
        "application/dash+xml" => Some("mpd"),
        _ => None,
    }
}

pub fn sniff_ext_from_bytes(buf: &[u8]) -> Option<&'static str> {
    if buf.len() >= 12 && &buf[4..8] == b"ftyp" {
        return Some(match &buf[8..12] {
            b"heic" | b"heix" | b"hevc" | b"hevx" | b"heim" | b"heis" | b"hevm" | b"hevs"
            | b"mif1" | b"msf1" => "heic",
            b"avif" | b"avis" => "avif",
            b"qt  " => "mov",
            b"M4A " => "m4a",
            b"M4V " | b"M4VH" | b"M4VP" => "m4v",
            _ => "mp4",
        });
    }
    if buf.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    if buf.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if buf.starts_with(b"GIF8") {
        return Some("gif");
    }
    if buf.len() >= 12 && &buf[0..4] == b"RIFF" {
        match &buf[8..12] {
            b"WEBP" => return Some("webp"),
            b"WAVE" => return Some("wav"),
            b"AVI " => return Some("avi"),
            _ => {}
        }
    }
    if buf.starts_with(b"BM") {
        return Some("bmp");
    }
    if buf.starts_with(&[b'I', b'I', 0x2A, 0x00]) || buf.starts_with(&[b'M', b'M', 0x00, 0x2A]) {
        return Some("tiff");
    }
    if buf.starts_with(b"%PDF-") {
        return Some("pdf");
    }
    if buf.starts_with(b"PK\x03\x04") || buf.starts_with(b"PK\x05\x06") || buf.starts_with(b"PK\x07\x08") {
        return Some("zip");
    }
    if buf.starts_with(b"Rar!\x1A\x07") {
        return Some("rar");
    }
    if buf.starts_with(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        return Some("7z");
    }
    if buf.starts_with(&[0x1F, 0x8B]) {
        return Some("gz");
    }
    if buf.starts_with(b"fLaC") {
        return Some("flac");
    }
    if buf.starts_with(b"OggS") {
        return Some("ogg");
    }
    if buf.len() >= 2 && buf[0] == 0xFF && (buf[1] & 0xF0) == 0xF0 {
        return Some(if (buf[1] & 0x06) == 0 { "aac" } else { "mp3" });
    }
    if buf.starts_with(b"ID3") {
        return Some("mp3");
    }
    if buf.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        return Some("mkv");
    }
    if buf.len() >= 189 && buf[0] == 0x47 && buf[188] == 0x47 {
        return Some("ts");
    }
    if buf.starts_with(b"MZ") {
        return Some("exe");
    }
    let text = buf
        .strip_prefix([0xEFu8, 0xBB, 0xBF].as_slice())
        .unwrap_or(buf);
    let head = String::from_utf8_lossy(&text[..text.len().min(512)]).to_ascii_lowercase();
    let trimmed = head.trim_start();
    if trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg")) {
        return Some("svg");
    }
    if trimmed.starts_with("<!doctype html") || trimmed.starts_with("<html") {
        return Some("html");
    }
    None
}

pub fn derive_name(url: &str, content_type: Option<&str>) -> String {
    if let Ok(parsed) = Url::parse(url) {
        let base = parsed
            .path_segments()
            .and_then(|s| s.filter(|p| !p.is_empty()).next_back())
            .map(|s| percent_decode(s))
            .unwrap_or_default();
        if !base.is_empty() {
            if base.contains('.') {
                return sanitize_filename(&base);
            }
            if let Some(ext) = content_type.and_then(mime_ext) {
                return sanitize_filename(&format!("{base}.{ext}"));
            }
            return sanitize_filename(&base);
        }
    }
    let ext = content_type.and_then(mime_ext).unwrap_or("bin");
    format!("download.{ext}")
}

pub fn stream_name(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(name) = parsed
            .path_segments()
            .and_then(|s| s.filter(|p| !p.is_empty()).next_back())
        {
            let name = percent_decode(name);
            let stripped = regex::Regex::new(r"(?i)\.(m3u8|mpd)$")
                .map(|re| re.replace(&name, "").to_string())
                .unwrap_or(name.clone());
            if !stripped.is_empty() {
                return stripped;
            }
        }
    }
    "video".into()
}

pub fn percent_decode(value: &str) -> String {
    percent_encoding::percent_decode_str(value)
        .decode_utf8_lossy()
        .to_string()
}

pub fn host_of(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_string()))
        .unwrap_or_default()
}

pub fn split_segments(size: u64, count: u32) -> Vec<Segment> {
    let count = count.max(1) as u64;
    let base = size / count;
    let remainder = size % count;
    let mut parts = Vec::new();
    let mut offset = 0u64;
    for i in 0..count {
        let length = base + if i < remainder { 1 } else { 0 };
        if length == 0 {
            continue;
        }
        parts.push(Segment {
            index: parts.len() as u32,
            start: offset,
            end: offset + length - 1,
            downloaded: 0,
        });
        offset += length;
    }
    parts
}

pub fn public_download(dl: &Download) -> Value {
    let mut value = serde_json::to_value(dl).unwrap_or_else(|_| json!({}));
    if let Some(obj) = value.as_object_mut() {
        obj.remove("headers");
        obj.remove("finalUrl");
        obj.insert(
            "host".into(),
            json!(host_of(dl.final_url.as_deref().unwrap_or(&dl.url))),
        );
        obj.insert(
            "hls".into(),
            match &dl.hls {
                Some(hls) => {
                    let variants: Vec<&HlsVariant> = hls.variants.iter().take(8).collect();
                    json!({
                        "totalSegments": hls.total_segments,
                        "completedSegments": hls.completed_segments,
                        "duration": hls.duration,
                        "variant": hls.variant,
                        "variants": variants,
                        "outputExt": hls.output_ext,
                    })
                }
                None => Value::Null,
            },
        );
        obj.insert(
            "dash".into(),
            match &dl.dash {
                Some(dash) => json!({
                    "totalSegments": dash.total_segments,
                    "completedSegments": dash.completed_segments,
                    "duration": dash.duration,
                    "outputExt": dash.output_ext,
                    "muxed": dash.muxed,
                    "video": dash.video.as_ref().map(|t| json!({
                        "id": t.id,
                        "bandwidth": t.bandwidth,
                        "resolution": t.resolution,
                        "codecs": t.codecs,
                    })),
                    "audio": dash.audio.as_ref().map(|t| json!({
                        "id": t.id,
                        "bandwidth": t.bandwidth,
                        "codecs": t.codecs,
                        "lang": t.lang,
                    })),
                    "variants": dash.variants.iter().take(8).collect::<Vec<_>>(),
                }),
                None => Value::Null,
            },
        );
    }
    value
}
