(function () {
  'use strict';

  var DATA = window.ARUS_TUTORIALS;
  var SITE_LANG = window.ArusSiteLang;
  var grid = document.getElementById('tut-chapters');
  var indexList = document.getElementById('tut-index-list');
  var updatedEl = document.getElementById('tut-updated');
  if (!grid || !indexList) return;

  var COPY = {
    id: {
      chapter: 'Bab',
      recording: 'Rekaman aplikasi',
      language: 'Bahasa Indonesia',
      track: 'Bahasa Indonesia',
      steps: 'Langkah singkat',
      transcript: 'Transkrip',
      lines: function (count) { return count + ' baris'; },
      videoLabel: function (key, title) {
        return 'Video tutorial Arus, bab ' + key + ': ' + title + ', bahasa Indonesia';
      },
      missing: 'Video tutorial belum tersedia.'
    },
    en: {
      chapter: 'Chapter',
      recording: 'App recording',
      language: 'English',
      track: 'English',
      steps: 'Short steps',
      transcript: 'Transcript',
      lines: function (count) { return count + (count === 1 ? ' line' : ' lines'); },
      videoLabel: function (key, title) {
        return 'Arus video tutorial, chapter ' + key + ': ' + title + ', English';
      },
      missing: 'Video tutorials are not available yet.'
    }
  };

  var current = SITE_LANG ? SITE_LANG.current : 'id';
  var chapters = DATA && Array.isArray(DATA.chapters) ? DATA.chapters.slice() : [];
  var views = [];
  var activeKey = null;
  var observer = null;
  var lazyObserver = null;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  chapters.sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); });

  function resolve(entry, lang) {
    if (entry[lang] && entry[lang].video) return { lang: lang, data: entry[lang] };
    var other = lang === 'id' ? 'en' : 'id';
    if (entry[other] && entry[other].video) return { lang: other, data: entry[other] };
    return null;
  }

  function fmt(seconds) {
    var value = Math.max(0, Math.floor(Number(seconds) || 0));
    var minutes = Math.floor(value / 60);
    var rest = value % 60;
    return minutes + ':' + String(rest).padStart(2, '0');
  }

  function updatedText(lang) {
    if (!DATA || !DATA.updated) return '';
    var date = new Date(DATA.updated + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return '';
    var formatted = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'id-ID', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).format(date);
    return (lang === 'en' ? 'Updated ' : 'Diperbarui ') + formatted;
  }

  function setActive(key) {
    activeKey = key;
    var links = indexList.querySelectorAll('a[data-key]');
    for (var i = 0; i < links.length; i += 1) {
      links[i].classList.toggle('is-active', links[i].getAttribute('data-key') === key);
    }
  }

  function buildIndex() {
    var keep = activeKey;
    var frag = document.createDocumentFragment();
    chapters.forEach(function (entry) {
      var source = resolve(entry, current);
      if (!source) return;
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#bab-' + entry.key;
      link.setAttribute('data-key', entry.key);

      var num = document.createElement('span');
      num.className = 'n';
      num.textContent = entry.key;

      var title = document.createElement('span');
      title.className = 't';
      title.textContent = source.data.title;

      var duration = document.createElement('span');
      duration.className = 'd';
      duration.textContent = fmt(source.data.duration);

      link.appendChild(num);
      link.appendChild(title);
      link.appendChild(duration);
      item.appendChild(link);
      frag.appendChild(item);
    });
    indexList.textContent = '';
    indexList.appendChild(frag);
    if (keep) setActive(keep);
    else if (views.length) setActive(views[0].key);
  }

  function createView(entry) {
    var article = document.createElement('article');
    article.className = 'tut-chapter';
    article.id = 'bab-' + entry.key;
    article.setAttribute('data-key', entry.key);

    article.innerHTML = [
      '<header class="tut-chapter-head">',
        '<div class="tut-chapter-no" aria-hidden="true">' + entry.key + '</div>',
        '<div>',
          '<p class="tut-chapter-meta"></p>',
          '<h2></h2>',
        '</div>',
      '</header>',
      '<div class="tut-frame">',
        '<div class="tut-frame-bar"><span></span><span></span></div>',
        '<div class="tut-video"></div>',
      '</div>',
      '<div class="tut-learn">',
        '<p class="tut-learn-label"></p>',
        '<ol class="tut-steps"></ol>',
      '</div>',
      '<details class="tut-transcript">',
        '<summary>',
          '<span class="tut-tr-title"></span>',
          '<span class="tut-tr-count"></span>',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>',
        '</summary>',
        '<div class="tut-tr-body"></div>',
      '</details>'
    ].join('');

    var heading = article.querySelector('h2');
    heading.id = 'tut-title-' + entry.key;
    article.setAttribute('aria-labelledby', heading.id);

    var video = document.createElement('video');
    video.setAttribute('controls', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'none');
    video.setAttribute('width', '1920');
    video.setAttribute('height', '1080');
    video.addEventListener('play', function () {
      views.forEach(function (view) {
        if (view.video !== video) view.video.pause();
      });
    });
    article.querySelector('.tut-video').appendChild(video);

    var stepsLabel = article.querySelector('.tut-learn-label');
    stepsLabel.id = 'tut-steps-label-' + entry.key;
    var steps = article.querySelector('.tut-steps');
    steps.setAttribute('aria-labelledby', stepsLabel.id);

    var view = {
      key: entry.key,
      entry: entry,
      article: article,
      meta: article.querySelector('.tut-chapter-meta'),
      title: heading,
      barLeft: article.querySelector('.tut-frame-bar span:first-child'),
      barRight: article.querySelector('.tut-frame-bar span:last-child'),
      video: video,
      stepsLabel: stepsLabel,
      steps: steps,
      trLabel: article.querySelector('.tut-tr-title'),
      trCount: article.querySelector('.tut-tr-count'),
      trBody: article.querySelector('.tut-tr-body'),
      source: null,
      loaded: false,
      appliedVideo: null,
      loadSeq: 0
    };
    article.__tutView = view;

    view.trBody.addEventListener('click', function (event) {
      var line = event.target.closest('.tut-tr-line');
      if (!line) return;
      seek(view, Number(line.getAttribute('data-start')) || 0);
    });

    grid.appendChild(article);
    return view;
  }

  function fillSteps(view, steps) {
    view.steps.textContent = '';
    steps.forEach(function (label, index) {
      var item = document.createElement('li');
      item.className = 'tut-step';
      var num = document.createElement('span');
      num.className = 'tut-step-no';
      num.textContent = String(index + 1).padStart(2, '0');
      var text = document.createElement('span');
      text.className = 'tut-step-text';
      text.textContent = label;
      item.appendChild(num);
      item.appendChild(text);
      view.steps.appendChild(item);
    });
  }

  function fillTranscript(view, transcript) {
    view.trBody.textContent = '';
    var frag = document.createDocumentFragment();
    transcript.forEach(function (sentence) {
      var line = document.createElement('button');
      line.type = 'button';
      line.className = 'tut-tr-line';
      line.setAttribute('data-start', String(sentence.start));
      var time = document.createElement('span');
      time.className = 'tut-tr-time';
      time.textContent = fmt(sentence.start);
      var text = document.createElement('span');
      text.className = 'tut-tr-text';
      text.textContent = sentence.text;
      line.appendChild(time);
      line.appendChild(text);
      frag.appendChild(line);
    });
    view.trBody.appendChild(frag);
  }

  function setTrack(view, source) {
    var old = view.video.querySelectorAll('track');
    for (var i = 0; i < old.length; i += 1) old[i].remove();
    var track = document.createElement('track');
    track.kind = 'captions';
    track.srclang = source.lang;
    track.label = COPY[source.lang].track;
    track.default = true;
    track.src = source.data.vtt;
    view.video.appendChild(track);
    try { track.track.mode = 'showing'; } catch (error) { /* track not ready */ }
  }

  function loadSource(view, source, restore) {
    if (!source) return;
    var video = view.video;
    var data = source.data;
    var time = restore && restore.time > 0.4 ? restore.time : 0;
    var shouldPlay = Boolean(restore && restore.playing);
    var seq = (view.loadSeq += 1);

    view.source = source;
    view.loaded = true;
    view.appliedVideo = data.video;
    video.pause();
    setTrack(view, source);
    video.poster = data.poster;

    if (time > 0) {
      video.preload = 'auto';
      video.addEventListener('loadeddata', function onReady() {
        video.removeEventListener('loadeddata', onReady);
        if (seq !== view.loadSeq) return;
        try {
          var end = isFinite(video.duration) ? Math.max(0, video.duration - 0.2) : time;
          video.currentTime = Math.min(time, end);
        } catch (error) { /* seek can fail before data settles */ }
        video.preload = 'metadata';
        if (shouldPlay) play(video);
      }, { once: true });
    } else {
      video.preload = 'metadata';
    }

    video.src = data.video;
    video.load();
  }

  function updateView(view, source, restore) {
    if (!source) return;
    var ui = COPY[source.lang];
    var data = source.data;

    view.meta.textContent = ui.chapter + ' ' + view.key + ' / ' + String(views.length).padStart(2, '0') + ' · ' + fmt(data.duration);
    view.title.textContent = data.title;
    view.barLeft.textContent = ui.recording + ' · ' + ui.language;
    view.barRight.textContent = '16:9 · 1080p · ' + fmt(data.duration);
    view.video.setAttribute('aria-label', ui.videoLabel(view.key, data.title));
    view.stepsLabel.textContent = ui.steps;
    fillSteps(view, data.steps || []);
    view.trLabel.textContent = ui.transcript;
    view.trCount.textContent = ui.lines((data.transcript || []).length);
    fillTranscript(view, data.transcript || []);

    view.source = source;
    if (view.loaded && view.appliedVideo !== data.video) {
      loadSource(view, source, restore);
    }
  }

  function play(video) {
    var result = video.play();
    if (result && result.catch) result.catch(function () { /* autoplay may be blocked */ });
  }

  function collectState(view) {
    var video = view.video;
    return {
      time: video.readyState >= 1 && video.currentSrc ? video.currentTime : 0,
      playing: Boolean(video.currentSrc) && !video.paused && !video.ended
    };
  }

  function updateAll() {
    var states = views.map(collectState);
    views.forEach(function (view) { view.video.pause(); });
    views.forEach(function (view, index) {
      updateView(view, resolve(view.entry, current), states[index]);
    });
    buildIndex();
    if (updatedEl) updatedEl.textContent = updatedText(current);
    if (!views.length) {
      grid.textContent = '';
      var empty = document.createElement('p');
      empty.className = 'tut-empty';
      empty.textContent = COPY[current].missing;
      grid.appendChild(empty);
    }
  }

  function seek(view, time) {
    var frame = view.article.querySelector('.tut-frame');
    if (frame && frame.scrollIntoView) {
      frame.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
    }
    if (!view.loaded || !view.source) {
      loadSource(view, resolve(view.entry, current), { time: time, playing: true });
      return;
    }
    var video = view.video;
    function apply() {
      try { video.currentTime = time; } catch (error) { /* ignore */ }
      play(video);
    }
    if (video.readyState >= 1) apply();
    else {
      video.addEventListener('loadedmetadata', apply, { once: true });
      video.load();
    }
  }

  function loadVisible(entry) {
    var view = entry.__tutView;
    if (!view || view.loaded) return;
    var source = resolve(view.entry, current);
    if (!source) return;
    if (lazyObserver) lazyObserver.unobserve(entry);
    loadSource(view, source, null);
  }

  function observeLazy() {
    if (!('IntersectionObserver' in window)) {
      views.forEach(function (view) {
        loadSource(view, resolve(view.entry, current), null);
      });
      return;
    }
    if (lazyObserver) lazyObserver.disconnect();
    lazyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) loadVisible(entry.target);
      });
    }, { rootMargin: '700px 0px' });
    views.forEach(function (view) {
      if (!view.loaded) lazyObserver.observe(view.article);
    });
  }

  function observeChapters() {
    if (!('IntersectionObserver' in window)) return;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (entry) { return entry.isIntersecting; });
      if (!visible.length) return;
      visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      setActive(visible[0].target.getAttribute('data-key'));
    }, { rootMargin: '-22% 0px -62% 0px', threshold: 0 });
    views.forEach(function (view) { observer.observe(view.article); });
  }

  function jumpToHash() {
    if (!location.hash) return;
    var target = document.getElementById(location.hash.slice(1));
    if (target) requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); });
  }

  chapters.forEach(function (entry) {
    if (!resolve(entry, 'id') && !resolve(entry, 'en')) return;
    views.push(createView(entry));
  });
  updateAll();
  observeChapters();
  jumpToHash();
  observeLazy();

  indexList.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-key]');
    if (link) setActive(link.getAttribute('data-key'));
  });

  document.addEventListener('arus:languagechange', function (event) {
    current = event.detail && event.detail.lang === 'en' ? 'en' : 'id';
    updateAll();
  });

  var nav = document.querySelector('.nav');
  function onScroll() {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var menuBtn = document.getElementById('menu-btn');
  var menu = document.getElementById('mobile-menu');
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
})();
