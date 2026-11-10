'use strict';

(() => {
  if (window.__arusOverlayInstalled) return;
  window.__arusOverlayInstalled = true;

  const MIN_WIDTH = 220;
  const MIN_HEIGHT = 120;
  const QUIET_AFTER = 6000;

  let overlayEnabled = true;
  let siteAllowed = true;
  let activeVideo = null;
  let hideTimer = null;
  let quietTimer = null;
  let autoHideTimer = null;
  let rafId = 0;
  let state = 'idle';
  let stateVideo = null;
  let watchTimer = null;
  let watchingId = null;
  let mediaCount = 0;
  let hovering = false;
  let panelHovering = false;
  let dismissed = false;
  let autoHiddenVideo = null;
  let lastUrl = location.href;
  const pointer = { x: -1, y: -1 };
  const reportedTracks = new Set();
  const reportedMedia = new Set();
  let lastTrackScan = 0;
  let lastMediaScan = 0;
  let lastCountSync = 0;
  let shadowMedia = [];
  const MEDIA_URL = /\.(m3u8|mpd|mp4|webm|mkv|mov|m4v|avi|wmv|flv|mpeg|mpg|3gp|mp3|m4a|aac|flac|ogg|wav|opus|wma|vtt|srt|ass|ssa|ttml|dfxp|sbv)(?:[?#]|$)/i;

  function kindFromUrl(url) {
    if (/\.m3u8(?:[?#]|$)/i.test(url)) return 'hls';
    if (/\.mpd(?:[?#]|$)/i.test(url)) return 'dash';
    if (/\.(vtt|srt|ass|ssa|ttml|dfxp|sbv)(?:[?#]|$)/i.test(url)) return 'subtitle';
    if (/\.(mp3|m4a|aac|flac|ogg|wav|opus|wma)(?:[?#]|$)/i.test(url)) return 'audio';
    if (/\.(mp4|webm|mkv|mov|m4v|avi|wmv|flv|mpeg|mpg|3gp)(?:[?#]|$)/i.test(url)) return 'video';
    return null;
  }

  function isProtectedHost(value) {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'youtu.be' || /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com)$/.test(host);
    } catch {
      return false;
    }
  }

  function reportMedia(url, kind) {
    if (!/^https?:/i.test(url) || isProtectedHost(url) || reportedMedia.has(url)) return;
    reportedMedia.add(url);
    try {
      chrome.runtime.sendMessage({ type: 'media:add', url, kind: kind || kindFromUrl(url) || null }, () => void chrome.runtime.lastError);
    } catch {
      /* extension context may be gone after a reload */
    }
  }

  function scanPageMedia() {
    if (Date.now() - lastMediaScan < 3000) return;
    lastMediaScan = Date.now();
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        const url = entry.name;
        if (!/^https?:/i.test(url) || !MEDIA_URL.test(url)) continue;
        reportMedia(url, kindFromUrl(url));
      }
    } catch {
      /* performance timeline may be restricted */
    }
    for (const media of document.querySelectorAll('video, audio')) {
      const sources = [media.currentSrc, media.src];
      for (const source of media.querySelectorAll('source')) sources.push(source.src);
      for (const source of sources) {
        if (source && /^https?:/i.test(source)) reportMedia(source, kindFromUrl(source));
      }
    }
    shadowMedia = scanShadowMedia();
    for (const media of shadowMedia) {
      const sources = [media.currentSrc, media.src];
      for (const source of media.querySelectorAll('source')) sources.push(source.src);
      for (const source of sources) {
        if (source && /^https?:/i.test(source)) reportMedia(source, kindFromUrl(source));
      }
    }
  }

  function scanShadowMedia() {
    const found = [];
    let budget = 4000;
    const walk = (root, depth) => {
      if (!root || depth > 3 || budget <= 0) return;
      let elements;
      try {
        elements = root.querySelectorAll('*');
      } catch {
        return;
      }
      for (const element of elements) {
        if (--budget <= 0) return;
        const shadow = element.shadowRoot;
        if (!shadow) continue;
        try {
          for (const media of shadow.querySelectorAll('video, audio')) found.push(media);
        } catch {
          /* closed or detached root */
        }
        walk(shadow, depth + 1);
      }
    };
    if (!document.querySelector('video, audio')) walk(document, 0);
    return found;
  }

  function syncMediaCount() {
    if (Date.now() - lastCountSync < 5000) return;
    lastCountSync = Date.now();
    try {
      chrome.runtime.sendMessage({ type: 'media:count' }, (response) => {
        if (chrome.runtime.lastError) return;
        const count = Number(response?.count) || 0;
        if (count !== mediaCount) {
          mediaCount = count;
          refresh();
        }
      });
    } catch {
      /* extension context may be gone */
    }
  }

  function pingPagehook() {
    for (const delay of [0, 150, 700, 1800]) {
      setTimeout(() => {
        try {
          window.postMessage({ source: 'arus-content', type: 'hello' }, '*');
        } catch {
          /* ignore */
        }
      }, delay);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'arus-pagehook' || data.type !== 'media') return;
    const url = typeof data.url === 'string' ? data.url : '';
    if (!url) return;
    reportMedia(url, typeof data.kind === 'string' ? data.kind : kindFromUrl(url));
  });

  pingPagehook();
  try {
    const mediaObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const url = entry.name;
        if (!/^https?:/i.test(url) || !MEDIA_URL.test(url)) continue;
        reportMedia(url, kindFromUrl(url));
      }
    });
    mediaObserver.observe({ type: 'resource', buffered: true });
  } catch {
    /* PerformanceObserver is optional */
  }
  setTimeout(scanPageMedia, 700);
  setTimeout(scanPageMedia, 2600);
  window.addEventListener('load', scanPageMedia, { once: true });
  document.addEventListener('loadedmetadata', scanPageMedia, true);

  const host = document.createElement('div');
  host.setAttribute('data-arus-overlay', '');
  host.style.cssText =
    'all: initial; position: fixed; z-index: 2147483647; display: none; pointer-events: none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        display: flex;
        align-items: stretch;
        border-radius: 11px;
        background: rgba(28, 28, 30, 0.86);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.16);
        backdrop-filter: blur(20px) saturate(160%);
        pointer-events: auto;
        overflow: hidden;
        transition: opacity 0.25s ease;
      }
      .panel.is-quiet { opacity: 0.5; }
      .panel:hover { opacity: 1; }
      .action {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 11px;
        border: 0;
        background: transparent;
        color: #f5f5f7;
        font: 500 11.5px/1 "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
        cursor: pointer;
        white-space: nowrap;
      }
      .action:hover { background: rgba(10, 132, 255, 0.24); color: #eaf3ff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14); }
      .action:active { filter: brightness(0.92); }
      .close {
        display: grid;
        place-items: center;
        width: 26px;
        border: 0;
        background: transparent;
        color: rgba(235, 235, 245, 0.55);
        font: 400 15px/1 "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
      }
      .close:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
      .panel[data-state="busy"] .action { opacity: 0.7; pointer-events: none; }
      .panel[data-state="done"] .action { opacity: 0.92; color: #30d158; }
      .panel[data-state="done"] .action:hover { background: #30d158; color: #04220c; }
      .panel[data-state="error"] .action { color: #ff453a; }
      .panel[data-state="error"] .action:hover { background: #ff453a; color: #fff; }
      svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
    </style>
    <div class="panel" data-state="idle">
      <button class="action" type="button" aria-label="Download with Arus">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"></path><path d="M5 18.5h14"></path></svg>
        <span>Download with Arus</span>
      </button>
      <button class="close" type="button" aria-label="Hide for this page" title="Hide for this page">×</button>
    </div>`;
  const panel = shadow.querySelector('.panel');
  const action = shadow.querySelector('.action');
  const label = shadow.querySelector('span');

  function mount() {
    const parent = document.fullscreenElement || document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
  }

  function directSrc(video) {
    if (!video) return '';
    const src = video.currentSrc || video.src || video.querySelector('source')?.src || '';
    return /^https?:/i.test(src) && !isProtectedHost(src) ? src : '';
  }

  function reportTracks() {
    if (Date.now() - lastTrackScan < 4000) return;
    lastTrackScan = Date.now();
    for (const track of document.querySelectorAll('video track[src], audio track[src]')) {
      let url;
      try {
        url = new URL(track.getAttribute('src'), location.href).toString();
      } catch {
        continue;
      }
      if (!/^https?:/i.test(url) || reportedTracks.has(url)) continue;
      reportedTracks.add(url);
      try {
        chrome.runtime.sendMessage({ type: 'media:track', url }, () => void chrome.runtime.lastError);
      } catch {
        /* extension context may be gone after a reload */
      }
    }
  }

  function videoTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof HTMLVideoElement) return node;
    }
    const target = event.target;
    if (target instanceof Element) {
      const video = target.closest('video');
      if (video instanceof HTMLVideoElement) return video;
    }
    return null;
  }

  function isVisible(video) {
    if (!video || !video.isConnected) return false;
    const rect = video.getBoundingClientRect();
    if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) return false;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
    const style = getComputedStyle(video);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    return true;
  }

  function videoUnderPointer() {
    if (pointer.x < 0 || pointer.y < 0) return null;
    const el = document.elementFromPoint(pointer.x, pointer.y);
    if (!(el instanceof Element)) return null;
    const video = el.closest('video');
    return video instanceof HTMLVideoElement ? video : null;
  }

  function visibleVideos() {
    const list = [];
    for (const video of document.querySelectorAll('video')) {
      if (isVisible(video)) list.push(video);
    }
    for (const video of shadowMedia) {
      if (video.isConnected && isVisible(video)) list.push(video);
    }
    return list;
  }

  function score(video, preferred) {
    const rect = video.getBoundingClientRect();
    let value = rect.width * rect.height;
    const ratio = rect.width / Math.max(1, rect.height);
    if (ratio >= 1.2 && ratio <= 3) value += 5e8;
    if (getComputedStyle(video).objectFit === 'cover') value -= 2e8;
    if (!video.paused) value += 1e10;
    if (directSrc(video)) value += 1e9;
    if (preferred) value += 2e11;
    return value;
  }

  function bestVideo() {
    const preferred = videoUnderPointer();
    let best = null;
    let bestScore = -1;
    for (const video of visibleVideos()) {
      const value = score(video, video === preferred);
      if (value > bestScore) {
        best = video;
        bestScore = value;
      }
    }
    return best;
  }

  function isProtectedPage() {
    return isProtectedHost(location.href);
  }

  function canOffer(video) {
    return Boolean(video) && (isProtectedPage() || mediaCount > 0 || Boolean(directSrc(video)));
  }

  function position() {
    if (!isVisible(activeVideo)) {
      if (activeVideo && (!activeVideo.isConnected || !isVisible(activeVideo))) hide();
      else host.style.display = 'none';
      return;
    }
    const rect = activeVideo.getBoundingClientRect();
    host.style.display = 'block';
    const width = host.offsetWidth || 196;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width - 12));
    const top = Math.min(window.innerHeight - 44, Math.max(8, rect.top + 12));
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
  }

  function startTracking() {
    if (rafId) return;
    const tick = () => {
      rafId = 0;
      if (!activeVideo || host.style.display === 'none') return;
      position();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function quietSoon() {
    if (quietTimer) clearTimeout(quietTimer);
    panel.classList.remove('is-quiet');
    quietTimer = setTimeout(() => panel.classList.add('is-quiet'), QUIET_AFTER);
  }

  function autoHideSoon(delay = QUIET_AFTER + 4000) {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      autoHideTimer = null;
      if (state === 'busy' || watchingId || hovering || panelHovering) return;
      hide(true);
    }, delay);
  }

  function show(video) {
    if (!overlayEnabled || !siteAllowed || dismissed) return;
    mount();
    autoHiddenVideo = null;
    const switched = video !== activeVideo;
    activeVideo = video;
    if (state === 'idle' || (switched && (state === 'done' || state === 'error'))) setState('idle', idleLabel(video));
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    position();
    startTracking();
    quietSoon();
    autoHideSoon();
  }

  function hide(mark = false) {
    if (mark && activeVideo) autoHiddenVideo = activeVideo;
    activeVideo = null;
    host.style.display = 'none';
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function hideSoon(delay = 1600) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (state && state !== 'busy' && !watchingId) hide(true);
    }, delay);
  }

  function refresh() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      dismissed = false;
      autoHiddenVideo = null;
      mediaCount = 0;
      reportedTracks.clear();
    }
    reportTracks();
    scanPageMedia();
    syncMediaCount();
    if (!overlayEnabled || !siteAllowed || dismissed || state === 'busy') return;
    const video = bestVideo();
    const wanted = video && canOffer(video) && (hovering || (!video.paused && video !== autoHiddenVideo));
    if (wanted) {
      if (video !== activeVideo) show(video);
      else position();
    } else if (!hovering && !panelHovering && !watchingId) {
      hide();
    }
  }

  function idleLabel(video) {
    if (isProtectedPage()) return 'YouTube not supported';
    if (!extensionAlive()) return 'Refresh page to reconnect';
    const src = directSrc(video);
    if (/\.mp4(?:[?#]|$)/i.test(src)) return 'Download MP4';
    if (/\.(m3u8|mpd)(?:[?#]|$)/i.test(src)) return 'Download stream';
    return 'Download with Arus';
  }

  function setState(next, text) {
    state = next;
    stateVideo = activeVideo;
    panel.dataset.state = next;
    label.textContent = text;
    action.setAttribute('aria-label', text);
    if (next === 'idle') action.removeAttribute('title');
  }

  function resetSoon(delay = 3200) {
    setTimeout(() => {
      if (state === 'done' || state === 'error') setState('idle', idleLabel(stateVideo));
    }, delay);
  }

  function stopWatch() {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    watchingId = null;
  }

  function failureLabel(reason) {
    const text = String(reason || '');
    const code = /HTTP\s+(\d{3})/i.exec(text);
    if (code) return 'Failed: HTTP ' + code[1];
    if (/timed?\s*out/i.test(text)) return 'Failed: timeout';
    return 'Download failed';
  }

  function watchDownload(id, base) {
    stopWatch();
    if (!id || !base) {
      setState('done', 'Sent to Arus');
      resetSoon();
      return;
    }
    watchingId = id;
    let ticks = 0;
    const poll = () => {
      ticks += 1;
      if (ticks > 40) {
        stopWatch();
        setState('done', 'Downloading in Arus');
        resetSoon();
        autoHideSoon(5000);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: 'download:status', id, base }, (status) => {
          if (chrome.runtime.lastError || !status || status.error) return;
          if (status.status === 'completed') {
            stopWatch();
            setState('done', 'Saved to Arus');
            resetSoon();
            autoHideSoon(5000);
          } else if (status.status === 'failed') {
            stopWatch();
            setState('error', failureLabel(status.failure));
            action.title = 'Arus: ' + (status.failure || 'Download failed');
            resetSoon(7000);
            autoHideSoon(9000);
          } else if (status.status === 'canceled') {
            stopWatch();
            setState('error', 'Canceled in Arus');
            resetSoon();
            autoHideSoon(5000);
          } else if (status.status === 'downloading') {
            const percent = typeof status.percent === 'number' ? status.percent : null;
            setState('done', percent == null ? 'Downloading…' : 'Downloading ' + percent + '%');
            quietSoon();
          } else if (status.status === 'queued' || status.status === 'paused') {
            setState('done', status.status === 'queued' ? 'Queued in Arus' : 'Paused in Arus');
            quietSoon();
          }
        });
      } catch {
        stopWatch();
      }
    };
    poll();
    watchTimer = setInterval(poll, 600);
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function staleContext() {
    setState('error', 'Refresh page to reconnect');
    action.title =
      'Arus Capture was reloaded, so this tab still runs the old copy. Refresh the page once (F5) and the button will work again.';
    resetSoon();
  }

  action.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state === 'busy' || watchingId) return;
    if (isProtectedPage()) {
      setState('error', 'YouTube not supported');
      action.title =
        'YouTube streams are protected and cannot be downloaded by Arus. Send a direct video, HLS, or DASH link instead.';
      resetSoon();
      return;
    }
    if (!extensionAlive()) {
      staleContext();
      return;
    }
    const url = directSrc(activeVideo);
    setState('busy', 'Sending…');
    quietSoon();
    try {
      chrome.runtime.sendMessage(
        { type: 'capture:video', url, pageUrl: location.href },
        (response) => {
          if (chrome.runtime.lastError) {
            const reason = String(chrome.runtime.lastError.message || '');
            if (/invalidated|context/i.test(reason)) staleContext();
            else {
              setState('error', 'Could not send');
              resetSoon();
            }
            return;
          }
          if (response?.error) {
            const message = String(response.error);
            setState(
              'error',
              /protected/i.test(message)
                ? 'YouTube not supported'
                : message.includes('not running')
                  ? 'Start Arus first'
                  : 'Could not send'
            );
            resetSoon();
            return;
          }
          if (response?.opened) {
            setState('done', 'Opened Arus');
            resetSoon();
            return;
          }
          setState('done', 'Starting…');
          watchDownload(response?.download?.id, response?.base);
        }
      );
    } catch (error) {
      if (/invalidated|context/i.test(String(error?.message || error))) staleContext();
      else {
        setState('error', 'Could not send');
        resetSoon();
      }
    }
  });

  shadow.querySelector('.close').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dismissed = true;
    stopWatch();
    hide();
  });

  panel.addEventListener('mouseenter', () => {
    panelHovering = true;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    panel.classList.remove('is-quiet');
    if (quietTimer) clearTimeout(quietTimer);
  });

  panel.addEventListener('mouseleave', () => {
    panelHovering = false;
    quietSoon();
    hideSoon(2000);
  });

  document.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    'mouseover',
    (event) => {
      const video = videoTarget(event);
      if (!video) return;
      hovering = true;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (canOffer(video)) show(video);
    },
    true
  );

  document.addEventListener(
    'mouseout',
    (event) => {
      const video = videoTarget(event);
      if (!video) return;
      const related = event.relatedTarget;
      if (related instanceof Node && video.contains(related)) return;
      hovering = false;
      if (related === host) return;
      hideSoon();
    },
    true
  );

  window.addEventListener('scroll', () => {
    if (activeVideo) position();
  }, { passive: true, capture: true });

  window.addEventListener('resize', () => {
    if (activeVideo) position();
  }, { passive: true });

  document.addEventListener('fullscreenchange', () => {
    if (activeVideo) {
      mount();
      position();
    }
  });

  document.addEventListener(
    'play',
    (event) => {
      const video = event.target;
      if (video instanceof HTMLVideoElement && video === autoHiddenVideo) autoHiddenVideo = null;
      refresh();
    },
    true
  );

  for (const type of ['playing', 'loadedmetadata', 'durationchange']) {
    document.addEventListener(type, refresh, true);
  }

  setInterval(refresh, 1200);

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'grab:media') {
        const video = videoUnderPointer() || bestVideo() || activeVideo;
        sendResponse({ url: directSrc(video) || null, kind: 'file' });
        return;
      }
      if (message.type === 'media:found') {
        mediaCount = Math.max(mediaCount, Number(message.count) || 1);
        refresh();
      } else if (message.type === 'media:clear') {
        mediaCount = 0;
        if (!hovering) hide();
      }
    });
    chrome.runtime.sendMessage({ type: 'media:count' }, (response) => {
      if (chrome.runtime.lastError) return;
      mediaCount = Number(response?.count) || 0;
      refresh();
    });
  } catch {
    /* extension context may be gone after a reload */
  }

  try {
    const applySitePreference = (map) => {
      const current = location.hostname.toLowerCase();
      siteAllowed = !current || !map || map[current] !== false;
      if (!siteAllowed) hide();
      else refresh();
    };
    chrome.storage.local.get({ overlay: true, siteOverlay: {} }, (stored) => {
      overlayEnabled = stored.overlay !== false;
      applySitePreference(stored.siteOverlay);
      if (!overlayEnabled) hide();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.overlay) {
        overlayEnabled = changes.overlay.newValue !== false;
        if (!overlayEnabled) hide();
        else refresh();
      }
      if (changes.siteOverlay) applySitePreference(changes.siteOverlay.newValue);
    });
  } catch {
    /* extension context may be gone after a reload */
  }
})();
