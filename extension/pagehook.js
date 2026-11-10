'use strict';

(() => {
  if (window.__arusPagehook) return;
  window.__arusPagehook = true;

  const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|avi|wmv|flv|mpeg|mpg|3gp)(?:[?#]|$)/i;
  const AUDIO_EXT = /\.(mp3|m4a|aac|flac|ogg|wav|opus|wma)(?:[?#]|$)/i;
  const SUBTITLE_EXT = /\.(vtt|srt|ass|ssa|ttml|dfxp|sbv)(?:[?#]|$)/i;
  const MANIFEST_HINT = /m3u8|\.mpd(?:[?#]|$)|mpegurl|dash\+xml|manifest|playlist|master|\.m3u(?:[?#]|$)/i;
  const seen = new Set();
  const pending = [];
  let ready = false;

  function isProtected(url) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'youtu.be' || /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com)$/.test(host);
    } catch {
      return false;
    }
  }

  function hasFileExt(url) {
    return VIDEO_EXT.test(url) || AUDIO_EXT.test(url);
  }

  function kindOf(url, type) {
    const mime = String(type || '').split(';')[0].trim().toLowerCase();
    if (/mpegurl/.test(mime) || /\.m3u8?(?:[?#]|$)/i.test(url)) return 'hls';
    if (/dash\+xml/.test(mime) || /\.mpd(?:[?#]|$)/i.test(url)) return 'dash';
    if (/text\/vtt|x-subrip|ttml/.test(mime) || SUBTITLE_EXT.test(url)) return 'subtitle';
    if (mime.startsWith('video/') || VIDEO_EXT.test(url)) return 'video';
    if (/(^application\/ogg$)|(^audio\/)/.test(mime) || AUDIO_EXT.test(url)) return 'audio';
    return null;
  }

  function looksManifest(url, type) {
    return MANIFEST_HINT.test(url) || /mpegurl|dash\+xml|text\/plain|octet-stream/i.test(String(type || ''));
  }

  function post(message) {
    const payload = { source: 'arus-pagehook', type: 'media', url: message.url, kind: message.kind, contentType: message.contentType || null };
    if (ready) {
      try {
        window.postMessage(payload, '*');
      } catch {
        /* ignore */
      }
      return;
    }
    if (pending.length < 200) pending.push(payload);
  }

  function report(url, kind, type) {
    try {
      const parsed = new URL(url, location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      const href = parsed.href;
      if (isProtected(href) || seen.has(href)) return;
      if (seen.size > 800) seen.clear();
      seen.add(href);
      post({ url: href, kind, contentType: type });
    } catch {
      /* ignore invalid urls */
    }
  }

  function reportFromBody(url, text, type) {
    if (typeof text !== 'string' || !text) return;
    const head = text.slice(0, 8192);
    if (head.startsWith('#EXTM3U') || /#EXT-X-(STREAM-INF|TARGETDURATION)/.test(head)) {
      report(url, 'hls', type || 'application/vnd.apple.mpegurl');
    } else if (/<MPD[\s>]/i.test(head)) {
      report(url, 'dash', type || 'application/dash+xml');
    }
  }

  function sniffResponse(response, url) {
    try {
      if (response.status !== 200) return;
      if (response.headers.get('content-range')) return;
      const type = response.headers.get('content-type') || '';
      const finalUrl = response.url || url;
      if (isProtected(finalUrl)) return;
      let kind = kindOf(finalUrl, type);
      if ((kind === 'video' || kind === 'audio') && !hasFileExt(finalUrl)) kind = null;
      if (kind) report(finalUrl, kind, type);
      else if (looksManifest(finalUrl, type) && response.body) {
        const clone = response.clone();
        const reader = clone.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        const pump = () => reader.read().then(({ value, done }) => {
          if (done) {
            reader.cancel().catch(() => {});
            reportFromBody(finalUrl, text, type);
            return;
          }
          text += decoder.decode(value, { stream: true });
          if (text.length >= 8192) {
            reader.cancel().catch(() => {});
            reportFromBody(finalUrl, text, type);
            return;
          }
          return pump();
        }).catch(() => {});
        pump();
      }
    } catch {
      /* ignore */
    }
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (...args) {
      const promise = nativeFetch.apply(this, args);
      try {
        const input = args[0];
        const init = args[1];
        const requestUrl = typeof input === 'string' ? input : input && input.url ? input.url : '';
        const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method === 'GET') {
          promise.then((response) => {
            if (response) sniffResponse(response, requestUrl);
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
      return promise;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this.__arusUrl = String(url);
      this.__arusMethod = String(method || 'GET').toUpperCase();
    } catch {
      /* ignore */
    }
    return nativeOpen.call(this, method, url, ...rest);
  };

  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      this.addEventListener('loadend', () => {
        try {
          if (this.__arusMethod && this.__arusMethod !== 'GET') return;
          if (this.status !== 200) return;
          if (this.getResponseHeader('content-range')) return;
          const url = this.responseURL || this.__arusUrl || '';
          if (!/^https?:/i.test(url) || isProtected(url)) return;
          const type = this.getResponseHeader('content-type') || '';
          let kind = kindOf(url, type);
          if ((kind === 'video' || kind === 'audio') && !hasFileExt(url)) kind = null;
          if (kind) {
            report(url, kind, type);
            return;
          }
          if (!looksManifest(url, type)) return;
          const responseType = this.responseType;
          if (responseType === '' || responseType === 'text') {
            const text = this.responseText;
            if (typeof text === 'string' && text.length < 4194304) reportFromBody(url, text, type);
          }
        } catch {
          /* ignore inaccessible responses */
        }
      });
    } catch {
      /* ignore */
    }
    return nativeSend.apply(this, args);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'arus-content' || data.type !== 'hello') return;
    ready = true;
    const queue = pending.splice(0);
    for (const message of queue) {
      try {
        window.postMessage(message, '*');
      } catch {
        /* ignore */
      }
    }
  }, false);

  try {
    window.postMessage({ source: 'arus-pagehook', type: 'ready' }, '*');
  } catch {
    /* ignore */
  }
})();
