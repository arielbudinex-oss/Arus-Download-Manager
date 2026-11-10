(function () {
  'use strict';

  var ENDPOINT = '/api/track';
  var MAX_QUEUE = 20;
  var FLUSH_MS = 20000;
  var VID_KEY = 'arus.vid';
  var SID_KEY = 'arus.sid';
  var LANG_KEY = 'arus.site.lang';

  function disabled() {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return true;
    try {
      if (localStorage.getItem('arus.track.off') === '1') return true;
      if (navigator.webdriver && localStorage.getItem('arus.track.force') !== '1') return true;
    } catch (error) {
      return true;
    }
    return false;
  }

  if (disabled()) return;

  function randomId() {
    var bytes = new Uint8Array(12);
    var source = window.crypto || window.msCrypto;
    if (source && source.getRandomValues) {
      source.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    for (var j = 0; j < bytes.length; j += 1) out += bytes[j].toString(16).padStart(2, '0');
    return out;
  }

  function store(storage, key) {
    try {
      var value = storage.getItem(key);
      if (!value || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) {
        value = randomId();
        storage.setItem(key, value);
      }
      return value;
    } catch (error) {
      return randomId();
    }
  }

  var vid = store(window.localStorage, VID_KEY);
  var sid = store(window.sessionStorage, SID_KEY);
  var queue = [];
  var lastFlush = 0;
  var started = false;

  function language() {
    try {
      return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'id';
    } catch (error) {
      return 'id';
    }
  }

  function referrer() {
    if (!document.referrer) return '';
    try {
      return new URL(document.referrer).hostname.slice(0, 200);
    } catch (error) {
      return '';
    }
  }

  function push(name, label, href) {
    queue.push({
      name: name,
      label: label ? String(label).slice(0, 120) : '',
      href: href ? String(href).slice(0, 300) : '',
      at: Date.now()
    });
    if (queue.length >= MAX_QUEUE) flush(true);
  }

  function payload(events) {
    return JSON.stringify({
      vid: vid,
      sid: sid,
      vw: window.innerWidth || 0,
      lang: language(),
      path: location.pathname.slice(0, 80) || '/',
      ref: referrer(),
      events: events
    });
  }

  function flush(immediate) {
    if (!queue.length) return;
    var now = Date.now();
    if (!immediate && now - lastFlush < 1000) return;
    var events = queue.splice(0, MAX_QUEUE);
    lastFlush = now;
    var body = payload(events);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch (error) { /* fall through */ }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        mode: 'same-origin'
      }).catch(function () {});
    } catch (error) { /* offline */ }
  }

  function tagFor(anchor) {
    var tag = anchor.getAttribute('data-track-event');
    if (tag) return tag;
    if (anchor.hasAttribute('data-download') || anchor.hasAttribute('data-download-secondary')) return 'download';
    var href = anchor.getAttribute('href') || '';
    if (/discord\.(gg|com)/.test(href)) return 'discord';
    if (/github\.com/.test(href)) return 'github';
    if (anchor.closest('#faq')) return 'faq';
    if (anchor.closest('.nav, .mobile-menu, .footer')) return 'nav';
    return '';
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-lang-value]');
    if (button) {
      push('lang', button.getAttribute('data-lang-value'));
      return;
    }
    var support = event.target.closest('[data-open-support], [data-support-next]');
    if (support) {
      push('support', support.hasAttribute('data-support-next') ? 'qris' : 'open');
      return;
    }
    var anchor = event.target.closest('a[href]');
    if (!anchor) return;
    var name = tagFor(anchor);
    if (!name) return;
    var label = name === 'download'
      ? 'installer'
      : name === 'faq'
        ? (anchor.textContent || '').trim()
        : (anchor.getAttribute('aria-label') || anchor.textContent || '').trim();
    push(name, label, anchor.href);
  }, true);

  window.addEventListener('pagehide', function () { flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.setInterval(function () { flush(false); }, FLUSH_MS);

  if (!started) {
    started = true;
    push('pageview', location.pathname || '/');
  }
})();
