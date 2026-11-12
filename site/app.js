(function () {
  'use strict';

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reduced = motionQuery.matches;
  var motionControllers = [];
  var siteLang = window.ArusSiteLang;
  var fmt = new Intl.NumberFormat(siteLang ? siteLang.locale : 'id-ID');
  var REPO = 'arielbudinex-oss/Arus-Download-Manager';
  var CACHE_KEY = 'arus.site.stats.v3';
  var CACHE_TTL = 5 * 60 * 1000;
  var STATS_REFRESH_MS = 60 * 1000;

  function tr(value) { return siteLang ? siteLang.t(value) : value; }

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

  /* ------------------------------------------------------- motion lifecycle */

  // One timestamp-driven RAF per figure. No work while hidden, offscreen or settled.
  function motionFor(element, draw, calm, suspend) {
    var raf = 0, last = 0, visible = !('IntersectionObserver' in window);
    function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; }
    function frame(now) {
      raf = 0;
      var dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
      last = now;
      if (draw(dt)) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function wake() {
      if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(frame);
    }
    function sync() {
      stop();
      if (reduced) calm();
      else if (visible && !document.hidden) wake();
      else if (suspend) suspend();
    }
    var observer = visible ? null : new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    });
    if (observer) observer.observe(element);
    var controller = {
      wake: wake, stop: stop, sync: sync,
      destroy: function () {
        stop();
        if (observer) observer.disconnect();
        motionControllers = motionControllers.filter(function (item) { return item !== controller; });
      }
    };
    motionControllers.push(controller);
    return controller;
  }
  function syncMotion() { motionControllers.slice().forEach(function (item) { item.sync(); }); }
  motionQuery.addEventListener('change', function () {
    reduced = motionQuery.matches;
    if (reduced) {
      revealEls.forEach(function (el) { el.classList.add('in'); });
      if (revealObserver) revealObserver.disconnect();
    }
    syncMotion();
    renderDemo();
  });
  document.addEventListener('visibilitychange', syncMotion);

  /* Adapted from React Bits SpotlightCard, Magnet and GradientText, pinned at
     9d9c687dc4f55b23539aa5417b703078047efa74. Copyright (c) 2026 David Haz.
     MIT + Commons Clause; full notice and source paths in THIRD_PARTY_NOTICES.md.
     Site-specific only: no proximity field, grain, tilt, flare or ambient loops. */

  var pointerResets = [];
  pointerQuery.addEventListener('change', function () { pointerResets.forEach(function (reset) { reset(); }); });
  window.addEventListener('blur', function () { pointerResets.forEach(function (reset) { reset(); }); });

  $$('.magnetic').forEach(function (button) {
    var inner = $('.magnetic-inner', button);
    if (!inner) return;
    var x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0;
    function reset() {
      x = y = vx = vy = tx = ty = 0;
      inner.style.transform = '';
      motion.stop();
    }
    var motion = motionFor(button, function (dt) {
      // Magnet's damped spring, sub-stepped for stable high-refresh rendering.
      var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (var i = 0; i < steps; i++) {
        var step = dt / steps;
        vx += (170 * (tx - x) - 26 * vx) * step;
        vy += (170 * (ty - y) - 26 * vy) * step;
        x += vx * step; y += vy * step;
      }
      var settled = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) < 0.05;
      if (settled) { x = tx; y = ty; vx = vy = 0; }
      inner.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
      return !settled;
    }, reset, reset);
    pointerResets.push(reset);
    button.addEventListener('pointermove', function (event) {
      if (reduced || !pointerQuery.matches || event.pointerType === 'touch') return;
      var rect = button.getBoundingClientRect();
      tx = (event.clientX - rect.left - rect.width / 2) / 12;
      ty = (event.clientY - rect.top - rect.height / 2) / 12;
      var length = Math.hypot(tx, ty);
      if (length > 4) { tx *= 4 / length; ty *= 4 / length; }
      motion.wake();
    });
    button.addEventListener('pointerleave', function () { tx = ty = 0; motion.wake(); });
    button.addEventListener('pointercancel', reset);
    button.addEventListener('focus', reset);
  });

  var shot = $('.spotlight');
  if (shot) {
    var sx = 0, sy = 0, px = 0, py = 0, presence = 0, targetPresence = 0;
    function resetSpotlight() {
      presence = targetPresence = 0;
      shot.style.setProperty('--spot-presence', '0');
      spotlightMotion.stop();
    }
    var spotlightMotion = motionFor(shot, function (dt) {
      var follow = 1 - Math.exp(-dt / 0.08);
      sx += (px - sx) * follow; sy += (py - sy) * follow;
      presence += (targetPresence - presence) * (1 - Math.exp(-dt / 0.14));
      var settled = Math.abs(px - sx) + Math.abs(py - sy) < 0.1 && Math.abs(targetPresence - presence) < 0.002;
      if (settled) { sx = px; sy = py; presence = targetPresence; }
      shot.style.setProperty('--spot-x', sx.toFixed(1) + 'px');
      shot.style.setProperty('--spot-y', sy.toFixed(1) + 'px');
      shot.style.setProperty('--spot-presence', presence.toFixed(3));
      return !settled;
    }, resetSpotlight, resetSpotlight);
    pointerResets.push(resetSpotlight);
    shot.addEventListener('pointermove', function (event) {
      if (reduced || !pointerQuery.matches || event.pointerType === 'touch') return;
      var rect = shot.getBoundingClientRect();
      px = event.clientX - rect.left; py = event.clientY - rect.top;
      if (presence < 0.02) { sx = px; sy = py; }
      targetPresence = 1;
      spotlightMotion.wake();
    });
    shot.addEventListener('pointerleave', function () { targetPresence = 0; spotlightMotion.wake(); });
    shot.addEventListener('pointercancel', resetSpotlight);
    shot.addEventListener('focus', function () {
      if (reduced || !shot.matches(':focus-visible')) return;
      px = shot.clientWidth / 2; py = 0; sx = px; sy = py;
      targetPresence = 1; spotlightMotion.wake();
    });
    shot.addEventListener('blur', resetSpotlight);
  }

  var heading = $('.heading-sweep');
  if (heading) {
    var sweepTime = 0;
    function finishSweep() {
      sweepTime = 1.4;
      heading.style.removeProperty('--gt-gradient');
    }
    var headingMotion = motionFor(heading, function (dt) {
      sweepTime += dt;
      if (sweepTime >= 1.4) { finishSweep(); return false; }
      // GradientText's cosine-eased linear palette sweep, restricted to one pass.
      var offset = -70 + (0.5 - Math.cos(Math.PI * sweepTime / 1.4) / 2) * 240;
      heading.style.setProperty('--gt-gradient', 'linear-gradient(90deg, #83e2c1 ' + (offset - 55) + '%, #edf4ef ' + offset + '%, #83e2c1 ' + (offset + 55) + '%)');
      return true;
    }, finishSweep);
    headingMotion.sync();
  }

  /* ------------------------------------------------------ parallel download */

  var demo = $('#cara-kerja');
  var demoPlay = $('#transfer-play');
  var demoSlow = $('#transfer-slow');
  var demoValues = [0, 0, 0, 0];
  var demoRunning = false, demoStarted = false, demoSlowOn = false;
  var demoStatus = 'Siap. Coba perlambat satu koneksi.';
  var demoMotion;

  function sayDemo(text) {
    demoStatus = text;
    var status = $('#transfer-status');
    if (status && status.textContent !== tr(text)) status.textContent = tr(text);
  }
  function demoDone() { return demoValues.every(function (value) { return value === 64; }); }
  function renderDemo() {
    if (!demo) return;
    var total = 0;
    $$('.transfer-lane', demo).forEach(function (lane, index) {
      var value = Math.floor(demoValues[index]);
      total += value;
      $('.lane-track i', lane).style.transform = 'scaleX(' + demoValues[index] / 64 + ')';
      var label = value + ' / 64 MB';
      if ($('.lane-amount', lane).textContent !== label) $('.lane-amount', lane).textContent = label;
    });
    $$('.disk-parts i', demo).forEach(function (part, index) { part.style.transform = 'scaleX(' + demoValues[index] / 64 + ')'; });
    var totalLabel = total + ' / 256 MB';
    if ($('#transfer-total').textContent !== totalLabel) $('#transfer-total').textContent = totalLabel;
    var action = reduced ? 'Tampilkan hasil' : demoRunning ? 'Jeda simulasi' : demoDone() ? 'Ulangi simulasi' : demoStarted ? 'Lanjutkan simulasi' : 'Jalankan simulasi';
    if (demoPlay.textContent !== tr(action)) demoPlay.textContent = tr(action);
    sayDemo(demoStatus);
  }
  function finishDemo() {
    if (demoStarted) {
      demoValues = [64, 64, 64, 64]; demoRunning = false;
      sayDemo('Selesai. Semua bagian sudah ditulis ke disk.');
    }
    renderDemo();
  }
  if (demo && demoPlay && demoSlow) {
    $('.transfer-controls', demo).hidden = false;
    demoPlay.setAttribute('data-no-i18n', '');
    demoMotion = motionFor(demo, function (dt) {
      if (!demoRunning) return false;
      demoValues = demoValues.map(function (value, index) {
        var seconds = index === 1 && demoSlowOn ? 7 : [4, 2.7, 3.4, 3][index];
        return Math.min(64, value + dt * 64 / seconds);
      });
      if (demoDone()) finishDemo();
      else if (demoSlowOn && demoValues[0] === 64 && demoValues[2] === 64 && demoValues[3] === 64) sayDemo('01, 03, 04 selesai. Hanya koneksi 02 yang masih berjalan.');
      renderDemo();
      return demoRunning;
    }, finishDemo);
    demoPlay.addEventListener('click', function () {
      if (reduced) {
        demoStarted = true;
        demoValues = demoSlowOn ? [64, 32, 64, 64] : [64, 64, 64, 64];
        sayDemo(demoSlowOn ? 'Cuplikan: 01, 03, 04 selesai; 02 masih setengah jalan.' : 'Selesai. Semua bagian sudah ditulis ke disk.');
      } else if (demoRunning) {
        demoRunning = false; demoMotion.stop(); sayDemo('Dijeda. Progres setiap bagian tetap tersimpan.');
      } else {
        if (demoDone()) demoValues = [0, 0, 0, 0];
        demoStarted = demoRunning = true;
        sayDemo('Empat bagian diunduh dan ditulis bersamaan.');
        demoMotion.wake();
      }
      renderDemo();
    });
    demoSlow.addEventListener('click', function () {
      demoSlowOn = !demoSlowOn;
      demoSlow.setAttribute('aria-pressed', String(demoSlowOn));
      demo.classList.toggle('is-slow', demoSlowOn);
      if (demoDone() || reduced) { demoValues = [0, 0, 0, 0]; demoStarted = false; }
      sayDemo(demoSlowOn ? 'Koneksi 02 diperlambat. Tiga bagian lain tidak terpengaruh.' : 'Keempat koneksi berjalan tanpa perlambatan tambahan.');
      renderDemo();
    });
    renderDemo();
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
  var downloadShown = null;

  var countMotion = null;
  function countUp(el, target) {
    var elapsed = 0;
    function finish() {
      el.textContent = fmt.format(target);
      if (countMotion) countMotion.destroy();
      countMotion = null;
    }
    if (reduced) { finish(); return; }
    countMotion = motionFor(el, function (dt) {
      elapsed += dt;
      var progress = Math.min(1, elapsed / 0.9);
      el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress === 1) finish();
      return progress < 1;
    }, finish);
    countMotion.sync();
  }

  function renderStats() {
    if (countMotion) { countMotion.destroy(); countMotion = null; }
    if (statsFallback) {
      $$('[data-download-total]').forEach(function (el) { el.textContent = '—'; });
      $$('[data-stars], [data-forks]').forEach(function (el) { el.textContent = '-'; });
      return;
    }
    if (!lastStats) return;
    var downloads = Number(lastStats.downloads) || 0;
    $$('[data-download-total]').forEach(function (el) {
      if (downloadShown === null) countUp(el, downloads);
      else el.textContent = fmt.format(downloads);
    });
    downloadShown = downloads;
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
            if (!/\.(exe|msi)$/i.test(asset.name || '')) return;
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

  var lastStatsFetch = 0;

  function refreshStats() {
    if (Date.now() - lastStatsFetch < STATS_REFRESH_MS / 2) return;
    lastStatsFetch = Date.now();
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

  function loadStats() {
    var cached = readCache();
    if (cached) applyStats(cached);
    refreshStats();
  }
  loadStats();
  window.setInterval(function () {
    if (document.visibilityState === 'visible') refreshStats();
  }, STATS_REFRESH_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshStats();
  });

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
      dialog.setAttribute('aria-labelledby', value === 'qris' ? 'qris-title' : 'support-title');
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
    renderDemo();
    if (amountInput) amountInput.value = fmt.format(supportState.lastValid);
    if (dialog && dialog.open) setAmount(supportState.lastValid);
  });
})();
