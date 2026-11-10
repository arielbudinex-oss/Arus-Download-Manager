(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var siteLang = window.ArusSiteLang;
  var fmt = new Intl.NumberFormat(siteLang ? siteLang.locale : 'id-ID');
  var REPO = 'arielbudinex-oss/Arus-Download-Manager';
  var CACHE_KEY = 'arus.site.stats.v2';
  var CACHE_TTL = 15 * 60 * 1000;

  function lang() { return siteLang ? siteLang.current : 'id'; }
  function tr(value) { return siteLang ? siteLang.t(value) : value; }

  function downloadLabel(count) {
    if (lang() === 'en') return fmt.format(count) + (count === 1 ? ' download' : ' downloads');
    return fmt.format(count) + ' unduhan';
  }

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  /* ---------------------------------------------------------------- nav */

  var nav = $('.nav');
  function onScroll() {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var menuBtn = $('#menu-btn');
  var menu = $('#mobile-menu');
  function setMenu(open) {
    if (!menu || !menuBtn) return;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('click', function (event) {
      if (!menu.hidden && !event.target.closest('.nav')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) setMenu(false);
    });
  }

  /* ------------------------------------------------------------- reveal */

  var revealEls = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ----------------------------------------------------------- count up */

  function animateCounter(el) {
    var target = Number(el.getAttribute('data-count')) || 0;
    if (reduced) {
      el.textContent = fmt.format(target);
      return;
    }
    var duration = 1000;
    var startedAt = null;
    var safety = window.setTimeout(function () {
      el.textContent = fmt.format(target);
    }, duration + 400);
    function frame(now) {
      if (startedAt === null) startedAt = now;
      var progress = Math.min(1, (now - startedAt) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = fmt.format(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(frame);
      else window.clearTimeout(safety);
    }
    requestAnimationFrame(frame);
  }

  var counters = $$('[data-count]');
  if (counters.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      counters.forEach(animateCounter);
    } else {
      var counterObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { counterObserver.observe(el); });
    }
  }

  /* ---------------------------------------------------- motion accents */

  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var tilt = $('[data-tilt]');
  if (tilt && finePointer && !reduced) {
    tilt.addEventListener('pointermove', function (event) {
      var rect = tilt.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - 0.5;
      var y = (event.clientY - rect.top) / rect.height - 0.5;
      tilt.style.setProperty('--ry', (x * 4).toFixed(2) + 'deg');
      tilt.style.setProperty('--rx', (-y * 3).toFixed(2) + 'deg');
    });
    tilt.addEventListener('pointerleave', function () {
      tilt.style.setProperty('--ry', '0deg');
      tilt.style.setProperty('--rx', '0deg');
    });
  }

  if (finePointer && !reduced) {
    $$('.magnetic').forEach(function (button) {
      button.addEventListener('pointermove', function (event) {
        var rect = button.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - 0.5;
        var y = (event.clientY - rect.top) / rect.height - 0.5;
        button.style.transform = 'translate3d(' + (x * 5).toFixed(2) + 'px,' + (y * 4).toFixed(2) + 'px,0)';
      });
      button.addEventListener('pointerleave', function () {
        button.style.transform = '';
      });
    });

    $$('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
        card.style.setProperty('--my', (event.clientY - rect.top) + 'px');
      });
    });
  }

  /* ---------------------------------------------------------- GitHub stats */

  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (!cached || Date.now() - cached.at > CACHE_TTL) return null;
      return cached;
    } catch (error) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        at: Date.now(),
        downloads: data.downloads,
        stars: data.stars,
        forks: data.forks
      }));
    } catch (error) {
      /* penyimpanan lokal bisa diblokir, abaikan */
    }
  }

  var lastStats = null;
  var statsFallback = false;

  function renderStats() {
    if (statsFallback) {
      $$('[data-download-count]').forEach(function (el) {
        var live = el.closest('.meta-live');
        if (live) {
          live.hidden = true;
          return;
        }
        el.textContent = '-';
      });
      $$('[data-download-total]').forEach(function (el) { el.textContent = '—'; });
      $$('[data-stars], [data-forks]').forEach(function (el) { el.textContent = '-'; });
      return;
    }
    if (!lastStats) return;
    var downloads = Number(lastStats.downloads) || 0;
    var label = downloadLabel(downloads);
    $$('[data-download-count]').forEach(function (el) {
      el.textContent = label;
      var live = el.closest('.meta-live');
      if (live) live.hidden = false;
    });
    $$('[data-download-total]').forEach(function (el) { el.textContent = fmt.format(downloads); });
    $$('[data-stars]').forEach(function (el) { el.textContent = fmt.format(Number(lastStats.stars) || 0); });
    $$('[data-forks]').forEach(function (el) { el.textContent = fmt.format(Number(lastStats.forks) || 0); });
  }

  function applyStats(data) {
    lastStats = data;
    statsFallback = false;
    renderStats();
  }

  function showStatsFallback() {
    statsFallback = true;
    renderStats();
  }

  function fetchJson(url, ms) {
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, ms) : null;
    var options = { headers: { Accept: 'application/json' } };
    if (controller) options.signal = controller.signal;
    return fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function loadStatsFromGitHub() {
    fetchJson('https://api.github.com/repos/' + REPO + '/releases?per_page=100', 9000)
      .then(function (releases) {
        return fetchJson('https://api.github.com/repos/' + REPO, 9000)
          .then(function (repo) { return [releases, repo]; });
      })
      .then(function (payload) {
        var releases = payload[0];
        var repo = payload[1];
        var downloads = 0;
        (Array.isArray(releases) ? releases : []).forEach(function (release) {
          (release.assets || []).forEach(function (asset) {
            downloads += Number(asset.download_count) || 0;
          });
        });
        var data = {
          downloads: downloads,
          stars: Number(repo.stargazers_count) || 0,
          forks: Number(repo.forks_count) || 0
        };
        applyStats(data);
        writeCache(data);
      })
      .catch(function () {
        showStatsFallback();
      });
  }

  function loadStats() {
    var cached = readCache();
    if (cached) {
      applyStats(cached);
      return;
    }
    fetchJson('/api/stats', 7000)
      .then(function (data) {
        if (!data || typeof data.downloads !== 'number') throw new Error('stats');
        var fresh = {
          downloads: data.downloads,
          stars: Number(data.stars) || 0,
          forks: Number(data.forks) || 0
        };
        applyStats(fresh);
        writeCache(fresh);
      })
      .catch(loadStatsFromGitHub);
  }
  loadStats();

  /* --------------------------------------------------------------- QRIS */

  var dialog = $('#support-dialog');
  var amountInput = $('#support-amount');
  var amountHint = $('#amount-hint');
  var qrHost = $('#support-qr');
  var qrLabel = $('#qr-amount-label');
  var preview = $('#support-qr-preview');
  var supportState = { lastValid: 25000 };
  var lastTrigger = null;

  function renderQr(amount) {
    try {
      window.ArusQris.render(qrHost, amount);
    } catch (error) {
      if (qrHost) qrHost.textContent = tr('QR tidak tersedia');
    }
  }

  function markPresets(amount) {
    $$('#support-dialog .preset').forEach(function (button) {
      button.setAttribute('aria-pressed', String(Number(button.getAttribute('data-amount')) === amount));
    });
  }

  function setAmount(value, options) {
    options = options || {};
    var amount = Math.round(Number(value) || 0);
    if (options.write !== false && amountInput) {
      amountInput.value = amount > 0 ? fmt.format(amount) : '';
    }
    markPresets(amount);
    if (!amountHint || !window.ArusQris) return;
    if (amount < window.ArusQris.min) {
      amountHint.textContent = tr('Minimal Rp 1.000.');
      amountHint.classList.add('is-error');
      return;
    }
    if (amount > window.ArusQris.max) {
      amountHint.textContent = tr('Maksimal Rp 50.000.000.');
      amountHint.classList.add('is-error');
      return;
    }
    amountHint.textContent = tr('Nominal bebas, minimal Rp 1.000.');
    amountHint.classList.remove('is-error');
    supportState.lastValid = amount;
    if (qrLabel) qrLabel.textContent = 'Rp ' + fmt.format(amount);
    renderQr(amount);
  }

  if (preview && window.ArusQris) {
    try { window.ArusQris.render(preview, 25000); } catch (error) { preview.textContent = 'QRIS'; }
  }

  if (dialog && amountInput) {
    $$('#support-dialog .preset').forEach(function (button) {
      button.addEventListener('click', function () {
        setAmount(Number(button.getAttribute('data-amount')));
      });
    });

    amountInput.addEventListener('input', function () {
      var digits = Number(amountInput.value.replace(/\D+/g, '')) || 0;
      if (digits > 0) {
        setAmount(digits, { write: false });
        amountInput.value = fmt.format(digits);
      } else {
        amountInput.value = '';
        amountHint.textContent = tr('Minimal Rp 1.000.');
        amountHint.classList.add('is-error');
        markPresets(0);
      }
    });
    amountInput.addEventListener('focus', function () { amountInput.select(); });
    amountInput.addEventListener('blur', function () {
      setAmount(supportState.lastValid);
      amountInput.value = fmt.format(supportState.lastValid);
    });

    function showStep(step) {
      var value = step === 'qris' ? 'qris' : 'thanks';
      $$('[data-support-step]').forEach(function (el) {
        el.hidden = el.getAttribute('data-support-step') !== value;
      });
      if (value === 'qris') setAmount(supportState.lastValid);
    }

    function focusAmount() {
      window.setTimeout(function () {
        amountInput.focus({ preventScroll: true });
        amountInput.select();
      }, 50);
    }

    function openSupport(trigger, step) {
      lastTrigger = trigger || document.activeElement;
      if (dialog.open) return;
      showStep(step);
      dialog.showModal();
      document.documentElement.classList.add('dialog-open');
      if (step === 'qris') {
        focusAmount();
      } else {
        window.setTimeout(function () {
          var next = dialog.querySelector('[data-support-next]');
          if (next) next.focus({ preventScroll: true });
        }, 50);
      }
    }

    function closeSupport() {
      if (dialog.open) dialog.close();
    }

    $$('[data-open-support]').forEach(function (button) {
      button.addEventListener('click', function () { openSupport(button, 'qris'); });
    });
    $$('[data-support-next]').forEach(function (button) {
      button.addEventListener('click', function () {
        showStep('qris');
        focusAmount();
      });
    });
    $$('[data-support-back]').forEach(function (button) {
      button.addEventListener('click', function () {
        showStep('thanks');
        window.setTimeout(function () {
          var next = dialog.querySelector('[data-support-next]');
          if (next) next.focus({ preventScroll: true });
        }, 50);
      });
    });
    $$('[data-close-support]').forEach(function (button) {
      button.addEventListener('click', closeSupport);
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeSupport();
    });
    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('dialog-open');
      if (lastTrigger && typeof lastTrigger.focus === 'function') {
        lastTrigger.focus({ preventScroll: true });
      }
    });

    /* Popup dukungan muncul setelah tautan unduhan diklik. */
    $$('[data-download]').forEach(function (link) {
      link.addEventListener('click', function () {
        window.setTimeout(function () { openSupport(link, 'thanks'); }, 700);
      });
    });

    var saveQr = $('#save-qr');
    if (saveQr) {
      saveQr.addEventListener('click', function () {
        var svg = qrHost ? qrHost.querySelector('svg') : null;
        if (!svg) return;
        var source = new XMLSerializer().serializeToString(svg);
        var svgBlob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + source], { type: 'image/svg+xml;charset=utf-8' });
        var svgUrl = URL.createObjectURL(svgBlob);
        var filename = 'arus-qris-' + supportState.lastValid;
        var image = new Image();
        image.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = 1024;
          canvas.height = 1024;
          var context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, 1024, 1024);
          context.drawImage(image, 0, 0, 1024, 1024);
          URL.revokeObjectURL(svgUrl);
          canvas.toBlob(function (blob) {
            if (blob) downloadBlob(blob, filename + '.png');
          }, 'image/png');
        };
        image.onerror = function () {
          URL.revokeObjectURL(svgUrl);
          downloadBlob(svgBlob, filename + '.svg');
        };
        image.src = svgUrl;
      });
    }
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  document.addEventListener('arus:languagechange', function () {
    fmt = new Intl.NumberFormat(siteLang ? siteLang.locale : 'id-ID');
    renderStats();
    if (amountInput) amountInput.value = fmt.format(supportState.lastValid);
    if (dialog && dialog.open) setAmount(supportState.lastValid);
  });
})();
