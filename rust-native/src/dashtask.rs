use crate::dash::parse_dash_manifest;
use crate::engine::*;
use crate::hls::{fetch_text, run_ffmpeg};
use crate::model::*;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

impl AppState {
    pub async fn run_dash(
        self: &Arc<Self>,
        id: &str,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let (text, final_url) = fetch_text(self, &dl, &dl.url, token).await?;
        if text.trim().is_empty() {
            return Err(RunError::failed("DASH manifest is empty"));
        }
        let manifest = parse_dash_manifest(&text, &final_url).map_err(RunError::failed)?;
        if manifest.needs_mux && !self.ffmpeg {
            return Err(RunError::failed(
                "DASH video and audio tracks require ffmpeg to combine",
            ));
        }
        let filename = dl.filename.clone().unwrap_or_else(|| {
            sanitize_filename(&format!(
                "{}.{}",
                stream_name(&dl.url),
                manifest.output_ext
            ))
        });
        let category = if manifest.video.is_some() {
            "video"
        } else {
            "audio"
        };
        let total_segments = manifest
            .video
            .as_ref()
            .map(|t| t.segments.len())
            .unwrap_or(0)
            + manifest
                .audio
                .as_ref()
                .map(|t| t.segments.len())
                .unwrap_or(0);
        let dash_state = DashState {
            total_segments: total_segments as u64,
            completed_segments: 0,
            duration: manifest.duration,
            output_ext: manifest.output_ext.clone(),
            muxed: manifest.needs_mux,
            video: manifest.video.clone(),
            audio: manifest.audio.clone(),
            variants: manifest.variants.clone(),
        };
        self.update_download(id, |record| {
            record.dash = Some(dash_state.clone());
            record.final_url = Some(final_url.clone());
            record.size = None;
            record.received = 0;
            record.filename = Some(filename.clone());
            record.category = category.into();
            record.media_kind = Some(category.into());
        });
        self.emit(true);
        self.persist();

        let dir = self.temp_dir.join(id);
        tokio::fs::create_dir_all(&dir).await?;
        self.download_dash_segments(id, &dash_state, &dir, token)
            .await?;

        let video_file = match &dash_state.video {
            Some(track) => Some(self.concat_dash_track(track, "v", &dir, "mp4").await?),
            None => None,
        };
        let audio_file = match &dash_state.audio {
            Some(track) => Some(self.concat_dash_track(track, "a", &dir, "m4a").await?),
            None => None,
        };
        let mut output = video_file.clone().or(audio_file.clone());
        if let (Some(video), Some(audio)) = (video_file, audio_file) {
            let muxed = dir.join("dash-output.mp4");
            let video_str = video.to_string_lossy().to_string();
            let audio_str = audio.to_string_lossy().to_string();
            let muxed_str = muxed.to_string_lossy().to_string();
            let ok = run_ffmpeg(&[
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                &video_str,
                "-i",
                &audio_str,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                &muxed_str,
            ])
            .await;
            if !ok {
                return Err(RunError::failed(
                    "ffmpeg could not mux the DASH video and audio tracks",
                ));
            }
            output = Some(muxed);
        }
        let output = output.ok_or_else(|| RunError::failed("DASH download produced no tracks"))?;
        self.finish(id, output).await?;
        Ok(())
    }

    async fn download_dash_segments(
        self: &Arc<Self>,
        id: &str,
        dash: &DashState,
        dir: &Path,
        token: &CancellationToken,
    ) -> Result<(), RunError> {
        let dl = self.get_download(id).ok_or(RunError::Cancelled)?;
        let mut tracks: Vec<(&str, &DashTrack)> = Vec::new();
        if let Some(track) = &dash.video {
            tracks.push(("v", track));
        }
        if let Some(track) = &dash.audio {
            tracks.push(("a", track));
        }

        for (key, track) in &tracks {
            if let Some(init) = &track.init {
                let init_path = dir.join(format!("{key}-init"));
                if !init_path.exists() {
                    self.fetch_dash_resource(
                        &dl,
                        &init.url,
                        init.range.as_ref(),
                        &init_path,
                        token,
                        &format!("{key} init"),
                    )
                    .await?;
                }
            }
        }

        let mut tasks: Vec<(&str, usize)> = Vec::new();
        let mut completed = 0u64;
        let mut bytes = 0u64;
        for (key, track) in &tracks {
            if let Some(init) = &track.init {
                if let Ok(meta) = tokio::fs::metadata(dir.join(format!("{key}-init"))).await {
                    bytes += meta.len();
                }
                let _ = init;
            }
            for index in 0..track.segments.len() {
                let path = dir.join(dash_file_name(key, index));
                match tokio::fs::metadata(&path).await {
                    Ok(meta) => {
                        completed += 1;
                        bytes += meta.len();
                    }
                    Err(_) => tasks.push((key, index)),
                }
            }
        }
        self.update_download(id, |record| {
            if let Some(state) = &mut record.dash {
                state.completed_segments = completed;
            }
            record.received = bytes;
        });
        self.emit(true);

        if tasks.is_empty() {
            return Ok(());
        }
        let total = dash.total_segments;
        let tasks_len = tasks.len() as u64;
        let workers = (dl.connections.clamp(1, 32) as usize)
            .min(tasks.len())
            .max(1);
        let cursor = Arc::new(AtomicUsize::new(0));
        let work = token.child_token();
        let failed: Arc<parking_lot::Mutex<Option<String>>> =
            Arc::new(parking_lot::Mutex::new(None));
        let progress = Arc::new(parking_lot::Mutex::new((bytes, 0u64)));
        let mut join = tokio::task::JoinSet::new();
        for _ in 0..workers {
            let state = self.clone();
            let tasks = tasks.clone();
            let cursor = cursor.clone();
            let work = work.clone();
            let failed = failed.clone();
            let progress = progress.clone();
            let dash = dash.clone();
            let dl = dl.clone();
            let dir = dir.to_path_buf();
            let id = id.to_string();
            join.spawn(async move {
                loop {
                    if work.is_cancelled() {
                        return;
                    }
                    let task_index = cursor.fetch_add(1, Ordering::SeqCst);
                    if task_index >= tasks.len() {
                        return;
                    }
                    let (key, index) = tasks[task_index].clone();
                    let track = if key == "v" {
                        dash.video.as_ref()
                    } else {
                        dash.audio.as_ref()
                    };
                    let Some(track) = track else {
                        continue;
                    };
                    let Some(segment) = track.segments.get(index) else {
                        continue;
                    };
                    let target = dir.join(dash_file_name(key, index));
                    let result = state
                        .fetch_dash_resource(
                            &dl,
                            &segment.url,
                            segment.range.as_ref(),
                            &target,
                            &work,
                            &format!("DASH segment {index}"),
                        )
                        .await;
                    match result {
                        Ok(size) => {
                            let (received, done) = {
                                let mut guard = progress.lock();
                                guard.0 += size;
                                guard.1 += 1;
                                *guard
                            };
                            let done = (total - tasks_len + done).min(total);
                            state.update_download(&id, |record| {
                                if let Some(state) = &mut record.dash {
                                    state.completed_segments = done;
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
        while join.join_next().await.is_some() {}
        if token.is_cancelled() {
            return Err(RunError::Cancelled);
        }
        if let Some(message) = failed.lock().clone() {
            return Err(RunError::failed(message));
        }
        self.update_download(id, |record| {
            if let Some(state) = &mut record.dash {
                state.completed_segments = total;
            }
        });
        self.emit(true);
        Ok(())
    }

    async fn fetch_dash_resource(
        &self,
        dl: &Download,
        url: &str,
        range: Option<&ByteRange>,
        target: &Path,
        token: &CancellationToken,
        label: &str,
    ) -> Result<u64, RunError> {
        let temp = PathBuf::from(format!("{}.part", target.to_string_lossy()));
        let mut attempt = 0u32;
        loop {
            if token.is_cancelled() {
                return Err(RunError::Cancelled);
            }
            let result = async {
                let _ = tokio::fs::remove_file(&temp).await;
                let mut extra = Vec::new();
                if let Some(range) = range {
                    extra.push((
                        "range",
                        format!("bytes={}-{}", range.offset, range.offset + range.length - 1),
                    ));
                }
                let request = self
                    .client
                    .get(url)
                    .headers(request_headers(dl, &extra));
                let mut response = send_cancellable(request, token).await?;
                if !response.status().is_success() {
                    return Err(RunError::failed(format!(
                        "HTTP {} for {label}",
                        response.status().as_u16()
                    )));
                }
                if range.is_some() && response.status().as_u16() != 206 {
                    return Err(RunError::failed(format!(
                        "Server ignored the byte range for {label}"
                    )));
                }
                let mut file = tokio::fs::File::create(&temp).await?;
                let mut size = 0u64;
                while let Some(chunk) = next_chunk(&mut response, token).await? {
                    self.limiter
                        .consume(chunk.len() as u64, self.rate_for(&dl.id), token)
                        .await?;
                    file.write_all(&chunk).await?;
                    size += chunk.len() as u64;
                }
                file.flush().await?;
                drop(file);
                tokio::fs::rename(&temp, target).await?;
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

    async fn concat_dash_track(
        &self,
        track: &DashTrack,
        key: &str,
        dir: &Path,
        ext: &str,
    ) -> Result<PathBuf, RunError> {
        let output = dir.join(format!("{key}-track.{ext}"));
        let mut file = tokio::fs::File::create(&output).await?;
        if track.init.is_some() {
            let mut init = tokio::fs::File::open(dir.join(format!("{key}-init"))).await?;
            tokio::io::copy(&mut init, &mut file).await?;
        }
        for index in 0..track.segments.len() {
            let mut segment =
                tokio::fs::File::open(dir.join(dash_file_name(key, index))).await?;
            tokio::io::copy(&mut segment, &mut file).await?;
        }
        file.flush().await?;
        Ok(output)
    }
}
