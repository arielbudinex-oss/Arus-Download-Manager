use crate::engine::AppState;
use crate::model::{is_protected_video_host, percent_decode, PROTECTED_VIDEO_MESSAGE};
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;
use std::time::Duration;
use url::Url;

fn media_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\.(mp4|webm|mkv|mov|m4v|avi|ts|flv|wmv|mpg|mpeg|mp3|m4a|aac|flac|ogg|wav|opus|wma|m3u8|mpd)(?:[?#]|$)").unwrap()
    })
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&#X27;", "'")
        .replace("&#x2f;", "/")
        .replace("&#X2F;", "/")
}

fn clean_url(value: &str) -> String {
    let decoded = decode_entities(value.trim());
    decoded
        .replace("\\/", "/")
        .trim_matches(|c| c == '\'' || c == '"')
        .to_string()
}

fn extension_of(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|parsed| {
            parsed
                .path_segments()
                .and_then(|mut segments| segments.next_back().map(|s| s.to_string()))
        })
        .and_then(|name| name.rsplit('.').next().map(|ext| ext.to_ascii_lowercase()))
        .unwrap_or_default()
}

fn describe(url: &str) -> Option<(&'static str, &'static str, &'static str)> {
    let ext = extension_of(url);
    match ext.as_str() {
        "m3u8" => return Some(("hls", "video", "HLS stream")),
        "mpd" => return Some(("dash", "video", "DASH stream")),
        _ => {}
    }
    const VIDEO: [&str; 12] = [
        "mp4", "webm", "mkv", "mov", "m4v", "avi", "ts", "flv", "wmv", "mpg", "mpeg", "3gp",
    ];
    const AUDIO: [&str; 8] = ["mp3", "m4a", "aac", "flac", "ogg", "wav", "opus", "wma"];
    if VIDEO.contains(&ext.as_str()) {
        return Some(("file", "video", "Video file"));
    }
    if AUDIO.contains(&ext.as_str()) {
        return Some(("file", "audio", "Audio file"));
    }
    if media_re().is_match(url) {
        return Some(("file", "video", "Media file"));
    }
    None
}

fn quality_of(url: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"(?i)(2160p|1440p|1080p|720p|480p|360p|240p)|\b(4k|uhd|hd)\b").unwrap()
    });
    re.find(url).map(|m| m.as_str().to_string())
}

fn name_of(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(name) = parsed
            .path_segments()
            .and_then(|mut segments| segments.next_back())
            .filter(|name| !name.is_empty())
        {
            return percent_decode(name);
        }
        if let Some(host) = parsed.host_str() {
            return host.to_string();
        }
    }
    url.to_string()
}

pub async fn scan_page(state: &AppState, page_url: &str) -> Result<Value, String> {
    let parsed = Url::parse(page_url).map_err(|_| "Invalid URL".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https URLs are supported".into());
    }
    if is_protected_video_host(parsed.host_str().unwrap_or("")) {
        return Err(PROTECTED_VIDEO_MESSAGE.into());
    }
    let request = state
        .client
        .get(parsed)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.8")
        .timeout(Duration::from_secs(20));
    let mut response = request
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut candidates: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let mut add = |raw: &str, source: &str| {
        let cleaned = clean_url(raw);
        if cleaned.is_empty() {
            return;
        }
        let absolute = match Url::parse(&final_url).and_then(|base| base.join(&cleaned)) {
            Ok(url) => url.to_string(),
            Err(_) => return,
        };
        if !(absolute.starts_with("http://") || absolute.starts_with("https://")) {
            return;
        }
        let Some((kind, media, label)) = describe(&absolute) else {
            return;
        };
        let key = absolute.split('#').next().unwrap_or("").to_string();
        if !seen.insert(key.clone()) {
            return;
        }
        candidates.push(json!({
            "url": key,
            "kind": kind,
            "media": media,
            "supported": true,
            "label": label,
            "name": name_of(&key),
            "quality": quality_of(&key),
            "source": source,
        }));
    };

    let direct_ext = extension_of(&final_url);
    if direct_ext == "m3u8" || direct_ext == "mpd" {
        add(&final_url, "direct");
        return Ok(json!({ "pageUrl": final_url, "candidates": candidates }));
    }
    if !content_type.contains("html") && !content_type.contains("xml") {
        add(&final_url, "direct");
        return Ok(json!({ "pageUrl": final_url, "candidates": candidates }));
    }

    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|err| err.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() >= 4_000_000 {
            break;
        }
    }
    let html = String::from_utf8_lossy(&body[..body.len().min(4_000_000)]).to_string();

    let media_tag = Regex::new(r#"(?is)<(?:video|audio|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']"#).unwrap();
    for caps in media_tag.captures_iter(&html) {
        let matched = caps.get(0).map(|m| m.as_str().to_ascii_lowercase()).unwrap_or_default();
        let source = if matched.starts_with("<source") {
            "source-tag"
        } else {
            "media-tag"
        };
        if let Some(url) = caps.get(1) {
            add(url.as_str(), source);
        }
    }

    let meta_tag = Regex::new(r"(?is)<meta\b[^>]*>").unwrap();
    let content_attr = Regex::new(r#"(?is)\bcontent\s*=\s*["']([^"']+)["']"#).unwrap();
    for tag in meta_tag.find_iter(&html) {
        let text = tag.as_str().to_ascii_lowercase();
        if !(text.contains("og:video")
            || text.contains("og:audio")
            || text.contains("twitter:player:stream"))
        {
            continue;
        }
        if let Some(caps) = content_attr.captures(text.as_str()) {
            if let Some(url) = caps.get(1) {
                add(url.as_str(), "meta");
            }
        }
    }

    let anchor = Regex::new(r#"(?is)<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']"#).unwrap();
    for caps in anchor.captures_iter(&html) {
        if let Some(url) = caps.get(1) {
            if media_re().is_match(url.as_str()) {
                add(url.as_str(), "link");
            }
        }
    }

    let absolute = Regex::new(r#"https?://[^\s"'<>\\]+"#).unwrap();
    for found in absolute.find_iter(&html) {
        if media_re().is_match(found.as_str()) {
            add(found.as_str(), "markup");
        }
    }

    let escaped = Regex::new(r#"https?:\\/\\/[^\s"'<>]+"#).unwrap();
    for found in escaped.find_iter(&html) {
        let cleaned = found.as_str().replace("\\/", "/");
        if media_re().is_match(&cleaned) {
            add(&cleaned, "script");
        }
    }

    let json_keys = Regex::new(
        r#"(?is)"(?:contentUrl|contentURL|streamUrl|stream_url|videoUrl|video_url|hlsUrl|hls_url|dashUrl|dash_url|mpdUrl|mpd_url|src)"\s*:\s*"([^"]+)""#,
    )
    .unwrap();
    for caps in json_keys.captures_iter(&html) {
        if let Some(url) = caps.get(1) {
            add(url.as_str(), "json");
        }
    }

    candidates.truncate(120);
    Ok(json!({ "pageUrl": final_url, "candidates": candidates }))
}
