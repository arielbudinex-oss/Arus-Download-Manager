use crate::engine::*;
use crate::model::*;
use aes::cipher::block_padding::{NoPadding, Pkcs7};
use aes::cipher::{BlockDecryptMut, KeyIvInit};
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;

pub struct HlsMedia {
    pub segments: Vec<HlsSegment>,
    pub duration: f64,
    pub init: Option<Resource>,
    pub ended: bool,
}

fn attr_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"([A-Z0-9-]+)=("[^"]*"|[^,]*)"#).unwrap())
}

pub fn parse_attributes(line: &str) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    for caps in attr_re().captures_iter(line) {
        let key = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let mut value = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
            value = &value[1..value.len() - 1];
        }
        attrs.insert(key.to_string(), value.to_string());
    }
    attrs
}

fn parse_byte_range(value: &str, fallback: u64) -> Option<ByteRange> {
    let mut split = value.split('@');
    let length: u64 = split.next()?.trim().parse().ok()?;
    let offset = split
        .next()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(fallback);
    Some(ByteRange { offset, length })
}

pub fn resolve_url(reference: &str, base: &str) -> String {
    url::Url::parse(base)
        .ok()
        .and_then(|base| base.join(reference).ok())
        .map(|url| url.to_string())
        .unwrap_or_else(|| reference.to_string())
}

pub fn parse_master_playlist(text: &str, base_url: &str) -> Vec<HlsVariant> {
    let lines: Vec<&str> = text.lines().collect();
    let mut variants = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index].trim();
        if let Some(rest) = line.strip_prefix("#EXT-X-STREAM-INF:") {
            let attrs = parse_attributes(rest);
            let mut next = index + 1;
            while next < lines.len() {
                let candidate = lines[next].trim();
                if !candidate.is_empty() && !candidate.starts_with('#') {
                    break;
                }
                next += 1;
            }
            if next < lines.len() {
                variants.push(HlsVariant {
                    url: resolve_url(lines[next].trim(), base_url),
                    bandwidth: attrs
                        .get("BANDWIDTH")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0),
                    resolution: attrs.get("RESOLUTION").cloned(),
                    codecs: attrs.get("CODECS").cloned(),
                });
            }
            index = next;
        }
        index += 1;
    }
    variants
}

pub fn parse_media_playlist(text: &str, base_url: &str) -> HlsMedia {
    let mut segments = Vec::new();
    let mut duration = 0.0;
    let mut init: Option<Resource> = None;
    let mut pending_duration = 0.0;
    let mut key: Option<HlsKey> = None;
    let mut byte_range: Option<ByteRange> = None;
    let mut sequence = 0u64;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
            sequence = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("#EXT-X-MAP:") {
            let attrs = parse_attributes(rest);
            if let Some(uri) = attrs.get("URI") {
                let range = attrs
                    .get("BYTERANGE")
                    .and_then(|value| parse_byte_range(value, 0));
                init = Some(Resource {
                    url: resolve_url(uri, base_url),
                    range,
                });
            }
        } else if let Some(rest) = line.strip_prefix("#EXT-X-KEY:") {
            let attrs = parse_attributes(rest);
            match attrs.get("METHOD").map(|m| m.as_str()) {
                None | Some("NONE") => key = None,
                Some("AES-128") => {
                    if let Some(uri) = attrs.get("URI") {
                        key = Some(HlsKey {
                            method: "AES-128".into(),
                            url: resolve_url(uri, base_url),
                            iv: attrs.get("IV").cloned(),
                        });
                    }
                }
                Some(_) => {}
            }
        } else if let Some(rest) = line.strip_prefix("#EXT-X-BYTERANGE:") {
            byte_range = parse_byte_range(rest, 0);
        } else if let Some(rest) = line.strip_prefix("#EXTINF:") {
            pending_duration = rest
                .split(',')
                .next()
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or(0.0);
        } else if !line.starts_with('#') {
            let url = resolve_url(line, base_url);
            segments.push(HlsSegment {
                url,
                duration: pending_duration,
                key: key.clone(),
                range: byte_range,
                seq: sequence + segments.len() as u64,
            });
            duration += pending_duration;
            pending_duration = 0.0;
            byte_range = None;
        }
    }

    HlsMedia {
        segments,
        duration,
        init,
        ended: text.contains("#EXT-X-ENDLIST"),
    }
}

impl AppState {
    pub async fn run_hls(
        self: &Arc<Self>,
        id: &str,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let (master_text, master_url) = fetch_text(self, &dl, &dl.url, token).await?;
        let mut playlist_url = master_url;
        let mut media_text = master_text;
        let mut variants = Vec::new();
        if media_text.contains("#EXT-X-STREAM-INF") {
            variants = parse_master_playlist(&media_text, &playlist_url);
            if variants.is_empty() {
                return Err(RunError::failed("HLS master playlist has no variants"));
            }
            variants.sort_by(|a, b| b.bandwidth.cmp(&a.bandwidth));
            let best = variants[0].clone();
            let (text, url) = fetch_text(self, &dl, &best.url, token).await?;
            media_text = text;
            playlist_url = url;
            self.update_download(id, |record| {
                record.hls_variant = Some(best.clone());
            });
        }

        let media = parse_media_playlist(&media_text, &playlist_url);
        if media.segments.is_empty() {
            return Err(RunError::failed("HLS playlist has no segments"));
        }
        if !media.ended {
            return Err(RunError::failed("Live HLS streams are not supported"));
        }
        let output_ext = if media.init.is_some() { "mp4" } else { "ts" };
        let filename = dl.filename.clone().unwrap_or_else(|| {
            sanitize_filename(&format!("{}.{}", stream_name(&dl.url), output_ext))
        });
        let playlist = HlsState {
            total_segments: media.segments.len() as u64,
            completed_segments: 0,
            duration: media.duration,
            init: media.init,
            segments: media.segments,
            variant: variants.first().cloned(),
            variants,
            output_ext: output_ext.into(),
        };
        self.update_download(id, |record| {
            record.hls = Some(playlist.clone());
            record.final_url = Some(playlist_url.clone());
            record.size = None;
            record.received = 0;
            record.filename = Some(filename.clone());
            record.category = "video".into();
            record.media_kind = Some("video".into());
        });
        self.emit(true);
        self.persist();

        let dir = self.temp_dir.join(id);
        tokio::fs::create_dir_all(&dir).await?;
        self.download_hls_segments(id, &playlist, &dir, token).await?;
        let output = self.concat_hls(&dl, &playlist, &dir, token).await?;
        self.finish(id, output).await?;
        Ok(())
    }

    async fn download_hls_segments(
        self: &Arc<Self>,
        id: &str,
        playlist: &HlsState,
        dir: &Path,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        if let Some(init) = &playlist.init {
            let init_path = dir.join("hls-init");
            if !init_path.exists() {
                self.fetch_hls_init(init, &self.get_download(id).unwrap_or_default(), &init_path, token)
                    .await?;
            }
        }
        let mut pending = Vec::new();
        let mut completed = 0u64;
        let mut bytes = 0u64;
        for (index, seg) in playlist.segments.iter().enumerate() {
            let path = find_hls_segment_file(dir, index);
            match tokio::fs::metadata(&path).await {
                Ok(meta) => {
                    completed += 1;
                    bytes += meta.len();
                }
                Err(_) => pending.push((index, seg.clone())),
            }
        }
        self.update_download(id, |record| {
            if let Some(hls) = &mut record.hls {
                hls.completed_segments = completed;
            }
            record.received = bytes;
        });
        self.emit(true);

        if pending.is_empty() {
            return Ok(());
        }
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let workers = (dl.connections.clamp(1, 32) as usize)
            .min(pending.len())
            .max(1);
        let total = playlist.segments.len() as u64;
        let pending_len = pending.len() as u64;
        let cursor = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let work = token.child_token();
        let failed: Arc<parking_lot::Mutex<Option<String>>> =
            Arc::new(parking_lot::Mutex::new(None));
        let key_cache: Arc<parking_lot::Mutex<HashMap<String, [u8; 16]>>> =
            Arc::new(parking_lot::Mutex::new(HashMap::new()));
        let progress = Arc::new(parking_lot::Mutex::new((bytes, 0u64)));
        let mut tasks = tokio::task::JoinSet::new();
        for _ in 0..workers {
            let state = self.clone();
            let pending = pending.clone();
            let cursor = cursor.clone();
            let work = work.clone();
            let failed = failed.clone();
            let key_cache = key_cache.clone();
            let progress = progress.clone();
            let dl = dl.clone();
            let dir = dir.to_path_buf();
            let id = id.to_string();
            tasks.spawn(async move {
                loop {
                    if work.is_cancelled() {
                        return;
                    }
                    let index = cursor.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    if index >= pending.len() {
                        return;
                    }
                    let (segment_index, segment) = pending[index].clone();
                    match state
                        .fetch_hls_segment(
                            &dl,
                            &segment,
                            segment_index,
                            &dir,
                            &key_cache,
                            &work,
                        )
                        .await
                    {
                        Ok(size) => {
                            let (received, done) = {
                                let mut guard = progress.lock();
                                guard.0 += size;
                                guard.1 += 1;
                                *guard
                            };
                            let done = (total - pending_len + done).min(total);
                            state.update_download(&id, |record| {
                                if let Some(hls) = &mut record.hls {
                                    hls.completed_segments = done;
                                }
                                record.received = received;
                            });
                            state.emit(false);
                        }
                        Err(err) => {
                            if !is_cancelled(&err) {
                                let mut slot = failed.lock();
                                if slot.is_none() {
                                    *slot = Some(match err {
                                        RunError::Failed(message) => message,
                                        RunError::Cancelled => "cancelled".into(),
                                    });
                                }
                                work.cancel();
                            }
                            return;
                        }
                    }
                }
            });
        }
        while tasks.join_next().await.is_some() {}
        if token.is_cancelled() {
            return Err(RunError::Cancelled);
        }
        if let Some(message) = failed.lock().clone() {
            return Err(RunError::failed(message));
        }
        self.update_download(id, |record| {
            if let Some(hls) = &mut record.hls {
                hls.completed_segments = total;
            }
        });
        self.emit(true);
        Ok(())
    }

    async fn fetch_hls_init(
        &self,
        init: &Resource,
        dl: &Download,
        target: &Path,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let mut extra = Vec::new();
        if let Some(range) = &init.range {
            extra.push((
                "range",
                format!("bytes={}-{}", range.offset, range.offset + range.length - 1),
            ));
        }
        let request = self
            .client
            .get(&init.url)
            .headers(request_headers(dl, &extra));
        let mut response = send_cancellable(request, token).await?;
        if !response.status().is_success() {
            return Err(RunError::failed(format!(
                "HTTP {} for HLS init segment",
                response.status().as_u16()
            )));
        }
        let body = read_body(&mut response, token).await?;
        tokio::fs::write(target, body).await?;
        Ok(())
    }

    async fn fetch_hls_segment(
        &self,
        dl: &Download,
        seg: &HlsSegment,
        index: usize,
        dir: &Path,
        key_cache: &Arc<parking_lot::Mutex<HashMap<String, [u8; 16]>>>,
        token: &CancellationToken,
    ) -> Result<u64, RunError> {
        let target = find_hls_segment_file(dir, index);
        let temp = dir.join(format!("hls-{index:05}.part"));
        let mut attempt = 0u32;
        loop {
            if token.is_cancelled() {
                return Err(RunError::Cancelled);
            }
            let mut extra = Vec::new();
            if let Some(range) = &seg.range {
                extra.push((
                    "range",
                    format!("bytes={}-{}", range.offset, range.offset + range.length - 1),
                ));
            }
            let request = self
                .client
                .get(&seg.url)
                .headers(request_headers(dl, &extra));
            let result = async {
                let mut response = send_cancellable(request, token).await?;
                if !response.status().is_success() {
                    return Err(RunError::failed(format!(
                        "HTTP {} for HLS segment {index}",
                        response.status().as_u16()
                    )));
                }
                let mut body = Vec::new();
                while let Some(chunk) = next_chunk(&mut response, token).await? {
                    self.limiter
                        .consume(chunk.len() as u64, self.rate_for(&dl.id), token)
                        .await?;
                    body.extend_from_slice(&chunk);
                }
                let body = if let Some(key) = &seg.key {
                    decrypt_segment(self, dl, body, key, seg.seq, key_cache, token).await?
                } else {
                    body
                };
                let size = body.len() as u64;
                tokio::fs::write(&temp, body).await?;
                tokio::fs::rename(&temp, &target).await?;
                Ok::<u64, RunError>(size)
            }
            .await;
            match result {
                Ok(size) => return Ok(size),
                Err(err) => {
                    if is_cancelled(&err) {
                        return Err(err);
                    }
                    attempt += 1;
                    if attempt > MAX_RETRIES {
                        return Err(err);
                    }
                    sleep_cancellable((500u64 * 2u64.pow(attempt)).min(8000), token).await?;
                }
            }
        }
    }

    async fn concat_hls(
        &self,
        dl: &Download,
        playlist: &HlsState,
        dir: &Path,
        token: &CancellationToken,
    ) -> Result<PathBuf, RunError> {
        let is_fmp4 = playlist.init.is_some();
        let mut output = dir.join(if is_fmp4 { "output.mp4" } else { "output.ts" });
        let mut file = tokio::fs::File::create(&output).await?;
        if playlist.init.is_some() {
            let mut init = tokio::fs::File::open(dir.join("hls-init")).await?;
            tokio::io::copy(&mut init, &mut file).await?;
        }
        for index in 0..playlist.segments.len() {
            let mut segment = tokio::fs::File::open(find_hls_segment_file(dir, index)).await?;
            tokio::io::copy(&mut segment, &mut file).await?;
        }
        file.flush().await?;
        drop(file);
        let _ = token;

        if !is_fmp4 && self.ffmpeg {
            let mp4 = dir.join("output-remux.mp4");
            let output_str = output.to_string_lossy().to_string();
            let mp4_str = mp4.to_string_lossy().to_string();
            let ok = run_ffmpeg(&[
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                &output_str,
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                &mp4_str,
            ])
            .await;
            if ok {
                let _ = tokio::fs::remove_file(&output).await;
                output = mp4;
            }
        }
        let _ = dl;
        Ok(output)
    }
}

pub async fn fetch_text(
    state: &AppState,
    dl: &Download,
    url: &str,
    token: &CancellationToken,
) -> Result<(String, String), RunError> {
    let request = state.client.get(url).headers(request_headers(dl, &[]));
    let mut response = send_cancellable(request, token).await?;
    if !response.status().is_success() {
        return Err(RunError::failed(format!(
            "HTTP {}",
            response.status().as_u16()
        )));
    }
    let final_url = response.url().to_string();
    let body = read_body(&mut response, token).await?;
    let text = String::from_utf8_lossy(&body).to_string();
    Ok((text, final_url))
}

async fn decrypt_segment(
    state: &AppState,
    dl: &Download,
    body: Vec<u8>,
    key: &HlsKey,
    seq: u64,
    cache: &Arc<parking_lot::Mutex<HashMap<String, [u8; 16]>>>,
    token: &CancellationToken,
) -> Result<Vec<u8>, RunError> {
    let key_bytes = {
        let cached = cache.lock().get(&key.url).copied();
        match cached {
            Some(bytes) => bytes,
            None => {
                let request = state
                    .client
                    .get(&key.url)
                    .headers(request_headers(dl, &[]));
                let mut response = send_cancellable(request, token).await?;
                if !response.status().is_success() {
                    return Err(RunError::failed(format!(
                        "HTTP {} for HLS key",
                        response.status().as_u16()
                    )));
                }
                let data = read_body(&mut response, token).await?;
                if data.len() != 16 {
                    return Err(RunError::failed("Invalid HLS AES-128 key"));
                }
                let mut bytes = [0u8; 16];
                bytes.copy_from_slice(&data);
                cache.lock().insert(key.url.clone(), bytes);
                bytes
            }
        }
    };

    let mut iv = [0u8; 16];
    if let Some(value) = &key.iv {
        let hex_value = value.trim_start_matches("0x").trim_start_matches("0X");
        if let Ok(decoded) = hex::decode(hex_value) {
            if decoded.len() == 16 {
                iv.copy_from_slice(&decoded);
            } else {
                return Err(RunError::failed("Invalid HLS IV"));
            }
        } else {
            return Err(RunError::failed("Invalid HLS IV"));
        }
    } else {
        iv[8..16].copy_from_slice(&seq.to_be_bytes());
    }

    let decryptor = Aes128CbcDec::new(&key_bytes.into(), &iv.into());
    match decryptor.decrypt_padded_vec_mut::<Pkcs7>(&body) {
        Ok(plain) => Ok(plain),
        Err(_) => {
            let fallback = Aes128CbcDec::new(&key_bytes.into(), &iv.into());
            fallback
                .decrypt_padded_vec_mut::<NoPadding>(&body)
                .map_err(|_| RunError::failed("Could not decrypt HLS segment"))
        }
    }
}

pub async fn run_ffmpeg(args: &[&str]) -> bool {
    let mut command = tokio::process::Command::new("ffmpeg");
    command
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null());
    match tokio::time::timeout(std::time::Duration::from_secs(600), command.status()).await {
        Ok(Ok(status)) => status.success(),
        _ => false,
    }
}
