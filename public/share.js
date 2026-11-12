(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const words = {
    id: {
      skip: 'Langsung ke file', local: 'Berbagi lokal', eyebrow: 'DARI PC INI',
      title: 'Unduhanmu', intro: 'Jelajahi folder, lihat foto, putar video, dan simpan file ke perangkat ini.',
      folder: 'Folder', folders: 'folder', file: 'file', files: 'file', match: 'cocok', matches: 'cocok', itemsLabel: 'Isi folder', pathLabel: 'Lokasi folder', languageLabel: 'Bahasa',
      all: 'Semua file', video: 'Video', audio: 'Audio', image: 'Gambar', other: 'Lainnya',
      search: 'Cari di folder ini', type: 'Jenis file', refresh: 'Muat ulang', retry: 'Coba lagi', clearFilters: 'Hapus filter',
      emptyFolder: 'Folder ini masih kosong.', emptySearch: 'Tidak ada yang cocok dengan pencarian ini.',
      truncated: 'Folder ini berisi lebih dari 1.000 item. Yang ditampilkan hanya 1.000 pertama.',
      noticeTitle: 'Hanya di jaringan yang kamu percaya.',
      notice: 'Tautan ini membuka folder Unduhan di PC. Jangan bagikan ke orang lain. Koneksi lokal memakai HTTP, bukan koneksi terenkripsi. Biarkan PC menyala dan Arus tetap berjalan.',
      footer: 'File tetap di PC. Pemilik PC yang mengatur akses.', codec: 'Pemutaran tergantung browser ini. Arus tidak mengubah format video.',
      mediaError: 'Browser ini tidak bisa memutar format tersebut, atau file sudah tidak tersedia. Unduh lalu buka di pemutar yang sesuai.',
      watch: 'Tonton', listen: 'Dengarkan', view: 'Lihat', download: 'Unduh', close: 'Tutup', previous: 'File sebelumnya', next: 'File berikutnya',
      connecting: 'Menghubungkan ke PC...', connected: 'Terhubung langsung ke PC.',
      unauthorized: 'Akses sudah berakhir. Buka tautan terbaru atau pindai QR dari Arus lagi.',
      offline: 'Tidak dapat terhubung ke PC. Berbagi mungkin sudah dihentikan pemilik, atau PC tidak menyala dan tidak berada di jaringan yang sama.',
      failure: 'Folder ini belum bisa dimuat. Coba lagi sebentar.',
      expires: 'Akses berakhir {time}, atau saat pemilik menghentikan berbagi.',
      always: 'Tanpa batas waktu. Pemilik bisa menghentikan berbagi kapan saja.',
      passwordLabel: 'Password dari pemilik PC', passwordHint: 'Tautan ini dilindungi password. Masukkan password yang diberikan terpisah oleh pemilik PC.',
      unlock: 'Buka akses', passwordNeeded: 'Tautan ini memerlukan password.', wrongPassword: 'Password belum cocok. Periksa dan coba lagi.',
      rateLimited: 'Terlalu banyak percobaan. Tunggu satu menit sebelum mencoba lagi.'
    },
    en: {
      skip: 'Skip to files', local: 'Local library', eyebrow: 'FROM THIS PC',
      title: 'Your Downloads', intro: 'Browse folders, view photos, play videos, and save files to this device.',
      folder: 'Folder', folders: 'folders', file: 'file', files: 'files', match: 'match', matches: 'matches', itemsLabel: 'Folder contents', pathLabel: 'Folder path', languageLabel: 'Language',
      all: 'All files', video: 'Video', audio: 'Audio', image: 'Images', other: 'Other',
      search: 'Search this folder', type: 'File type', refresh: 'Refresh', retry: 'Try again', clearFilters: 'Clear filters',
      emptyFolder: 'This folder is empty.', emptySearch: 'Nothing matches this search.',
      truncated: 'This folder has more than 1,000 items. The first 1,000 are shown.',
      noticeTitle: 'Only on a network you trust.',
      notice: 'This link opens the Downloads folder on the PC. Do not share it with others. The local connection uses HTTP, not encryption. Keep the PC awake and Arus running.',
      footer: 'Files stay on the PC. The owner controls access.', codec: 'Playback depends on this browser. Arus does not convert video.',
      mediaError: 'This browser cannot play the format, or the file is no longer available. Download it and open it in a compatible player.',
      watch: 'Watch', listen: 'Listen', view: 'View', download: 'Download', close: 'Close', previous: 'Previous file', next: 'Next file',
      connecting: 'Connecting to the PC...', connected: 'Connected directly to the PC.',
      unauthorized: 'Access has ended. Open a fresh link or scan the QR from Arus again.',
      offline: 'Could not reach the PC. Sharing may have been stopped by the owner, or the PC is asleep and off this network.',
      failure: 'This folder could not be loaded. Try again in a moment.',
      expires: 'Access ends {time}, or when the owner stops sharing.',
      always: 'No time limit. The owner can stop sharing at any time.',
      passwordLabel: 'Password from the PC owner', passwordHint: 'This link is password protected. Enter the password provided separately by the PC owner.',
      unlock: 'Unlock access', passwordNeeded: 'This link needs a password.', wrongPassword: 'That password does not match. Check it and try again.',
      rateLimited: 'Too many attempts. Wait one minute before trying again.'
    }
  };

  let lang = navigator.language && navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en';
  try {
    const saved = localStorage.getItem('arus.share.lang');
    if (saved === 'id' || saved === 'en') lang = saved;
  } catch { /* storage can be blocked */ }
  if (!words[lang]) lang = 'id';

  let files = [];
  let folders = [];
  let rootName = '';
  let path = new URL(location.href).searchParams.get('path') || '';
  let parent = null;
  let truncated = false;
  let expiresAt = null;
  let connection = 'connecting';
  let loaded = false;
  let busy = false;
  let awaitingPassword = false;
  let passwordError = '';
  let token = location.hash.slice(1);
  let lastSignature = '';
  let viewerList = [];
  let viewerIndex = -1;
  let pendingPath = null;

  try {
    if (token) sessionStorage.setItem('arus.share.token', token);
    else token = sessionStorage.getItem('arus.share.token') || '';
  } catch { /* storage can be blocked */ }

  if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);

  const locale = () => (lang === 'id' ? 'id-ID' : 'en-US');
  const t = (key) => words[lang][key] || words.en[key] || key;
  const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function formatSize(value) {
    if (!value || !Number.isFinite(value)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
    return `${(value / (1024 ** index)).toLocaleString(locale(), { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTime(value) {
    return new Date(value).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
  }

  function typeLabel(file) {
    return t(file.mediaType === 'file' ? 'other' : file.mediaType);
  }

  function fileUrl(file, download = false) {
    return `/files/${encodeURIComponent(file.id)}${download ? '?download=1' : ''}`;
  }

  function urlForPath(value) {
    const url = new URL(location.href);
    url.hash = '';
    if (value) url.searchParams.set('path', value);
    else url.searchParams.delete('path');
    return url;
  }

  function currentFolderName() {
    const parts = path.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : t('title');
  }

  function query() {
    return $('search').value.trim().toLocaleLowerCase(locale());
  }

  function typeFilter() {
    return $('type').value;
  }

  function filtering() {
    return Boolean(query()) || typeFilter() !== 'all';
  }

  function visibleFolders() {
    if (typeFilter() !== 'all') return [];
    const needle = query();
    return folders.filter((folder) => !needle || folder.name.toLocaleLowerCase(locale()).includes(needle));
  }

  function visibleFiles() {
    const needle = query();
    const kind = typeFilter();
    return files.filter((file) => {
      if (needle && !file.name.toLocaleLowerCase(locale()).includes(needle)) return false;
      return kind === 'all' || file.mediaType === kind;
    });
  }

  function renderConnection() {
    const el = $('connection');
    el.hidden = connection === 'connected';
    el.dataset.state = connection === 'connecting' ? 'loading' : connection === 'connected' ? 'ok' : 'error';
    el.setAttribute('aria-busy', String(connection === 'connecting'));
    $('connection-text').textContent = t(connection);
    $('retry').hidden = connection === 'connecting' || awaitingPassword;
  }

  function renderCrumbs() {
    const nav = $('crumbs');
    nav.replaceChildren();
    const parts = path.split('/').filter(Boolean);
    const entries = [{ label: rootName || t('title'), value: '' }];
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      entries.push({ label: part, value: current });
    }
    entries.forEach((entry, index) => {
      const button = node('button', 'crumb', entry.label);
      button.type = 'button';
      if (index === 0) button.insertAdjacentHTML('afterbegin', icon('folder'));
      if (index === entries.length - 1) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => {
        if (entry.value !== path) navigate(entry.value);
      });
      nav.append(button);
      if (index < entries.length - 1) {
        const sep = node('span', 'crumb-sep');
        sep.innerHTML = icon('chevron');
        nav.append(sep);
      }
    });
  }

  function folderRow(folder) {
    const item = node('li', 'row row-folder');
    const link = document.createElement('a');
    link.className = 'row-main';
    link.href = urlForPath(folder.path).toString();
    link.innerHTML = `<span class="thumb">${icon('folder')}</span><span class="row-text"><span class="row-name"></span><span class="row-meta"></span></span>${icon('chevron', 'icon row-chev')}`;
    link.querySelector('.row-name').textContent = folder.name;
    link.querySelector('.row-meta').textContent = t('folder');
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(folder.path);
    });
    item.append(link);
    return item;
  }

  function fileRow(file) {
    const item = node('li', 'row row-file');
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'row-main';
    main.title = file.name;

    const thumb = node('span', 'thumb');
    if (file.mediaType === 'image') {
      const image = document.createElement('img');
      image.src = fileUrl(file);
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => { thumb.innerHTML = icon('image'); });
      thumb.append(image);
    } else {
      const name = file.mediaType === 'video' ? 'video' : file.mediaType === 'audio' ? 'audio' : 'file';
      thumb.innerHTML = icon(name);
    }

    const text = node('span', 'row-text');
    text.append(node('span', 'row-name', file.name));
    text.append(node('span', 'row-meta', [typeLabel(file), formatSize(file.size), formatDate(file.modified)].filter(Boolean).join(' · ')));

    main.append(thumb, text);
    main.addEventListener('click', () => {
      if (file.mediaType === 'file') download(file);
      else openViewer(file);
    });

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'row-action';
    action.setAttribute('aria-label', `${t('download')}: ${file.name}`);
    action.innerHTML = icon('download');
    action.addEventListener('click', () => download(file));

    item.append(main, action);
    return item;
  }

  function renderList() {
    const list = $('items');
    list.replaceChildren();
    const visibleFolderList = visibleFolders();
    const visibleFileList = visibleFiles();
    const fragment = document.createDocumentFragment();
    for (const folder of visibleFolderList) fragment.append(folderRow(folder));
    for (const file of visibleFileList) fragment.append(fileRow(file));
    list.append(fragment);

    const empty = visibleFolderList.length + visibleFileList.length === 0;
    $('empty').hidden = !empty;
    $('empty-text').textContent = empty ? t(filtering() ? 'emptySearch' : 'emptyFolder') : '';
    $('empty-reset').hidden = !empty || !filtering();
    $('truncated').hidden = !truncated;

    const folderCount = visibleFolderList.length;
    const fileCount = visibleFileList.length;
    $('count').textContent = filtering()
      ? `${folderCount + fileCount} ${t(folderCount + fileCount === 1 ? 'match' : 'matches')}`
      : `${folderCount} ${t(folderCount === 1 ? 'folder' : 'folders')} · ${fileCount} ${t(fileCount === 1 ? 'file' : 'files')}`;
  }

  function renderExpiry() {
    $('expiry').textContent = !loaded ? ''
      : expiresAt ? t('expires').replace('{time}', formatTime(expiresAt)) : t('always');
  }

  function render() {
    $('folder-title').textContent = loaded ? currentFolderName() : t('title');
    renderCrumbs();
    renderList();
    renderExpiry();
    renderConnection();
  }

  function language(value) {
    lang = value;
    document.documentElement.lang = lang;
    document.title = `Arus · ${t('local')}`;
    document.querySelectorAll('[data-text]').forEach((el) => { el.textContent = t(el.dataset.text); });
    document.querySelectorAll('[data-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.placeholder); });
    document.querySelectorAll('[data-lang]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.lang === lang)));
    $('close-viewer').setAttribute('aria-label', t('close'));
    $('prev-media').setAttribute('aria-label', t('previous'));
    $('next-media').setAttribute('aria-label', t('next'));
    $('items').setAttribute('aria-label', t('itemsLabel'));
    $('crumbs').setAttribute('aria-label', t('pathLabel'));
    document.querySelector('.languages').setAttribute('aria-label', t('languageLabel'));
    $('password-status').textContent = passwordError ? t(passwordError) : '';
    $('folder-title').textContent = loaded ? currentFolderName() : t('title');
    if (loaded) render();
    else renderConnection();
    try { localStorage.setItem('arus.share.lang', lang); } catch { /* storage can be blocked */ }
  }

  async function request(target, options = {}) {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined;
    const response = await fetch(target, { cache: 'no-store', credentials: 'same-origin', signal, ...options });
    if (!response.ok) {
      const error = new Error('Request failed');
      error.status = response.status;
      const data = await response.json().catch(() => ({}));
      error.passwordRequired = data.passwordRequired === true;
      throw error;
    }
    return response;
  }

  function clearMedia() {
    const media = $('media').querySelector('video, audio');
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    $('media').replaceChildren();
  }

  function download(file) {
    const link = document.createElement('a');
    link.href = fileUrl(file, true);
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function renderViewer() {
    const file = viewerList[viewerIndex];
    if (!file) return;
    clearMedia();
    $('viewer-title').textContent = file.name;
    $('viewer-meta').textContent = [typeLabel(file), formatSize(file.size), formatDate(file.modified)].filter(Boolean).join(' · ');
    $('media-error').hidden = true;
    let media;
    if (file.mediaType === 'image') {
      media = document.createElement('img');
      media.alt = file.name;
    } else {
      media = document.createElement(file.mediaType);
      media.controls = true;
      media.preload = 'metadata';
      if (file.mediaType === 'video') media.setAttribute('playsinline', '');
      media.setAttribute('aria-label', file.name);
    }
    media.src = fileUrl(file);
    media.addEventListener('error', () => { $('media-error').hidden = false; });
    $('media').append(media);
    const target = $('viewer-download');
    target.href = fileUrl(file, true);
    target.download = file.name;
    $('prev-media').disabled = viewerIndex <= 0;
    $('next-media').disabled = viewerIndex >= viewerList.length - 1;
  }

  function openViewer(file) {
    viewerList = visibleFiles().filter((entry) => entry.mediaType !== 'file');
    viewerIndex = viewerList.findIndex((entry) => entry.id === file.id);
    if (viewerIndex < 0) return;
    renderViewer();
    $('viewer').showModal();
    document.body.classList.add('viewer-open');
    $('close-viewer').focus();
  }

  function stepViewer(delta) {
    const target = viewerIndex + delta;
    if (target < 0 || target >= viewerList.length) return;
    viewerIndex = target;
    renderViewer();
    if (delta < 0 && $('prev-media').disabled) $('next-media').focus();
    if (delta > 0 && $('next-media').disabled) $('prev-media').focus();
  }

  function navigate(next) {
    history.pushState({ path: next }, '', urlForPath(next));
    path = next;
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (busy) {
      pendingPath = next;
      return;
    }
    refresh();
  }

  async function refresh(silent = false) {
    if (busy) return;
    busy = true;
    if (!silent) {
      $('items').setAttribute('aria-busy', 'true');
      $('refresh').disabled = true;
    }
    try {
      if (token) {
        await request('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password: $('password').value })
        });
        token = '';
        try { sessionStorage.removeItem('arus.share.token'); } catch { /* storage can be blocked */ }
        $('password').value = '';
        awaitingPassword = false;
        passwordError = '';
        $('password-status').textContent = '';
        $('password-form').hidden = true;
      }
      const response = await request(`/api/files${path ? `?path=${encodeURIComponent(path)}` : ''}`);
      const data = await response.json();
      folders = Array.isArray(data.folders) ? data.folders : [];
      files = Array.isArray(data.files) ? data.files : [];
      if (data.mode === 'folder') {
        if (typeof data.root === 'string' && data.root) rootName = data.root;
        path = typeof data.path === 'string' ? data.path : path;
        parent = typeof data.parent === 'string' ? data.parent : null;
        truncated = data.truncated === true;
      } else {
        rootName = rootName || t('title');
        truncated = false;
      }
      expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : null;
      connection = 'connected';
      loaded = true;
      awaitingPassword = false;
      $('file-section').hidden = false;
      $('password-form').hidden = true;

      const signature = JSON.stringify([path, rootName, truncated, expiresAt, folders, files.map((file) => [file.id, file.size, file.modified])]);
      if (!silent || signature !== lastSignature) {
        lastSignature = signature;
        render();
      } else {
        renderConnection();
      }
    } catch (error) {
      const status = error.status;
      const revoked = status === 401 || status === 403 || status === 410;
      if (silent && !revoked) {
        renderConnection();
        return;
      }
      files = [];
      folders = [];
      expiresAt = null;
      truncated = false;
      if (revoked || status === 404) connection = 'unauthorized';
      else if (status === 429) connection = 'rateLimited';
      else if (status) connection = 'failure';
      else connection = 'offline';

      const passwordGate = Boolean(token) && (error.passwordRequired === true || (awaitingPassword && status === 429));
      if (passwordGate) {
        awaitingPassword = true;
        connection = status === 429 ? 'rateLimited' : 'passwordNeeded';
        passwordError = status === 429 ? 'rateLimited' : ($('password').value ? 'wrongPassword' : '');
        $('password-form').hidden = false;
        $('password-status').textContent = passwordError ? t(passwordError) : '';
        $('file-section').hidden = true;
        $('password').focus();
      }
      $('count').textContent = '';
      $('expiry').textContent = '';
      $('items').replaceChildren();
      $('empty').hidden = false;
      $('empty-reset').hidden = true;
      $('empty-text').textContent = t(
        connection === 'unauthorized' ? 'unauthorized'
          : connection === 'rateLimited' ? 'rateLimited'
            : connection === 'offline' ? 'offline'
              : 'failure'
      );
      if ($('viewer').open) $('viewer').close();
      renderCrumbs();
      renderConnection();
      if (!awaitingPassword) $('folder-title').textContent = loaded ? currentFolderName() : t('title');
      lastSignature = '';
    } finally {
      busy = false;
      $('items').removeAttribute('aria-busy');
      $('refresh').disabled = false;
      renderConnection();
      if (pendingPath !== null && !awaitingPassword) {
        path = pendingPath;
        pendingPath = null;
        refresh();
      } else if (awaitingPassword) {
        pendingPath = null;
      }
    }
  }

  $('password-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if ($('password-form').reportValidity()) refresh();
  });
  $('retry').addEventListener('click', () => refresh());
  $('refresh').addEventListener('click', () => refresh());
  $('search').addEventListener('input', renderList);
  $('type').addEventListener('change', renderList);
  $('empty-reset').addEventListener('click', () => {
    $('search').value = '';
    $('type').value = 'all';
    renderList();
    $('search').focus();
  });

  $('close-viewer').addEventListener('click', () => $('viewer').close());
  $('viewer').addEventListener('close', () => {
    clearMedia();
    document.body.classList.remove('viewer-open');
    viewerList = [];
    viewerIndex = -1;
  });
  $('prev-media').addEventListener('click', () => stepViewer(-1));
  $('next-media').addEventListener('click', () => stepViewer(1));
  $('viewer').addEventListener('click', (event) => {
    if (event.target === $('viewer')) $('viewer').close();
  });
  document.addEventListener('keydown', (event) => {
    if (!$('viewer').open) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); stepViewer(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); stepViewer(1); }
  });

  document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => language(button.dataset.lang));
  });

  window.addEventListener('popstate', () => {
    path = new URL(location.href).searchParams.get('path') || '';
    refresh();
  });

  window.addEventListener('pagehide', () => {
    $('password').value = '';
    clearMedia();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !awaitingPassword && !token && !busy && !$('viewer').open) refresh(true);
  });

  setInterval(() => {
    if (!document.hidden && !awaitingPassword && !token && !busy && loaded && !$('viewer').open) refresh(true);
  }, 20000);

  language(lang);
  refresh();
})();
