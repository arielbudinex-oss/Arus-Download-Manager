use crate::model::{now_ms, Lifetime, PersistState};
use std::path::Path;

pub fn load(path: &Path) -> PersistState {
    let mut state = match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<PersistState>(&raw).unwrap_or_default(),
        Err(_) => PersistState::default(),
    };
    let completed = state
        .downloads
        .iter()
        .filter(|dl| dl.status == "completed")
        .count() as u64;
    let bytes: u64 = state
        .downloads
        .iter()
        .filter(|dl| dl.status == "completed")
        .map(|dl| dl.size.unwrap_or(0))
        .sum();
    let mut stats = state.stats.take().unwrap_or_default();
    ensure_lifetime(&mut stats, completed, bytes);
    state.stats = Some(stats);
    state
}

pub fn save(path: &Path, state: &PersistState) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(state)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

pub fn ensure_lifetime(stats: &mut Lifetime, completed: u64, bytes: u64) {
    if stats.completed == 0 && completed > 0 {
        stats.completed = completed;
    }
    if stats.bytes == 0 && bytes > 0 {
        stats.bytes = bytes;
    }
    if stats.since == 0 {
        stats.since = now_ms();
    }
}
