'use strict';

const PORTS = Array.from({ length: 10 }, (_, index) => 4477 + index);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'wmv', 'flv', 'mpeg', 'mpg', '3gp']);
const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'flac', 'ogg', 'wav', 'opus', 'wma']);
const SUBTITLE_EXT = new Set(['vtt', 'srt', 'ass', 'ssa', 'ttml', 'dfxp', 'sbv']);
const SEGMENT_EXT = new Set(['ts', 'm4s', 'cmfv', 'cmfa', 'cmft']);
const mediaByTab = new Map();
const pageByTab = new Map();
const mediaQueues = new Map();

function queueMediaTask(tabId, task) {
  const previous = mediaQueues.get(tabId) || Promise.resolve();
  const current = previous.then(task, task);
  const tail = current.catch(() => {});
  mediaQueues.set(tabId, tail);
  tail.then(() => {
    if (mediaQueues.get(tabId) === tail) mediaQueues.delete(tabId);
  });
  return current;
}

function storageKey(tabId) {
  return `media:${tabId}`;
}

function nameFromUrl(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return name || new URL(url).hostname;
  } catch {
    return url;
  }
}

function qualityOf(url) {
  const match = /(2160p|1440p|1080p|720p|480p|360p|240p)|\b(4k|uhd|hdr)\b/i.exec(url);
  return match ? match[0] : null;
}

function classify(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const name = parsed.pathname.split('/').filter(Boolean).pop() || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'm3u8') return { kind: 'hls', media: 'video', label: 'HLS stream' };
  if (ext === 'mpd') return { kind: 'dash', media: 'video', label: 'DASH stream' };
  if (SEGMENT_EXT.has(ext)) return null;
  if (VIDEO_EXT.has(ext)) return { kind: 'file', media: 'video', label: 'Video file' };
  if (AUDIO_EXT.has(ext)) return { kind: 'file', media: 'audio', label: 'Audio file' };
  if (SUBTITLE_EXT.has(ext)) return { kind: 'file', media: 'subtitle', label: 'Subtitles' };
  return null;
}

function isSegmentUrl(url) {
  try {
    const name = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    return SEGMENT_EXT.has(ext);
  } catch {
    return false;
  }
}

function isProtectedVideoUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube-nocookie.com') ||
      host === 'googlevideo.com' ||
      host.endsWith('.googlevideo.com')
    );
  } catch {
    return false;
  }
}

function contentRangeTotal(value) {
  const match = /\/\s*(\d+)\s*$/.exec(String(value || ''));
  return match ? Number(match[1]) : NaN;
}

function classifyContentType(contentType, url) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!type) return null;
  if (type === 'application/vnd.apple.mpegurl' || type === 'application/x-mpegurl' || type === 'audio/mpegurl' || type === 'audio/x-mpegurl') {
    return { kind: 'hls', media: 'video', label: 'HLS stream' };
  }
  if (type === 'application/dash+xml' || type === 'video/vnd.mpeg.dash.mpd') {
    return { kind: 'dash', media: 'video', label: 'DASH stream' };
  }
  if (type === 'video/mp2t' || type === 'video/iso.segment') return null;
  if (type === 'text/vtt' || type === 'application/x-subrip' || type === 'text/ttml' || type === 'application/ttml+xml') {
    return { kind: 'file', media: 'subtitle', label: 'Subtitles' };
  }
  if (type.startsWith('video/')) return { kind: 'file', media: 'video', label: 'Video file' };
  if (type.startsWith('audio/') || type === 'application/ogg') {
    if (/\.(ts|m4s)(?:[?#]|$)/i.test(url)) return null;
    return { kind: 'file', media: 'audio', label: 'Audio file' };
  }
  return null;
}

function classifyFilename(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  if (VIDEO_EXT.has(ext)) return { kind: 'file', media: 'video', label: 'Video file' };
  if (AUDIO_EXT.has(ext)) return { kind: 'file', media: 'audio', label: 'Audio file' };
  if (SUBTITLE_EXT.has(ext)) return { kind: 'file', media: 'subtitle', label: 'Subtitles' };
  return null;
}

function infoFromKind(kind) {
  switch (kind) {
    case 'hls': return { kind: 'hls', media: 'video', label: 'HLS stream' };
    case 'dash': return { kind: 'dash', media: 'video', label: 'DASH stream' };
    case 'video': return { kind: 'file', media: 'video', label: 'Video file' };
    case 'audio': return { kind: 'file', media: 'audio', label: 'Audio file' };
    case 'subtitle': return { kind: 'file', media: 'subtitle', label: 'Subtitles' };
    default: return null;
  }
}

function dispositionName(value) {
  if (!value) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(value);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename=("([^"]+)"|([^;]+))/i.exec(value);
  if (plain) return (plain[2] || plain[3] || '').trim() || null;
  return null;
}

function headerValue(headers, name) {
  const lower = name.toLowerCase();
  const found = (headers || []).find((entry) => String(entry.name).toLowerCase() === lower);
  return found ? found.value || '' : '';
}

function headerInt(headers, name) {
  const value = Number.parseInt(headerValue(headers, name), 10);
  return Number.isFinite(value) ? value : null;
}

function buildItem(url, info, filename) {
  const name = filename || nameFromUrl(url);
  return {
    url,
    name,
    kind: info.kind,
    media: info.media,
    supported: info.supported !== false,
    label: info.label,
    quality: qualityOf(url)
  };
}

async function loadMedia(tabId) {
  if (mediaByTab.has(tabId)) return mediaByTab.get(tabId);
  const key = storageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const list = (Array.isArray(stored[key]) ? stored[key] : []).filter(
    (entry) => !isProtectedVideoUrl(entry.url)
  );
  mediaByTab.set(tabId, list);
  return list;
}

async function persist(tabId) {
  const list = mediaByTab.get(tabId) || [];
  await chrome.storage.session.set({ [storageKey(tabId)]: list });
  await updateBadge(tabId);
}

async function updateBadge(tabId) {
  const list = mediaByTab.get(tabId) || [];
  const total = list.filter((entry) => entry.media !== 'subtitle').length;
  try {
    await chrome.action.setBadgeText({ tabId, text: total ? String(Math.min(total, 99)) : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2f3740' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#e9ecef' });
  } catch {
    /* tab may be gone */
  }
}

function notifyContent(tabId, message) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  try {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  } catch {
    /* tab without a content script */
  }
}

async function addMedia(tabId, item) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  if (isProtectedVideoUrl(item.url)) return;
  return queueMediaTask(tabId, async () => {
    const list = await loadMedia(tabId);
    if (list.some((entry) => entry.url === item.url)) return;
    if (item.kind === 'hls' || item.kind === 'dash') list.unshift(item);
    else list.push(item);
    if (list.length > 24) list.length = 24;
    await persist(tabId);
    notifyContent(tabId, { type: 'media:found', count: list.length });
  });
}

async function clearMedia(tabId) {
  mediaByTab.delete(tabId);
  try {
    await chrome.storage.session.remove(storageKey(tabId));
    await chrome.action.setBadgeText({ tabId, text: '' });
  } catch {
    /* ignore */
  }
  notifyContent(tabId, { type: 'media:clear' });
}

async function flashBadge(tabId, text) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: text === '!' ? '#3a3434' : '#2f3740' });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => updateBadge(tabId), 2200);
  } catch {
    /* ignore */
  }
}

function handleRequest(details) {
  if (details.tabId < 0) return;
  if (details.type === 'main_frame') pageByTab.set(details.tabId, details.url);
  else if (details.documentUrl && !pageByTab.has(details.tabId)) pageByTab.set(details.tabId, details.documentUrl);
}

function handleHeaders(details) {
  if (details.tabId < 0) return;
  if (details.method && details.method !== 'GET') return;
  if (details.statusCode !== undefined && details.statusCode !== 200 && details.statusCode !== 206) return;
  if (isProtectedVideoUrl(details.url)) return;

  const contentType = headerValue(details.responseHeaders, 'content-type');
  const contentRange = headerValue(details.responseHeaders, 'content-range');
  const partial = Boolean(contentRange) || details.statusCode === 206;
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();

  if (partial) {
    if (details.type !== 'media') return;
    if (!type.startsWith('video/') && !type.startsWith('audio/')) return;
    if (isSegmentUrl(details.url)) return;
    const total = contentRangeTotal(contentRange);
    if (!Number.isFinite(total) || total < 1048576) return;
  }

  const filename = dispositionName(headerValue(details.responseHeaders, 'content-disposition'));
  let byName = classify(details.url) || classifyFilename(filename);
  const pageType = type === 'text/html' || type === 'application/xhtml+xml' || type === 'application/json' || type === 'text/plain';
  if (byName && byName.kind === 'file' && pageType) byName = null;
  let info = byName;
  if (!info) {
    const byType = classifyContentType(contentType, details.url);
    if (byType) {
      const manifest = byType.kind === 'hls' || byType.kind === 'dash';
      const sidecar = byType.media === 'subtitle';
      if (manifest || sidecar || details.type === 'media') {
        info = byType;
      }
    }
  }
  if (!info && details.type === 'media' && (!type || type === 'application/octet-stream' || type === 'binary/octet-stream')) {
    const length = headerInt(details.responseHeaders, 'content-length');
    if (length === null || length >= 1048576) {
      info = { kind: 'file', media: 'video', label: 'Video stream' };
    }
  }
  if (!info) return;
  addMedia(details.tabId, buildItem(details.url, info, filename)).catch(() => {});
}

const REQUEST_TYPES = ['media', 'xmlhttprequest', 'other', 'object', 'main_frame', 'sub_frame'];

chrome.webRequest.onBeforeRequest.addListener(handleRequest, {
  urls: ['<all_urls>'],
  types: REQUEST_TYPES
});

chrome.webRequest.onHeadersReceived.addListener(handleHeaders, {
  urls: ['<all_urls>'],
  types: REQUEST_TYPES
}, ['responseHeaders']);

const PAGEHOOK_ID = 'arus-pagehook';

function pagehookScript() {
  return {
    id: PAGEHOOK_ID,
    js: ['pagehook.js'],
    matches: ['http://*/*', 'https://*/*'],
    excludeMatches: ['http://127.0.0.1/*', 'http://localhost/*'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
    persistAcrossSessions: true
  };
}

async function ensurePagehook() {
  if (!chrome.scripting?.registerContentScripts) return;
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [PAGEHOOK_ID] });
    if (existing && existing.length) return;
    await chrome.scripting.registerContentScripts([pagehookScript()]);
  } catch {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [PAGEHOOK_ID] });
    } catch {
      /* not registered */
    }
    try {
      await chrome.scripting.registerContentScripts([pagehookScript()]);
    } catch {
      /* host access may be withheld */
    }
  }
}

ensurePagehook();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearMedia(tabId);
    if (changeInfo.url) pageByTab.set(tabId, changeInfo.url);
  } else if (changeInfo.url) {
    pageByTab.set(tabId, changeInfo.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  mediaByTab.delete(tabId);
  pageByTab.delete(tabId);
  chrome.storage.session.remove(storageKey(tabId)).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  ensurePagehook();
  findServer().catch(() => {});
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'arus-download',
      title: 'Download with Arus',
      contexts: ['link', 'video', 'audio']
    });
  });
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    findServer().catch(() => {});
  });
}

async function probe(base, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/meta`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.name === 'Arus' ? base : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findServer() {
  const stored = await chrome.storage.local.get('serverBase');
  if (stored.serverBase && (await probe(stored.serverBase))) return stored.serverBase;
  for (let round = 0; round < 2; round += 1) {
    const timeout = round === 0 ? 1500 : 3000;
    const results = await Promise.all(PORTS.map((port) => probe(`http://127.0.0.1:${port}`, timeout)));
    const base = results.find(Boolean) || null;
    if (base) {
      await chrome.storage.local.set({ serverBase: base });
      return base;
    }
  }
  return null;
}

function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

async function getPrefs() {
  const stored = await chrome.storage.local.get({ takeover: true, overlay: true });
  return { takeover: stored.takeover !== false, overlay: stored.overlay !== false };
}

function basename(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const name = text.split(/[\\/]/).pop();
  return name && name !== '.' ? name : null;
}

const recentTakeovers = new Map();

function downloadFilename(item) {
  const direct = basename(item.filename);
  if (direct) return direct;
  try {
    return basename(decodeURIComponent(new URL(item.finalUrl || item.url).pathname.split('/').pop() || ''));
  } catch {
    return null;
  }
}

async function takeOverDownload(item) {
  if (!item || item.byExtensionId) return;
  if (item.state && item.state !== 'in_progress') return;
  const url = item.finalUrl || item.url || '';
  if (!/^https?:/i.test(url)) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (isLoopbackHost(parsed.hostname)) return;
  if (isProtectedVideoUrl(url)) return;
  const { takeover } = await getPrefs();
  if (!takeover) return;

  const now = Date.now();
  for (const [recent, at] of recentTakeovers) {
    if (now - at > 8000) recentTakeovers.delete(recent);
  }
  if (recentTakeovers.has(url)) return;
  recentTakeovers.set(url, now);

  const base = await findServer();
  if (!base) return;
  if (url.startsWith(base)) return;

  let paused = false;
  try {
    await chrome.downloads.pause(item.id);
    paused = true;
  } catch {
    /* some downloads cannot be paused; capture first anyway */
  }

  const filename = downloadFilename(item);
  try {
    await captureUrl({
      url,
      pageUrl: item.referrer || null,
      filename: filename || undefined,
      kind:
        classify(url)?.kind ||
        classifyContentType(item.mime, url)?.kind ||
        classifyFilename(filename)?.kind,
      tabId: item.tabId
    });
    try {
      await chrome.downloads.cancel(item.id);
      await chrome.downloads.erase({ id: item.id });
    } catch {
      /* already gone */
    }
  } catch {
    if (paused) {
      try {
        await chrome.downloads.resume(item.id);
      } catch {
        /* the browser may have cancelled it */
      }
    }
  }
}

if (chrome.downloads?.onCreated) {
  chrome.downloads.onCreated.addListener((item) => {
    takeOverDownload(item).catch(() => {});
  });
}

async function grabMediaFromTab(tab) {
  if (!tab?.id) return;
  let picked = null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'grab:media' });
    if (response && /^https?:/i.test(response.url || '')) picked = response;
  } catch {
    /* tab without a content script */
  }
  if (!picked) {
    const list = await loadMedia(tab.id);
    picked =
      list.find((entry) => entry.kind === 'hls') ||
      list.find((entry) => entry.kind === 'dash') ||
      list.find((entry) => entry.kind === 'file' && entry.media !== 'subtitle') ||
      null;
  }
  if (!picked) {
    flashBadge(tab.id, '!');
    return;
  }
  try {
    await captureUrl({ url: picked.url, pageUrl: tab.url || null, tabId: tab.id, kind: picked.kind });
  } catch {
    flashBadge(tab.id, '!');
  }
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'grab-media') return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      grabMediaFromTab(tabs?.[0]).catch(() => {});
    });
  });
}

async function cookieHeader(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') || null;
  } catch {
    return null;
  }
}

async function captureUrl({ url, pageUrl, tabId, filename, kind }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('That is not a valid link.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https links are supported.');
  }
  if (isProtectedVideoUrl(url)) {
    throw new Error('YouTube video streams are protected and cannot be downloaded by Arus. Send a direct video, HLS, or DASH link instead.');
  }

  const base = await findServer();
  if (!base) throw new Error('Arus is not running. Start the app, then try again.');

  const cookie = await cookieHeader(url);
  const payload = {
    url,
    filename: filename || undefined,
    kind: kind === 'hls' ? 'hls' : kind === 'dash' ? 'dash' : undefined,
    pageUrl: pageUrl || undefined,
    referer: pageUrl || undefined,
    origin: pageUrl ? (() => { try { return new URL(pageUrl).origin; } catch { return undefined; } })() : undefined,
    cookie: cookie || undefined,
    userAgent: navigator.userAgent
  };

  const res = await fetch(`${base}/api/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error || `Arus rejected the request (${res.status}).`);
  await flashBadge(tabId, '✓');
  return { ok: true, download: data, base };
}

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'arus-download') return;
    const target = info.linkUrl || info.srcUrl;
    if (!target) return;
    const pageUrl = tab?.url || info.pageUrl || null;
    try {
      await captureUrl({
        url: target,
        pageUrl,
        tabId: tab?.id,
        kind: classify(target)?.kind
      });
    } catch {
      flashBadge(tab?.id, '!');
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== 'string') return { error: 'Unknown message' };
    if (message.type === 'media:list') {
      const list = await loadMedia(Number(message.tabId));
      return { items: list, pageUrl: pageByTab.get(Number(message.tabId)) || null };
    }
    if (message.type === 'media:count') {
      const tabId = sender.tab?.id;
      const list = Number.isInteger(tabId) ? await loadMedia(tabId) : [];
      return { count: list.filter((entry) => entry.media !== 'subtitle').length };
    }
    if (message.type === 'media:track') {
      const tabId = sender.tab?.id;
      const url = typeof message.url === 'string' ? message.url : '';
      if (Number.isInteger(tabId) && /^https?:/i.test(url)) {
        await addMedia(tabId, buildItem(url, { kind: 'file', media: 'subtitle', label: 'Subtitles' }));
        return { ok: true };
      }
      return { ok: false };
    }
    if (message.type === 'media:add') {
      const tabId = sender.tab?.id;
      const url = typeof message.url === 'string' ? message.url : '';
      if (!Number.isInteger(tabId) || !/^https?:/i.test(url)) return { ok: false };
      const info = infoFromKind(message.kind) || classify(url);
      if (!info) return { ok: false };
      await addMedia(tabId, buildItem(url, info));
      return { ok: true };
    }
    if (message.type === 'server:status') {
      return { base: await findServer() };
    }
    if (message.type === 'download:status') {
      const id = typeof message.id === 'string' ? message.id : '';
      const requested = typeof message.base === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(message.base)
        ? message.base
        : await findServer();
      if (!id || !requested) return { error: 'Download status is unavailable.' };
      try {
        const res = await fetch(`${requested}/api/downloads/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!res.ok) return { error: `Arus is not responding (${res.status}).` };
        const dl = await res.json();
        const total = Number(dl.size) || 0;
        const received = Number(dl.received) || 0;
        const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
        return { status: dl.status, percent, failure: dl.error || null };
      } catch {
        return { error: 'Arus is not responding.' };
      }
    }
    if (message.type === 'capture:video') {
      const tabId = sender.tab?.id;
      const pageUrl = message.pageUrl || sender.tab?.url || null;
      const url = typeof message.url === 'string' ? message.url : '';
      if (/^https?:/i.test(url)) {
        return captureUrl({
          url,
          pageUrl,
          tabId,
          kind: classify(url)?.kind
        });
      }
      const list = Number.isInteger(tabId) ? await loadMedia(tabId) : [];
      const best =
        list.find((entry) => entry.kind === 'hls') ||
        list.find((entry) => entry.kind === 'dash') ||
        list.find((entry) => entry.kind === 'file' && entry.media !== 'subtitle') ||
        list[0];
      if (best) {
        return captureUrl({ url: best.url, pageUrl, tabId, kind: best.kind });
      }
      const base = await findServer();
      if (!base) throw new Error('Arus is not running. Start the app, then try again.');
      await chrome.tabs.create({
        url: pageUrl ? `${base}/?scan=${encodeURIComponent(pageUrl)}` : base
      });
      return { ok: true, opened: true };
    }
    if (message.type === 'capture') {
      return captureUrl({
        url: message.url,
        pageUrl: message.pageUrl,
        tabId: message.tabId,
        filename: message.filename,
        kind: message.kind
      });
    }
    if (message.type === 'open:app') {
      const base = await findServer();
      if (!base) throw new Error('Arus is not running. Start the app, then try again.');
      const target = message.pageUrl ? `${base}/?scan=${encodeURIComponent(message.pageUrl)}` : base;
      await chrome.tabs.create({ url: target });
      return { ok: true };
    }
    return { error: 'Unknown message' };
  })()
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err?.message || String(err) }));
  return true;
});
