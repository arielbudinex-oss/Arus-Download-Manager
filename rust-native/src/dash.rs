use crate::hls::resolve_url;
use crate::model::*;
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

const MAX_SEGMENTS: usize = 20000;

#[derive(Default, Clone)]
pub struct XmlNode {
    pub name: String,
    pub local: String,
    pub attrs: HashMap<String, String>,
    pub children: Vec<XmlNode>,
    pub text: String,
}

pub fn decode_xml(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(index) = rest.find('&') {
        out.push_str(&rest[..index]);
        let tail = &rest[index..];
        if let Some(end) = tail.find(';') {
            let entity = &tail[1..end];
            let replacement = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ => {
                    if let Some(hex) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
                        u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
                    } else if let Some(dec) = entity.strip_prefix('#') {
                        dec.parse::<u32>().ok().and_then(char::from_u32)
                    } else {
                        None
                    }
                }
            };
            if let Some(ch) = replacement {
                out.push(ch);
                rest = &tail[end + 1..];
                continue;
            }
        }
        out.push('&');
        rest = &tail[1..];
    }
    out.push_str(rest);
    out
}

fn local_name(name: &[u8]) -> String {
    let name = String::from_utf8_lossy(name).to_string();
    match name.rsplit(':').next() {
        Some(local) if !local.is_empty() => local.to_string(),
        _ => name,
    }
}

fn node_from_start(start: &BytesStart<'_>) -> XmlNode {
    let name = String::from_utf8_lossy(start.name().as_ref()).to_string();
    let local = local_name(start.name().as_ref());
    let mut attrs = HashMap::new();
    for attr in start.attributes().flatten() {
        let key = local_name(attr.key.as_ref());
        let raw = String::from_utf8_lossy(&attr.value).to_string();
        attrs.insert(key, decode_xml(&raw));
    }
    XmlNode {
        name,
        local,
        attrs,
        children: Vec::new(),
        text: String::new(),
    }
}

pub fn parse_xml(text: &str) -> XmlNode {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(false);
    let mut root = XmlNode {
        name: "#document".into(),
        local: "#document".into(),
        attrs: HashMap::new(),
        children: Vec::new(),
        text: String::new(),
    };
    let mut stack: Vec<XmlNode> = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) => {
                stack.push(node_from_start(&start));
            }
            Ok(Event::Empty(start)) => {
                let node = node_from_start(&start);
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(node);
                } else {
                    root.children.push(node);
                }
            }
            Ok(Event::End(_)) => {
                if let Some(node) = stack.pop() {
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(node);
                    } else {
                        root.children.push(node);
                    }
                }
            }
            Ok(Event::Text(event)) => {
                if let Some(parent) = stack.last_mut() {
                    let raw = String::from_utf8_lossy(event.as_ref());
                    parent.text.push_str(&decode_xml(&raw));
                }
            }
            Ok(Event::CData(event)) => {
                if let Some(parent) = stack.last_mut() {
                    parent
                        .text
                        .push_str(&String::from_utf8_lossy(event.as_ref()));
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    root
}

fn children_by<'a>(node: &'a XmlNode, name: &str) -> Vec<&'a XmlNode> {
    node.children
        .iter()
        .filter(|child| child.local == name)
        .collect()
}

fn first_child<'a>(node: &'a XmlNode, name: &str) -> Option<&'a XmlNode> {
    node.children.iter().find(|child| child.local == name)
}

fn text_of(node: &XmlNode) -> String {
    node.text.trim().to_string()
}

pub fn parse_iso_duration(value: &str) -> f64 {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"^P(?:([\d.]+)Y)?(?:([\d.]+)M)?(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$")
            .unwrap()
    });
    let Some(caps) = re.captures(value) else {
        return 0.0;
    };
    let get = |index: usize| -> f64 {
        caps.get(index)
            .and_then(|m| m.as_str().parse::<f64>().ok())
            .unwrap_or(0.0)
    };
    get(1) * 31536000.0
        + get(2) * 2592000.0
        + get(3) * 86400.0
        + get(4) * 3600.0
        + get(5) * 60.0
        + get(6)
}

fn positive_int(value: Option<&String>, fallback: u64) -> u64 {
    value
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(fallback)
}

fn range_from(value: Option<&String>) -> Option<ByteRange> {
    let value = value?;
    let (start, end) = value.trim().split_once('-')?;
    let start: u64 = start.parse().ok()?;
    let end: u64 = end.parse().ok()?;
    if end < start {
        return None;
    }
    Some(ByteRange {
        offset: start,
        length: end - start + 1,
    })
}

fn has_protection(node: &XmlNode) -> bool {
    !children_by(node, "ContentProtection").is_empty()
}

fn apply_base(node: &XmlNode, base: &str) -> String {
    match first_child(node, "BaseURL") {
        Some(element) => {
            let value = text_of(element);
            if value.is_empty() {
                base.to_string()
            } else {
                resolve_url(&value, base)
            }
        }
        None => base.to_string(),
    }
}

fn fill_template(template: &str, values: &HashMap<&str, String>) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"\$(RepresentationID|Bandwidth|Number|Time|ID)(?:%0?(\d+)d)?\$").unwrap()
    });
    let filled = re
        .replace_all(template, |caps: &regex::Captures| {
            let key = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let Some(value) = values.get(key) else {
                return caps[0].to_string();
            };
            if let Some(width) = caps.get(2).and_then(|m| m.as_str().parse::<usize>().ok()) {
                format!("{value:0>width$}")
            } else {
                value.clone()
            }
        })
        .to_string();
    filled.replace("$$", "$")
}

fn collect<'a>(nodes: &[&'a XmlNode], name: &str) -> Vec<&'a XmlNode> {
    let mut out = Vec::new();
    for node in nodes {
        out.extend(children_by(node, name));
    }
    out
}

struct TemplateInfo<'a> {
    attrs: HashMap<String, String>,
    timeline: Option<&'a XmlNode>,
}

fn template_info<'a>(nodes: &[&'a XmlNode]) -> Option<TemplateInfo<'a>> {
    let templates = collect(nodes, "SegmentTemplate");
    if templates.is_empty() {
        return None;
    }
    let mut attrs = HashMap::new();
    let mut timeline = None;
    for template in templates {
        attrs.extend(template.attrs.clone());
        if let Some(candidate) = first_child(template, "SegmentTimeline") {
            timeline = Some(candidate);
        }
    }
    Some(TemplateInfo { attrs, timeline })
}

struct TimelineEntry {
    time: u64,
    duration: f64,
}

fn timeline_entries(
    timeline: &XmlNode,
    timescale: u64,
    period_duration: f64,
) -> Result<Vec<TimelineEntry>, String> {
    let mut entries = Vec::new();
    let mut cursor = 0u64;
    for point in children_by(timeline, "S") {
        let duration: u64 = match point.attrs.get("d").and_then(|v| v.parse().ok()) {
            Some(value) if value > 0 => value,
            _ => continue,
        };
        let mut time = point
            .attrs
            .get("t")
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(cursor);
        let mut repeat = point
            .attrs
            .get("r")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        if repeat < 0 {
            repeat = if period_duration > 0.0 {
                let span = period_duration * timescale as f64 - time as f64;
                ((span / duration as f64).ceil() as i64 - 1).max(0)
            } else {
                0
            };
        }
        for _ in 0..=repeat {
            entries.push(TimelineEntry {
                time,
                duration: duration as f64 / timescale as f64,
            });
            time += duration;
            if entries.len() > MAX_SEGMENTS {
                return Err("DASH manifest has too many segments".into());
            }
        }
        cursor = time;
    }
    Ok(entries)
}

struct BuiltTrack {
    init: Option<Resource>,
    segments: Vec<DashSegment>,
    single: bool,
}

fn template_track(
    template: &TemplateInfo,
    rep_id: &str,
    rep_bandwidth: u64,
    rep_base: &str,
    period_duration: f64,
) -> Result<Option<BuiltTrack>, String> {
    let attrs = &template.attrs;
    let Some(media) = attrs.get("media") else {
        return Ok(None);
    };
    let timescale = positive_int(attrs.get("timescale"), 1);
    let start_number = attrs
        .get("startNumber")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(1);
    let duration_units = attrs
        .get("duration")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let mut entries: Vec<TimelineEntry> = Vec::new();

    if let Some(timeline) = template.timeline {
        entries = timeline_entries(timeline, timescale, period_duration)?;
    } else if duration_units > 0 {
        let mut count = 0u64;
        if period_duration > 0.0 {
            count = ((period_duration * timescale as f64) / duration_units as f64 - 1e-7)
                .ceil()
                .max(0.0) as u64;
        } else if let Some(end) = attrs.get("endNumber").and_then(|v| v.parse::<i64>().ok()) {
            if end >= start_number {
                count = (end - start_number + 1) as u64;
            }
        }
        count = count.min(MAX_SEGMENTS as u64);
        for index in 0..count {
            entries.push(TimelineEntry {
                time: index * duration_units,
                duration: duration_units as f64 / timescale as f64,
            });
        }
    }
    if entries.is_empty() {
        return Ok(None);
    }

    let first_time = entries[0].time;
    let mut values: HashMap<&str, String> = HashMap::new();
    values.insert("RepresentationID", rep_id.to_string());
    values.insert("ID", rep_id.to_string());
    values.insert("Bandwidth", rep_bandwidth.to_string());
    values.insert("Number", start_number.to_string());
    values.insert("Time", first_time.to_string());

    let init = attrs.get("initialization").map(|template| Resource {
        url: resolve_url(&fill_template(template, &values), rep_base),
        range: None,
    });
    let mut segments = Vec::new();
    for (index, entry) in entries.iter().enumerate() {
        values.insert("Number", (start_number + index as i64).to_string());
        values.insert("Time", entry.time.to_string());
        segments.push(DashSegment {
            url: resolve_url(&fill_template(media, &values), rep_base),
            range: None,
            duration: entry.duration,
        });
    }
    Ok(Some(BuiltTrack {
        init,
        segments,
        single: false,
    }))
}

fn segment_list_track(nodes: &[&XmlNode], rep_base: &str) -> Result<Option<BuiltTrack>, String> {
    let lists = collect(nodes, "SegmentList");
    if lists.is_empty() {
        return Ok(None);
    }
    let mut attrs = HashMap::new();
    for list in &lists {
        attrs.extend(list.attrs.clone());
    }
    let mut init = None;
    for list in &lists {
        if let Some(element) = first_child(list, "Initialization") {
            if let Some(source) = element.attrs.get("sourceURL") {
                init = Some(Resource {
                    url: resolve_url(source, rep_base),
                    range: range_from(element.attrs.get("range")),
                });
            }
        }
    }
    let last = lists.last().unwrap();
    let urls = children_by(last, "SegmentURL");
    if urls.is_empty() {
        return Ok(None);
    }
    let timescale = positive_int(attrs.get("timescale"), 1);
    let fallback_duration = if let Some(duration) = attrs.get("duration") {
        duration.parse::<f64>().ok().map(|d| d / timescale as f64).unwrap_or(0.0)
    } else {
        0.0
    };
    let mut timeline = None;
    for list in &lists {
        if let Some(candidate) = first_child(list, "SegmentTimeline") {
            timeline = Some(candidate);
        }
    }
    let durations = match timeline {
        Some(timeline) => timeline_entries(timeline, timescale, 0.0)?,
        None => Vec::new(),
    };
    let mut segments = Vec::new();
    for (index, item) in urls.iter().enumerate() {
        let Some(media) = item.attrs.get("media") else {
            continue;
        };
        segments.push(DashSegment {
            url: resolve_url(media, rep_base),
            range: range_from(item.attrs.get("mediaRange")),
            duration: durations
                .get(index)
                .map(|entry| entry.duration)
                .unwrap_or(fallback_duration),
        });
    }
    if segments.is_empty() {
        return Ok(None);
    }
    Ok(Some(BuiltTrack {
        init,
        segments,
        single: false,
    }))
}

fn segment_base_track(rep: &XmlNode, rep_base: &str) -> Option<BuiltTrack> {
    first_child(rep, "BaseURL")?;
    let parsed = url::Url::parse(rep_base).ok()?;
    if parsed.path().ends_with('/') {
        return None;
    }
    Some(BuiltTrack {
        init: None,
        segments: vec![DashSegment {
            url: rep_base.to_string(),
            range: None,
            duration: 0.0,
        }],
        single: true,
    })
}

fn media_type(rep: &XmlNode, adaptation: &XmlNode) -> Option<String> {
    let mime = rep
        .attrs
        .get("mimeType")
        .or_else(|| adaptation.attrs.get("mimeType"))
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    if mime.starts_with("video/") {
        return Some("video".into());
    }
    if mime.starts_with("audio/") {
        return Some("audio".into());
    }
    let content_type = rep
        .attrs
        .get("contentType")
        .or_else(|| adaptation.attrs.get("contentType"))
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    if content_type == "video" || content_type == "audio" {
        return Some(content_type);
    }
    let codecs = rep
        .attrs
        .get("codecs")
        .or_else(|| adaptation.attrs.get("codecs"))
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    if ["avc", "hev", "hvc", "av01", "vp08", "vp09", "vp8", "vp9", "dvh"]
        .iter()
        .any(|prefix| codecs.starts_with(prefix))
    {
        return Some("video".into());
    }
    if ["mp4a", "ac-3", "ec-3", "opus", "vorbis", "flac", "dts"]
        .iter()
        .any(|prefix| codecs.starts_with(prefix))
    {
        return Some("audio".into());
    }
    None
}

fn best_track(tracks: &[DashTrack]) -> Option<DashTrack> {
    tracks
        .iter()
        .max_by(|a, b| {
            a.bandwidth.cmp(&b.bandwidth).then_with(|| {
                let area_a = a.width.unwrap_or(0) * a.height.unwrap_or(0);
                let area_b = b.width.unwrap_or(0) * b.height.unwrap_or(0);
                area_a.cmp(&area_b)
            })
        })
        .cloned()
}

struct BuiltInfo {
    kind: Option<String>,
    track: Option<DashTrack>,
}

fn build_track(
    rep: &XmlNode,
    adaptation: &XmlNode,
    period: &XmlNode,
    period_base: &str,
    period_duration: f64,
    inherited_drm: bool,
) -> Result<BuiltInfo, String> {
    let Some(kind) = media_type(rep, adaptation) else {
        return Ok(BuiltInfo {
            kind: None,
            track: None,
        });
    };
    let rep_base = apply_base(rep, &apply_base(adaptation, period_base));
    let nodes = [period, adaptation, rep];
    let node_refs: Vec<&XmlNode> = nodes.iter().copied().collect();
    let id = rep
        .attrs
        .get("id")
        .cloned()
        .unwrap_or_else(|| format!("{kind}-{}", rep.attrs.get("bandwidth").cloned().unwrap_or_else(|| "source".into())));
    let bandwidth = rep
        .attrs
        .get("bandwidth")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let drm = inherited_drm || has_protection(adaptation) || has_protection(rep);

    let mut built = None;
    if let Some(template) = template_info(&node_refs) {
        built = template_track(&template, &id, bandwidth, &rep_base, period_duration)?;
    }
    if built.is_none() {
        built = segment_list_track(&node_refs, &rep_base)?;
    }
    if built.is_none() {
        built = segment_base_track(rep, &rep_base);
    }
    let Some(built) = built else {
        return Ok(BuiltInfo {
            kind: Some(kind),
            track: None,
        });
    };

    let width = rep
        .attrs
        .get("width")
        .and_then(|v| v.parse::<u64>().ok())
        .or_else(|| adaptation.attrs.get("width").and_then(|v| v.parse().ok()));
    let height = rep
        .attrs
        .get("height")
        .and_then(|v| v.parse::<u64>().ok())
        .or_else(|| adaptation.attrs.get("height").and_then(|v| v.parse().ok()));
    let duration: f64 = built.segments.iter().map(|s| s.duration).sum();
    let resolution = match (width, height) {
        (Some(w), Some(h)) => Some(format!("{w}x{h}")),
        _ => None,
    };
    let track = DashTrack {
        id,
        kind: kind.clone(),
        bandwidth,
        codecs: rep
            .attrs
            .get("codecs")
            .or_else(|| adaptation.attrs.get("codecs"))
            .cloned(),
        lang: adaptation.attrs.get("lang").cloned(),
        width,
        height,
        resolution,
        init: built.init,
        segments: built.segments,
        single: built.single,
        duration,
        drm,
    };
    Ok(BuiltInfo {
        kind: Some(kind),
        track: Some(track),
    })
}

pub struct ParsedDash {
    pub duration: f64,
    pub output_ext: String,
    pub needs_mux: bool,
    pub video: Option<DashTrack>,
    pub audio: Option<DashTrack>,
    pub variants: Vec<DashVariant>,
}

pub fn parse_dash_manifest(text: &str, manifest_url: &str) -> Result<ParsedDash, String> {
    let document = parse_xml(text);
    let root = document
        .children
        .iter()
        .find(|child| child.local == "MPD")
        .ok_or("DASH manifest is missing the MPD element")?;
    if root
        .attrs
        .get("type")
        .map(|v| v.eq_ignore_ascii_case("dynamic"))
        .unwrap_or(false)
    {
        return Err("Live DASH streams are not supported".into());
    }
    let periods = children_by(root, "Period");
    if periods.is_empty() {
        return Err("DASH manifest has no periods".into());
    }
    let playable: Vec<&XmlNode> = periods
        .iter()
        .filter(|period| !children_by(period, "AdaptationSet").is_empty())
        .copied()
        .collect();
    if playable.len() > 1 {
        return Err("Multi-period DASH manifests are not supported".into());
    }
    let period = playable.first().copied().unwrap_or(periods[0]);

    let total_duration = parse_iso_duration(
        root.attrs
            .get("mediaPresentationDuration")
            .map(|v| v.as_str())
            .unwrap_or(""),
    );
    let period_start = parse_iso_duration(
        period
            .attrs
            .get("start")
            .map(|v| v.as_str())
            .unwrap_or(""),
    );
    let period_duration = {
        let direct = parse_iso_duration(
            period
                .attrs
                .get("duration")
                .map(|v| v.as_str())
                .unwrap_or(""),
        );
        if direct > 0.0 {
            direct
        } else if total_duration > 0.0 {
            (total_duration - period_start).max(0.0)
        } else {
            0.0
        }
    };

    let mpd_base = apply_base(root, manifest_url);
    let period_base = apply_base(period, &mpd_base);
    let inherited_drm = has_protection(root) || has_protection(period);

    let mut videos = Vec::new();
    let mut audios = Vec::new();
    let mut saw_video = false;
    let mut saw_audio = false;
    let mut video_drm = false;
    let mut audio_drm = false;
    let mut parse_failure: Option<String> = None;

    for adaptation in children_by(period, "AdaptationSet") {
        for rep in children_by(adaptation, "Representation") {
            let result = build_track(
                rep,
                adaptation,
                period,
                &period_base,
                period_duration,
                inherited_drm,
            );
            let result = match result {
                Ok(result) => result,
                Err(err) => {
                    parse_failure = Some(err);
                    continue;
                }
            };
            let Some(kind) = result.kind.clone() else {
                continue;
            };
            if kind == "video" {
                saw_video = true;
                if result.track.as_ref().map(|t| t.drm).unwrap_or(false)
                    || inherited_drm
                    || has_protection(adaptation)
                {
                    video_drm = true;
                }
                if let Some(track) = result.track {
                    videos.push(track);
                }
            } else {
                saw_audio = true;
                if result.track.as_ref().map(|t| t.drm).unwrap_or(false)
                    || inherited_drm
                    || has_protection(adaptation)
                {
                    audio_drm = true;
                }
                if let Some(track) = result.track {
                    audios.push(track);
                }
            }
        }
    }

    let clear_videos: Vec<DashTrack> = videos.into_iter().filter(|t| !t.drm).collect();
    let clear_audios: Vec<DashTrack> = audios.into_iter().filter(|t| !t.drm).collect();
    let video = best_track(&clear_videos);
    let audio = best_track(&clear_audios);

    if saw_video && video.is_none() {
        if video_drm {
            return Err("DRM-protected DASH streams are not supported".into());
        }
        return Err(match parse_failure {
            Some(message) => format!("DASH video track could not be parsed: {message}"),
            None => "DASH video track could not be parsed".into(),
        });
    }
    if saw_audio && audio.is_none() {
        if audio_drm {
            return Err("DRM-protected DASH streams are not supported".into());
        }
        return Err(match parse_failure {
            Some(message) => format!("DASH audio track could not be parsed: {message}"),
            None => "DASH audio track could not be parsed".into(),
        });
    }
    if video.is_none() && audio.is_none() {
        return Err("DASH manifest has no playable tracks".into());
    }

    let duration = if period_duration > 0.0 {
        period_duration
    } else {
        video
            .as_ref()
            .map(|t| t.duration)
            .or_else(|| audio.as_ref().map(|t| t.duration))
            .unwrap_or(0.0)
    };
    let mut variants: Vec<DashVariant> = clear_videos
        .iter()
        .map(|track| DashVariant {
            bandwidth: track.bandwidth,
            resolution: track.resolution.clone(),
            codecs: track.codecs.clone(),
            id: track.id.clone(),
        })
        .collect();
    variants.sort_by(|a, b| b.bandwidth.cmp(&a.bandwidth));
    variants.truncate(8);
    let output_ext = if video.is_some() { "mp4" } else { "m4a" }.to_string();
    let needs_mux = video.is_some() && audio.is_some();

    Ok(ParsedDash {
        duration,
        output_ext,
        needs_mux,
        video,
        audio,
        variants,
    })
}
