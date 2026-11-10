use crate::engine::*;
use crate::model::*;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

struct Probe {
    final_url: String,
    size: Option<u64>,
    content_type: Option<String>,
    resumable: bool,
    filename: Option<String>,
}

impl AppState {
    pub async fn run_file(
        self: &Arc<Self>,
        id: &str,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        self.prepare_file(id, token).await?;
        let dir = self.temp_dir.join(id);
        tokio::fs::create_dir_all(&dir).await?;
        let (resumable, segments) = {
            let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
            (dl.resumable == Some(true), dl.segments.clone())
        };
        if resumable && !segments.is_empty() {
            self.hydrate_file_segments(id).await?;
            self.transfer_segments(id, &dir, token.clone()).await?;
            self.merge_file_segments(id, &dir).await?;
        } else {
            self.transfer_single(id, &dir, token.clone()).await?;
            self.finish(id, dir.join("single")).await?;
        }
        Ok(())
    }

    async fn prepare_file(
        self: &Arc<Self>,
        id: &str,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let probe = self.probe(&dl, token).await?;
        let name = dl
            .filename
            .clone()
            .or(probe.filename.clone())
            .unwrap_or_else(|| derive_name(&probe.final_url, probe.content_type.as_deref()));
        let name = sanitize_filename(&name);
        let category = category_for(&name, &dl.kind);
        if matches!(category.as_str(), "video" | "audio") && is_page_type(probe.content_type.as_deref()) {
            return Err(RunError::failed(
                "The link returned a web page, not a media file. Open the page in your browser and send the direct video, HLS, or DASH link instead.",
            ));
        }
        let media_kind = media_kind_for(&category);
        let connections = dl.connections.clamp(1, 32);
        let mut segments = dl.segments.clone();
        if probe.resumable && probe.size.is_some() && segments.is_empty() {
            if let Some(size) = probe.size {
                let chunks = size.div_ceil(MIN_SEGMENT).max(1) as u32;
                let count = connections.min(chunks).max(1);
                segments = split_segments(size, count);
            }
        }
        if !probe.resumable {
            segments.clear();
        }
        self.update_download(id, |record| {
            record.final_url = Some(probe.final_url.clone());
            record.size = probe.size;
            record.content_type = probe.content_type.clone();
            record.resumable = Some(probe.resumable);
            record.filename = Some(name);
            record.category = category;
            record.media_kind = media_kind;
            record.segments = segments;
        });
        self.emit(true);
        self.persist();
        Ok(())
    }

    async fn probe(&self, dl: &Download, token: &CancellationToken) -> Result<Probe, RunError> {
        let mut meta = Probe {
            final_url: dl.url.clone(),
            size: None,
            content_type: None,
            resumable: false,
            filename: None,
        };

        let head_request = self
            .client
            .head(&dl.url)
            .headers(request_headers(dl, &[]));
        match send_cancellable(head_request, token).await {
            Ok(response) if response.status().is_success() => {
                meta.final_url = response.url().to_string();
                meta.size = header_u64(&response, reqwest::header::CONTENT_LENGTH);
                meta.content_type = header_string(&response, reqwest::header::CONTENT_TYPE);
                meta.filename = header_string(&response, reqwest::header::CONTENT_DISPOSITION)
                    .and_then(|value| disposition_filename(&value));
                let ranges = header_string(&response, reqwest::header::ACCEPT_RANGES)
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                meta.resumable = ranges.contains("bytes") && meta.size.is_some();
            }
            Ok(_) => {}
            Err(RunError::Cancelled) => return Err(RunError::Cancelled),
            Err(RunError::Failed(_)) => {}
        }

        if !meta.resumable || meta.size.is_none() {
            let request = self
                .client
                .get(&dl.url)
                .headers(request_headers(dl, &[("range", "bytes=0-0".into())]));
            let response = send_cancellable(request, token).await?;
            let status = response.status();
            if status.as_u16() == 206 {
                if let Some(range) = header_string(&response, reqwest::header::CONTENT_RANGE) {
                    let re = regex::Regex::new(r"/(\d+)\s*$").unwrap();
                    if let Some(caps) = re.captures(&range) {
                        meta.size = caps.get(1).and_then(|m| m.as_str().parse().ok());
                    }
                    meta.resumable = meta.size.is_some();
                }
                meta.final_url = response.url().to_string();
                if meta.content_type.is_none() {
                    meta.content_type = header_string(&response, reqwest::header::CONTENT_TYPE);
                }
                if meta.filename.is_none() {
                    meta.filename = header_string(&response, reqwest::header::CONTENT_DISPOSITION)
                        .and_then(|value| disposition_filename(&value));
                }
                drop(response);
            } else if status.is_success() {
                if meta.content_type.is_none() {
                    meta.content_type = header_string(&response, reqwest::header::CONTENT_TYPE);
                }
                if meta.filename.is_none() {
                    meta.filename = header_string(&response, reqwest::header::CONTENT_DISPOSITION)
                        .and_then(|value| disposition_filename(&value));
                }
                if meta.size.is_none() {
                    meta.size = header_u64(&response, reqwest::header::CONTENT_LENGTH);
                }
                meta.resumable = false;
                meta.final_url = response.url().to_string();
                drop(response);
            } else {
                drop(response);
                return Err(RunError::failed(format!("HTTP {}", status.as_u16())));
            }
        }

        if meta.filename.is_none() {
            meta.filename = Some(derive_name(
                &meta.final_url,
                meta.content_type.as_deref(),
            ));
        }
        Ok(meta)
    }

    async fn hydrate_file_segments(&self, id: &str) -> Result<(), RunError> {
        let dir = self.temp_dir.join(id);
        let segments = self
            .get_download(id)
            .map(|dl| dl.segments)
            .unwrap_or_default();
        for seg in segments {
            let file = find_part_file(&dir, seg.index);
            let size = tokio::fs::metadata(&file)
                .await
                .map(|m| m.len())
                .unwrap_or(0);
            let length = seg.end.saturating_sub(seg.start) + 1;
            self.update_download(id, |dl| {
                if let Some(item) = dl.segments.iter_mut().find(|s| s.index == seg.index) {
                    item.downloaded = size.min(length);
                }
            });
        }
        Ok(())
    }

    async fn transfer_segments(
        self: &Arc<Self>,
        id: &str,
        dir: &Path,
        token: CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let pending: Vec<Segment> = dl
            .segments
            .iter()
            .filter(|seg| seg.downloaded < seg.end.saturating_sub(seg.start) + 1)
            .cloned()
            .collect();
        if pending.is_empty() {
            return Ok(());
        }
        let workers = (dl.connections.clamp(1, 32) as usize)
            .min(pending.len())
            .max(1);
        let cursor = Arc::new(AtomicUsize::new(0));
        let work = token.child_token();
        let failed: Arc<parking_lot::Mutex<Option<String>>> =
            Arc::new(parking_lot::Mutex::new(None));
        let mut tasks = tokio::task::JoinSet::new();
        for _ in 0..workers {
            let state = self.clone();
            let pending = pending.clone();
            let cursor = cursor.clone();
            let work = work.clone();
            let failed = failed.clone();
            let dir = dir.to_path_buf();
            let id = id.to_string();
            tasks.spawn(async move {
                loop {
                    if work.is_cancelled() {
                        return;
                    }
                    let index = cursor.fetch_add(1, Ordering::SeqCst);
                    if index >= pending.len() {
                        return;
                    }
                    if let Err(err) = state
                        .run_segment(&id, &pending[index], &dir, &work)
                        .await
                    {
                        if !is_cancelled(&err) {
                            let mut slot = failed.lock();
                            if slot.is_none() {
                                *slot = Some(match err {
                                    RunError::Failed(message) => message,
                                    RunError::Cancelled => "download cancelled".into(),
                                });
                            }
                            work.cancel();
                        }
                        return;
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
        Ok(())
    }

    async fn run_segment(
        self: &Arc<Self>,
        id: &str,
        seg: &Segment,
        dir: &Path,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let part = find_part_file(dir, seg.index);
        let length = seg.end.saturating_sub(seg.start) + 1;
        let mut downloaded = seg.downloaded.min(length);
        let mut position = seg.start + downloaded;
        let mut attempt = 0u32;
        loop {
            if position > seg.end {
                return Ok(());
            }
            if token.is_cancelled() {
                return Err(RunError::Cancelled);
            }
            match self
                .stream_segment(&dl, seg, &part, &mut position, token)
                .await
            {
                Ok(()) => {
                    if position > seg.end {
                        return Ok(());
                    }
                    return Err(RunError::failed("Segment ended early"));
                }
                Err(err) => {
                    if is_cancelled(&err) {
                        return Err(err);
                    }
                    attempt += 1;
                    if attempt > MAX_RETRIES {
                        return Err(err);
                    }
                    let wait = (500u64 * 2u64.pow(attempt)).min(8000);
                    sleep_cancellable(wait, token).await?;
                    let size = tokio::fs::metadata(&part)
                        .await
                        .map(|m| m.len())
                        .unwrap_or(0);
                    downloaded = size.min(length);
                    position = seg.start + downloaded;
                    self.update_download(id, |record| {
                        if let Some(item) =
                            record.segments.iter_mut().find(|s| s.index == seg.index)
                        {
                            item.downloaded = downloaded;
                        }
                    });
                }
            }
        }
    }

    async fn stream_segment(
        &self,
        dl: &Download,
        seg: &Segment,
        part: &Path,
        position: &mut u64,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let url = dl.final_url.clone().unwrap_or_else(|| dl.url.clone());
        let range = format!("bytes={}-{}", *position, seg.end);
        let request = self
            .client
            .get(&url)
            .headers(request_headers(dl, &[("range", range)]));
        let mut response = send_cancellable(request, token).await?;
        if response.status().as_u16() != 206 {
            return Err(RunError::failed(format!(
                "Server returned {} for a range request",
                response.status().as_u16()
            )));
        }
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(part)
            .await?;
        let length = seg.end.saturating_sub(seg.start) + 1;
        while let Some(chunk) = next_chunk(&mut response, token).await? {
            self.limiter
                .consume(chunk.len() as u64, self.rate_for(&dl.id), token)
                .await?;
            file.write_all(&chunk).await?;
            *position += chunk.len() as u64;
            let downloaded = (*position - seg.start).min(length);
            let index = seg.index;
            self.update_download(&dl.id, |record| {
                if let Some(item) = record.segments.iter_mut().find(|s| s.index == index) {
                    item.downloaded = downloaded;
                }
            });
        }
        file.flush().await?;
        Ok(())
    }

    async fn transfer_single(
        self: &Arc<Self>,
        id: &str,
        dir: &Path,
        token: CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let url = dl.final_url.clone().unwrap_or_else(|| dl.url.clone());
        let request = self.client.get(&url).headers(request_headers(&dl, &[]));
        let mut response = send_cancellable(request, &token).await?;
        if !response.status().is_success() {
            return Err(RunError::failed(format!(
                "HTTP {}",
                response.status().as_u16()
            )));
        }
        if matches!(dl.category.as_str(), "video" | "audio")
            && is_page_type(header_string(&response, reqwest::header::CONTENT_TYPE).as_deref())
        {
            return Err(RunError::failed(
                "The link returned a web page, not a media file. Open the page in your browser and send the direct video, HLS, or DASH link instead.",
            ));
        }
        let mut file = tokio::fs::File::create(dir.join("single")).await?;
        self.update_download(id, |record| record.received = 0);
        let mut received = 0u64;
        while let Some(chunk) = next_chunk(&mut response, &token).await? {
            self.limiter
                .consume(chunk.len() as u64, self.rate_for(&dl.id), &token)
                .await?;
            file.write_all(&chunk).await?;
            received += chunk.len() as u64;
            self.update_download(id, |record| record.received = received);
        }
        file.flush().await?;
        if let Some(size) = dl.size {
            if received < size {
                return Err(RunError::failed("Transfer ended early"));
            }
        }
        Ok(())
    }

    async fn merge_file_segments(
        self: &Arc<Self>,
        id: &str,
        dir: &Path,
    ) -> Result<(), RunError> {
        let mut segments = self
            .get_download(id)
            .map(|dl| dl.segments)
            .unwrap_or_default();
        segments.sort_by_key(|seg| seg.index);
        let merged = dir.join("merged");
        let mut output = tokio::fs::File::create(&merged).await?;
        for seg in segments {
            let mut part = tokio::fs::File::open(find_part_file(dir, seg.index)).await?;
            tokio::io::copy(&mut part, &mut output).await?;
        }
        output.flush().await?;
        drop(output);
        let size = tokio::fs::metadata(&merged).await?.len();
        self.update_download(id, |record| {
            record.size = Some(size);
            record.received = size;
        });
        self.finish(id, merged).await
    }

    pub async fn finish(&self, id: &str, temp_file: PathBuf) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let (organize, default_dir) = {
            let core = self.core.lock();
            (
                core.settings.organize_by_category,
                core.settings.download_dir.clone(),
            )
        };
        let base_folder = if dl.folder.trim().is_empty() {
            PathBuf::from(default_dir)
        } else {
            PathBuf::from(&dl.folder)
        };
        let folder = if organize {
            base_folder.join(category_folder(&dl.category))
        } else {
            base_folder
        };
        tokio::fs::create_dir_all(&folder).await?;

        let filename = dl
            .filename
            .clone()
            .unwrap_or_else(|| "download".to_string());
        let temp_ext = temp_file
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_string());
        let name_path = Path::new(&filename);
        let name_ext = name_path.extension().and_then(|e| e.to_str()).map(|e| e.to_string());
        let ext = match temp_ext.or(name_ext) {
            Some(value) => Some(value),
            None => sniff_extension(&temp_file).await,
        };
        let stem = name_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&filename);
        let base = sanitize_filename(stem);
        let target = self.allocate_path(&folder, &base, ext.as_deref()).await?;
        let key = target.to_string_lossy().to_string();
        let moved = move_file(&temp_file, &target).await;
        self.core.lock().reserved.remove(&key);
        moved?;

        let size = tokio::fs::metadata(&target).await?.len();
        let target_name = target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&filename)
            .to_string();
        let category = category_for(&target_name, &dl.kind);
        let media_kind = media_kind_for(&category);
        self.update_download(id, |record| {
            record.save_path = Some(target.to_string_lossy().to_string());
            record.filename = Some(target_name);
            record.size = Some(size);
            record.received = size;
            record.category = category;
            record.media_kind = media_kind;
        });
        let temp_dir = self.temp_dir.join(id);
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        Ok(())
    }

    async fn allocate_path(
        &self,
        folder: &Path,
        base: &str,
        ext: Option<&str>,
    ) -> Result<PathBuf, RunError> {
        for index in 0..10000u32 {
            let name = match (index, ext) {
                (0, Some(ext)) => format!("{base}.{ext}"),
                (0, None) => base.to_string(),
                (n, Some(ext)) => format!("{base} ({n}).{ext}"),
                (n, None) => format!("{base} ({n})"),
            };
            let candidate = folder.join(name);
            let key = candidate.to_string_lossy().to_string();
            if self.core.lock().reserved.contains(&key) {
                continue;
            }
            if tokio::fs::metadata(&candidate).await.is_ok() {
                continue;
            }
            self.core.lock().reserved.insert(key);
            return Ok(candidate);
        }
        Err(RunError::failed("Could not allocate a target file name"))
    }
}

fn header_string(response: &reqwest::Response, name: reqwest::header::HeaderName) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
}

fn is_page_type(content_type: Option<&str>) -> bool {
    matches!(
        content_type
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "text/html" | "application/xhtml+xml" | "application/json"
    )
}

fn header_u64(response: &reqwest::Response, name: reqwest::header::HeaderName) -> Option<u64> {
    header_string(response, name)
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
}

async fn sniff_extension(path: &Path) -> Option<String> {
    let mut file = tokio::fs::File::open(path).await.ok()?;
    let mut buf = [0u8; 512];
    let read = file.read(&mut buf).await.ok()?;
    sniff_ext_from_bytes(&buf[..read]).map(|ext| ext.to_string())
}

async fn move_file(source: &Path, target: &Path) -> Result<(), RunError> {
    match tokio::fs::rename(source, target).await {
        Ok(()) => Ok(()),
        Err(_) => {
            tokio::fs::copy(source, target).await?;
            let _ = tokio::fs::remove_file(source).await;
            Ok(())
        }
    }
}
