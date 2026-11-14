'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const svgNS = 'http://www.w3.org/2000/svg';
  const MEDIA_URL_RE = /\.(mp4|webm|mkv|mov|m4v|avi|ts|flv|wmv|mpg|mpeg|mp3|m4a|aac|flac|ogg|wav|opus|wma|m3u8|mpd)(?:[?#]|$)/i;
  const FILE_URL_RE = /\.(zip|rar|7z|tar|gz|bz2|xz|iso|cab|exe|msi|dmg|pkg|deb|rpm|apk|appx|msix|pdf|docx?|xlsx?|pptx?|epub|csv|txt|rtf|torrent)(?:[?#]|$)/i;
  const REPO_URL = 'https://github.com/arielbudinex-oss/Arus-Download-Manager';
  const DISCORD_URL = 'https://discord.gg/K84ebNFJV';
  const SETUP_KEY = 'arus.setup.v1';
  const SUPPORT_KEY = 'arus.support.v1';
  const UPDATE_NOTICE_KEY = 'arus.updateNotice.v1';
  const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const SITE_URL = 'https://arus.xinet.id';
  const REPORT_ENDPOINT = `${SITE_URL}/api/report`;
  const REPORT_LOG_LIMIT = 60;
  const REPORT_LOGS = [];

  function redactReportText(value) {
    let text = String(value ?? '');
    text = text.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '<link>');
    text = text.replace(/\b[A-Za-z]:\\[^"'\r\n<>|]+/g, '<path>');
    text = text.replace(/\/(?:Users|home)\/[^"'\r\n<>|]+/g, '<path>');
    text = text.replace(/([?&][^=&\s]+)=[^&\s"'#]+/g, '$1=<redacted>');
    text = text.replace(/\s+/g, ' ').trim();
    return text.slice(0, 400);
  }

  function pushReportLog(level, message) {
    try {
      const text = redactReportText(message);
      if (!text) return;
      REPORT_LOGS.push({ level, at: new Date().toISOString(), message: text });
      if (REPORT_LOGS.length > REPORT_LOG_LIMIT) {
        REPORT_LOGS.splice(0, REPORT_LOGS.length - REPORT_LOG_LIMIT);
      }
    } catch {
      /* logging must never break the UI */
    }
  }

  const nativeConsoleError = console.error.bind(console);
  console.error = (...args) => {
    pushReportLog('error', args.map((item) => (item instanceof Error ? item.message : String(item))).join(' '));
    nativeConsoleError(...args);
  };
  window.addEventListener('error', (event) => {
    const file = String(event.filename || '').split('/').pop();
    pushReportLog('error', `${event.message || 'Script error'}${file ? ` (${file}:${event.lineno || 0})` : ''}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    pushReportLog('error', `Unhandled rejection: ${reason?.message || reason || 'unknown'}`);
  });

  const LIBRARY = [
    { id: 'all', label: 'All downloads', icon: 'i-globe' },
    { id: 'active', label: 'Active', icon: 'i-play' },
    { id: 'scheduled', label: 'Scheduled', icon: 'i-clock' },
    { id: 'completed', label: 'Completed', icon: 'i-check' },
    { id: 'paused', label: 'Paused', icon: 'i-pause' },
    { id: 'failed', label: 'Failed', icon: 'i-alert' }
  ];

  const TYPES = [
    { id: 'video', label: 'Video', icon: 'i-video' },
    { id: 'audio', label: 'Audio', icon: 'i-audio' },
    { id: 'document', label: 'Documents', icon: 'i-doc' },
    { id: 'archive', label: 'Archives', icon: 'i-archive' },
    { id: 'program', label: 'Programs', icon: 'i-program' },
    { id: 'image', label: 'Images', icon: 'i-image' },
    { id: 'other', label: 'Other', icon: 'i-file' }
  ];

  const CATEGORY_LABEL = {
    video: 'Video',
    audio: 'Audio',
    document: 'Document',
    archive: 'Archive',
    program: 'Program',
    image: 'Image',
    other: 'File'
  };

  const CATEGORY_ICON = {
    video: 'i-video',
    audio: 'i-audio',
    document: 'i-doc',
    archive: 'i-archive',
    program: 'i-program',
    image: 'i-image',
    other: 'i-file'
  };

  const STATUS_LABEL = {
    queued: 'Queued',
    downloading: 'Downloading',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Failed',
    canceled: 'Canceled'
  };

  const TAB_LABEL = {
    link: 'Add download',
    page: 'Scan page',
    batch: 'Import links'
  };

  const SOURCE_LABEL = {
    'media-tag': 'media element',
    'source-tag': 'source element',
    meta: 'page metadata',
    link: 'page link',
    markup: 'page markup',
    script: 'script data',
    json: 'structured data',
    direct: 'direct URL'
  };

  const state = {
    data: null,
    meta: null,
    filter: 'all',
    query: '',
    selectedId: null,
    tab: 'link',
    busy: false,
    previewTheme: null,
    settingsSaved: false,
    settingsTab: 'downloads',
    previewAppearance: null,
    confirmAction: null,
    spark: new Map(),
    segmentSigs: new Map(),
    speedHistory: [],
    lastSpeedAt: 0,
    metricSig: '',
    slotSig: '',
    lastSynced: '',
    lastClipboard: '',
    source: null,
    setupPoll: 0,
    supportAmount: 25000,
    update: {
      status: 'idle',
      latest: '',
      available: false,
      url: '',
      error: '',
      checkedAt: 0
    }
  };

  const LIST_GROUPS = [
    { id: 'downloading', label: 'Downloading' },
    { id: 'queued', label: 'Queued' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'retrying', label: 'Retrying' },
    { id: 'paused', label: 'Paused' },
    { id: 'failed', label: 'Needs attention' },
    { id: 'completed', label: 'Completed' }
  ];

  const navButtons = new Map();
  const typeButtons = new Map();
  const rowEls = new Map();
  const groupEls = new Map();

  const els = {
    windowControls: $('#window-controls'),
    newDownload: $('#new-download'),
    libraryNav: $('#library-nav'),
    typeNav: $('#type-nav'),
    globalSpeed: $('#global-speed'),
    liveDot: $('#live-dot'),
    liveSpeed: $('.live-speed'),
    settingsBtn: $('#settings-btn'),
    supportBtn: $('#support-btn'),
    aboutBtn: $('#about-btn'),
    privacyBtn: $('#privacy-btn'),
    search: $('#search'),
    pauseAll: $('#pause-all'),
    resumeAll: $('#resume-all'),
    clearHistory: $('#clear-history'),
    openFolder: $('#open-folder'),
    addBtn: $('#add-btn'),
    viewTitle: $('#view-title'),
    viewSub: $('#view-sub'),
    statActive: $('#stat-active'),
    statSpeed: $('#stat-speed'),
    statLimit: $('#stat-limit'),
    statLimitSep: $('#stat-limit-sep'),
    metricSpeed: $('#metric-speed'),
    metricLive: $('#metric-live'),
    metricSpark: $('#metric-spark'),
    metricSpeedSub: $('#metric-speed-sub'),
    metricPeak: $('#metric-peak'),
    metricCap: $('#metric-cap'),
    metricActive: $('#metric-active'),
    metricSlots: $('#metric-slots'),
    metricQueueSub: $('#metric-queue-sub'),
    metricSlotsLabel: $('#metric-slots-label'),
    queueRunning: $('#queue-running'),
    queueWaiting: $('#queue-waiting'),
    queuePaused: $('#queue-paused'),
    metricCompleted: $('#metric-completed'),
    metricCompletedSub: $('#metric-completed-sub'),
    metricLibrarySize: $('#metric-library-size'),
    metricLifetime: $('#metric-lifetime'),
    metricSuccess: $('#metric-success'),
    metricScheduled: $('#metric-scheduled'),
    metricNext: $('#metric-next'),
    metricTotal: $('#metric-total'),
    sideQueue: $('#side-queue'),
    sideBarFill: $('#side-bar-fill'),
    sideActive: $('#side-active'),
    sideWaiting: $('#side-waiting'),
    detailRing: $('#detail-ring'),
    detailRingFill: $('#detail-ring-fill'),
    detailLiveSpeed: $('#detail-live-speed'),
    detailLiveEta: $('#detail-live-eta'),
    detailPriority: $('#detail-priority'),
    detailSpeedCap: $('#detail-speed-cap'),
    detailStart: $('#detail-start'),
    detailAgain: $('#detail-again'),
    detailQueueNote: $('#detail-queue-note'),
    listHead: $('.list-head'),
    list: $('#list'),
    empty: $('#empty'),
    emptyTitle: $('#empty-title'),
    emptyText: $('#empty-text'),
    emptyEyebrow: $('#empty-eyebrow'),
    emptySteps: $('#empty-steps'),
    emptyFeatures: $('#empty-features'),
    emptyAdd: $('#empty-add'),
    emptyScan: $('#empty-scan'),
    emptyBatch: $('#empty-batch'),
    inspector: $('#inspector'),
    detailName: $('#detail-name'),
    detailHost: $('#detail-host'),
    detailClose: $('#detail-close'),
    detailIcon: $('#detail-icon'),
    detailStatus: $('#detail-status'),
    detailPercent: $('#detail-percent'),
    detailMeter: $('#detail-meter'),
    detailMeterFill: $('#detail-meter-fill'),
    detailNote: $('#detail-note'),
    detailSpark: $('#detail-spark'),
    detailSparkValue: $('#detail-spark-value'),
    detailToggle: $('#detail-toggle'),
    detailCancel: $('#detail-cancel'),
    detailOpen: $('#detail-open'),
    detailFolder: $('#detail-folder'),
    detailSize: $('#detail-size'),
    detailReceived: $('#detail-received'),
    detailSpeed: $('#detail-speed'),
    detailEta: $('#detail-eta'),
    detailConnections: $('#detail-connections'),
    detailKind: $('#detail-kind'),
    detailSegments: $('#detail-segments'),
    detailSegmentNote: $('#detail-segment-note'),
    detailUrl: $('#detail-url'),
    detailCopy: $('#detail-copy'),
    detailHashBlock: $('#detail-hash-block'),
    detailHash: $('#detail-hash'),
    detailHashBtn: $('#detail-hash-btn'),
    detailHashNote: $('#detail-hash-note'),
    detailPath: $('#detail-path'),
    detailError: $('#detail-error'),
    detailRemove: $('#detail-remove'),
    drop: $('#drop'),
    addDialog: $('#add-dialog'),
    addForm: $('#add-form'),
    addUrl: $('#add-url'),
    addName: $('#add-name'),
    addConnections: $('#add-connections'),
    addStart: $('#add-start'),
    addPriority: $('#add-priority'),
    addSpeed: $('#add-speed'),
    addFolder: $('#add-folder'),
    addBrowse: $('#add-browse'),
    batchUrls: $('#batch-urls'),
    batchFolder: $('#batch-folder'),
    batchBrowse: $('#batch-browse'),
    batchConnections: $('#batch-connections'),
    batchStatus: $('#batch-status'),
    addSubmit: $('#add-submit'),
    addNote: $('#add-dialog .form-note'),
    scanUrl: $('#scan-url'),
    scanBtn: $('#scan-btn'),
    scanStatus: $('#scan-status'),
    scanResults: $('#scan-results'),
    settingsDialog: $('#settings-dialog'),
    settingsForm: $('#settings-form'),
    setFolder: $('#set-folder'),
    setBrowse: $('#set-browse'),
    setMax: $('#set-max'),
    setConnections: $('#set-connections'),
    setSpeed: $('#set-speed'),
    setRetry: $('#set-retry'),
    setOrganize: $('#set-organize'),
    setLifetimeBytes: $('#set-lifetime-bytes'),
    setLifetimeCount: $('#set-lifetime-count'),
    setLifetimeFailed: $('#set-lifetime-failed'),
    setLifetimeSince: $('#set-lifetime-since'),
    setClipboard: $('#set-clipboard'),
    setNotifications: $('#set-notifications'),
    setTray: $('#set-tray'),
    trayRow: $('#tray-row'),
    setLaunch: $('#set-launch'),
    launchRow: $('#launch-row'),
    setUpdates: $('#set-updates'),
    setMotion: $('#set-motion'),
    themePicker: $('#theme-picker'),
    densityPicker: $('#density-picker'),
    settingsTabs: [...document.querySelectorAll('[data-settings-tab]')],
    settingsPanels: [...document.querySelectorAll('[data-settings-panel]')],
    settingsCancel: $('#settings-cancel'),
    extStatus: $('#ext-status'),
    extStatusCopy: $('#ext-status-copy'),
    extPath: $('#ext-path'),
    openExtension: $('#open-extension'),
    extOpenBrowser: $('#ext-open-browser'),
    setupDialog: $('#setup-dialog'),
    setupExtPath: $('#setup-ext-path'),
    setupOpenBrowser: $('#setup-open-browser'),
    setupCopyPath: $('#setup-copy-path'),
    setupCheck: $('#setup-check'),
    setupSkip: $('#setup-skip'),
    setupDone: $('#setup-done'),
    setupStatus: $('#setup-status'),
    setupStatusCopy: $('#setup-status-copy'),
    supportDialog: $('#support-dialog'),
    supportAmount: $('#support-amount'),
    supportAmountHint: $('#support-amount-hint'),
    supportPresets: $('#support-presets'),
    supportQr: $('#support-qr'),
    supportQrAmount: $('#support-qr-amount'),
    updateCard: $('#update-card'),
    updateTitle: $('#update-title'),
    updateNote: $('#update-note'),
    updateCheck: $('#update-check'),
    updateDownload: $('#update-download'),
    updateDialog: $('#update-dialog'),
    updateFrom: $('#update-from'),
    updateTo: $('#update-to'),
    updateClose: $('#update-close'),
    updateLater: $('#update-later'),
    updateGo: $('#update-go'),
    aboutSupport: $('#about-support'),
    aboutGithub: $('#about-github'),
    aboutDiscord: $('#about-discord'),
    aboutVersion: $('#about-version'),
    aboutVersionRow: $('#about-version-row'),
    aboutEngine: $('#about-engine'),
    aboutFfmpeg: $('#about-ffmpeg'),
    aboutPlatform: $('#about-platform'),
    aboutData: $('#about-data'),
    aboutExtension: $('#about-extension'),
    aboutOpenData: $('#about-open-data'),
    aboutOpenExt: $('#about-open-ext'),
    aboutReport: $('#about-report'),
    aboutCopy: $('#about-copy'),
    reportDialog: $('#report-dialog'),
    reportMessage: $('#report-message'),
    reportContact: $('#report-contact'),
    reportSummary: $('#report-summary'),
    reportStatus: $('#report-status'),
    reportSend: $('#report-send'),
    reportCopy: $('#report-copy'),
    reportGithub: $('#report-github'),
    settingsSave: $('#settings-save'),
    settingsHint: $('#settings-hint'),
    confirmDialog: $('#confirm-dialog'),
    confirmTitle: $('#confirm-title'),
    confirmText: $('#confirm-text'),
    confirmDeleteRow: $('#confirm-delete-row'),
    confirmDelete: $('#confirm-delete'),
    confirmOk: $('#confirm-ok'),
    toasts: $('#toasts')
  };

  const SCAN_IDLE = 'The scanner reads the page markup for video, audio, HLS, and DASH sources.';

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function makeIcon(name, className = 'icon') {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', `#${name}`);
    svg.append(use);
    return svg;
  }

  function setIcon(container, name) {
    if (container.dataset.icon === name) return;
    container.dataset.icon = name;
    container.replaceChildren(makeIcon(name));
  }

  function downloads() {
    return state.data?.downloads || [];
  }

  function settings() {
    return state.data?.settings || { downloadDir: '', maxConcurrent: 4, connections: 16, autoRetry: 3 };
  }

  function stats() {
    return state.data?.stats || {
      active: 0,
      queued: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      scheduled: 0,
      savedBytes: 0,
      totalSpeed: 0,
      lifetime: { completed: 0, failed: 0, bytes: 0, since: Date.now() }
    };
  }

  function recordSpeedSample() {
    const now = Date.now();
    if (now - state.lastSpeedAt < 1000) return;
    state.lastSpeedAt = now;
    state.speedHistory.push(stats().totalSpeed || 0);
    while (state.speedHistory.length > 48) state.speedHistory.shift();
  }

  function renderMetricSpark() {
    if (!els.metricSpark) return;
    const values = state.speedHistory.length ? state.speedHistory : new Array(24).fill(0);
    const signature = values.join(',');
    if (state.metricSig === signature) return;
    state.metricSig = signature;
    const max = Math.max(1024, ...values);
    const width = 600;
    const height = 88;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((value, index) => {
      const x = index * step;
      const y = height - (Math.max(0, value) / max) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`).join(' ');
    const last = points[points.length - 1]?.split(',') || [];
    const dot = last.length === 2
      ? `<circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="var(--text)"></circle>`
      : '';
    els.metricSpark.innerHTML =
      `<path d="${line} L${width},${height} L0,${height} Z" fill="var(--track)" opacity="0.45"></path>` +
      `<path d="${line}" fill="none" stroke="var(--accent)" stroke-opacity="0.85" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path>` +
      dot;
  }

  function renderMetrics() {
    const currentStats = stats();
    const all = downloads();
    const maxConcurrent = Math.max(1, Number(settings().maxConcurrent) || 4);
    const lifetime = currentStats.lifetime || { completed: 0, failed: 0, bytes: 0, since: Date.now() };
    const peak = state.speedHistory.length ? Math.max(...state.speedHistory) : 0;

    els.metricSpeed.textContent = formatSpeed(currentStats.totalSpeed);
    els.metricLive.textContent = currentStats.active > 0 ? 'Live' : 'Idle';
    els.metricLive.classList.toggle('is-live', currentStats.active > 0);
    els.metricSpeedSub.textContent = currentStats.active
      ? `${currentStats.active} transfer${currentStats.active === 1 ? '' : 's'} running`
      : 'No active transfers';
    els.metricPeak.textContent = peak ? `peak ${formatSpeed(peak)}` : 'peak n/a';
    const cap = Number(settings().speedLimit) || 0;
    els.metricCap.hidden = !cap;
    els.metricCap.textContent = cap ? `${formatSpeed(cap)} cap` : '';

    els.metricActive.textContent = String(currentStats.active);
    els.metricSlotsLabel.textContent = `${maxConcurrent} slots`;
    els.queueRunning.textContent = String(currentStats.active || 0);
    const scheduled = currentStats.scheduled || 0;
    els.queueWaiting.textContent = String(Math.max(0, (currentStats.queued || 0) - scheduled));
    els.queuePaused.textContent = String(currentStats.paused || 0);

    if (state.slotSig !== `${currentStats.active}:${maxConcurrent}`) {
      state.slotSig = `${currentStats.active}:${maxConcurrent}`;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < maxConcurrent; index += 1) {
        const slot = el('span');
        if (index < currentStats.active) slot.classList.add('is-on');
        fragment.append(slot);
      }
      els.metricSlots.replaceChildren(fragment);
    }

    els.metricQueueSub.textContent = `${currentStats.queued} queued${currentStats.paused ? ` · ${currentStats.paused} paused` : ''}`;
    els.metricCompleted.textContent = String(currentStats.completed);
    els.metricCompletedSub.textContent = `${all.length} in library`;
    els.metricLibrarySize.textContent = formatBytes(currentStats.savedBytes || 0);
    els.metricLifetime.textContent = `${lifetime.completed || 0} files`;
    const attempts = (lifetime.completed || 0) + (lifetime.failed || 0);
    els.metricSuccess.textContent = attempts ? `${Math.round(((lifetime.completed || 0) / attempts) * 100)}% success` : 'n/a';
    els.metricScheduled.textContent = String(currentStats.scheduled || 0);
    const next = all
      .map((dl) => dl.startAt)
      .filter((value) => typeof value === 'number' && value > Date.now())
      .sort((a, b) => a - b)[0];
    els.metricNext.textContent = next ? formatStart(next) : '—';
    els.metricTotal.textContent = `${all.length} file${all.length === 1 ? '' : 's'}`;

    renderMetricSpark();

    document.body.classList.toggle('has-active', currentStats.active > 0);
  }

  function updateSideCard() {
    const currentStats = stats();
    const maxConcurrent = Math.max(1, Number(settings().maxConcurrent) || 4);
    els.sideQueue.textContent = `${currentStats.active} / ${maxConcurrent}`;
    els.sideBarFill.style.width = `${Math.min(100, (currentStats.active / maxConcurrent) * 100)}%`;
    els.sideActive.textContent = currentStats.active
      ? `${currentStats.active} running`
      : currentStats.queued
        ? 'Queue held'
        : 'Idle';
    els.sideWaiting.textContent = `${currentStats.queued || 0} waiting`;
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function fileNameFromUrl(url) {
    try {
      const base = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
      return base;
    } catch {
      return '';
    }
  }

  function displayName(dl) {
    return dl.filename || fileNameFromUrl(dl.url) || hostOf(dl.url) || 'Download';
  }

  function extensionOf(dl) {
    const name = dl.filename || fileNameFromUrl(dl.url);
    const match = /\.([a-z0-9]{1,8})$/i.exec(name || '');
    return match ? match[1].toLowerCase() : null;
  }

  function categoryOf(dl) {
    return dl.category || 'other';
  }

  function streamMeta(dl) {
    if (dl.kind === 'hls') return dl.hls || null;
    if (dl.kind === 'dash') return dl.dash || null;
    return null;
  }

  function isStream(dl) {
    return dl.kind === 'hls' || dl.kind === 'dash';
  }

  function streamResolution(dl) {
    if (dl.kind === 'dash') return dl.dash?.video?.resolution || null;
    return dl.hls?.variant?.resolution || null;
  }

  function iconFor(dl) {
    return CATEGORY_ICON[categoryOf(dl)] || (isStream(dl) ? 'i-video' : 'i-file');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'n/a';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unit]}`;
  }

  function formatSpeed(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B/s';
    return `${formatBytes(bytes)}/s`;
  }

  function speedText(bytes) {
    return typeof bytes === 'number' && bytes > 0 ? formatSpeed(bytes) : 'n/a';
  }

  function formatEta(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return 'n/a';
    const total = Math.round(seconds);
    if (total < 1) return '<1s';
    if (total < 60) return `${total}s`;
    if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function uiLocale() {
    return window.ArusLang ? window.ArusLang.locale : undefined;
  }

  function tt(value) {
    return window.ArusLang ? window.ArusLang.t(value) : value;
  }

  function timeAgo(timestamp) {
    if (!timestamp) return 'n/a';
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 20) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString(uiLocale(), { month: 'short', day: 'numeric' });
  }

  function isScheduled(dl) {
    return dl.status === 'queued' && typeof dl.startAt === 'number' && dl.startAt > Date.now();
  }

  function formatStart(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return 'n/a';
    const now = new Date();
    const time = date.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (date.toDateString() === now.toDateString()) return `today at ${time}`;
    if (date.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
    return date.toLocaleString(uiLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function isRetrying(dl) {
    return dl.status === 'queued' && typeof dl.retryAt === 'number' && dl.retryAt > Date.now();
  }

  function formatWait(timestamp) {
    const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
    if (seconds < 1) return 'now';
    if (seconds < 60) return `${seconds}s`;
    return `${Math.ceil(seconds / 60)}m`;
  }

  function priorityRank(dl) {
    return dl.priority === 'high' ? 2 : dl.priority === 'low' ? 0 : 1;
  }

  function priorityLabel(value) {
    return value === 'high' ? 'High' : value === 'low' ? 'Low' : 'Normal';
  }

  function nextPriority(dl) {
    if (dl.priority === 'high') return 'normal';
    if (dl.priority === 'low') return 'high';
    return 'low';
  }

  function groupIdFor(dl) {
    if (dl.status === 'downloading') return 'downloading';
    if (dl.status === 'queued') {
      if (isRetrying(dl)) return 'retrying';
      if (isScheduled(dl)) return 'scheduled';
      return 'queued';
    }
    if (dl.status === 'paused') return 'paused';
    if (dl.status === 'failed' || dl.status === 'canceled') return 'failed';
    if (dl.status === 'completed') return 'completed';
    return 'queued';
  }

  function groupMeta(id, items) {
    if (id === 'downloading') {
      const speed = items.reduce((sum, dl) => sum + (dl.speed || 0), 0);
      return speed ? formatSpeed(speed) : 'connecting';
    }
    if (id === 'queued') return items.length > 1 ? 'priority order' : 'next in line';
    if (id === 'scheduled') {
      const next = items
        .map((dl) => dl.startAt)
        .filter((value) => typeof value === 'number')
        .sort((a, b) => a - b)[0];
      return next ? `next ${formatStart(next)}` : '';
    }
    if (id === 'retrying') {
      const next = items
        .map((dl) => dl.retryAt)
        .filter((value) => typeof value === 'number')
        .sort((a, b) => a - b)[0];
      return next ? `retry in ${formatWait(next)}` : '';
    }
    if (id === 'paused') {
      const bytes = items.reduce((sum, dl) => sum + (dl.received || 0), 0);
      return bytes ? `${formatBytes(bytes)} held` : '';
    }
    if (id === 'failed') return items.length === 1 ? 'one failure' : `${items.length} failures`;
    if (id === 'completed') {
      const bytes = items.reduce((sum, dl) => sum + (dl.size || dl.received || 0), 0);
      return formatBytes(bytes);
    }
    return '';
  }

  function localInputValue(timestamp) {
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function truncate(text, max = 90) {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  }

  function percentOf(dl) {
    if (dl.status === 'completed') return 100;
    const stream = streamMeta(dl);
    if (stream?.totalSegments) {
      return Math.max(0, Math.min(100, (stream.completedSegments / stream.totalSegments) * 100));
    }
    if (typeof dl.size === 'number' && dl.size > 0) {
      const value = (dl.received / dl.size) * 100;
      if (dl.status === 'downloading') return Math.max(0, Math.min(99, value));
      return Math.max(0, Math.min(100, value));
    }
    return null;
  }

  function filterLabel(id) {
    return LIBRARY.find((entry) => entry.id === id)?.label
      || TYPES.find((entry) => entry.id === id)?.label
      || 'All downloads';
  }

  function matchesFilter(dl) {
    if (state.filter === 'all') return true;
    if (state.filter === 'active') {
      return dl.status === 'downloading' || (dl.status === 'queued' && !isScheduled(dl));
    }
    if (state.filter === 'scheduled') return isScheduled(dl);
    if (state.filter === 'completed' || state.filter === 'paused' || state.filter === 'failed') {
      return dl.status === state.filter;
    }
    return categoryOf(dl) === state.filter;
  }

  function matchesQuery(dl) {
    if (!state.query) return true;
    const haystack = `${dl.filename || ''} ${dl.url} ${dl.host || ''} ${dl.error || ''}`.toLowerCase();
    return haystack.includes(state.query.toLowerCase());
  }

  function visibleDownloads() {
    const items = downloads().filter((dl) => matchesFilter(dl) && matchesQuery(dl));
    items.sort((a, b) => {
      if (state.filter === 'active') {
        const rank = (dl) => (dl.status === 'downloading' ? 0 : 1);
        const byRank = rank(a) - rank(b);
        if (byRank) return byRank;
      }
      if (state.filter === 'completed') return (b.completedAt || 0) - (a.completedAt || 0);
      if (state.filter === 'scheduled') return (a.startAt || 0) - (b.startAt || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return items;
  }

  function findDownload(id) {
    return downloads().find((dl) => dl.id === id) || null;
  }

  function countFor(filter) {
    const all = downloads();
    if (filter === 'all') return all.length;
    if (filter === 'active') {
      return all.filter((dl) => dl.status === 'downloading' || (dl.status === 'queued' && !isScheduled(dl))).length;
    }
    if (filter === 'scheduled') return all.filter((dl) => isScheduled(dl)).length;
    if (filter === 'completed' || filter === 'paused' || filter === 'failed') {
      return all.filter((dl) => dl.status === filter).length;
    }
    return all.filter((dl) => categoryOf(dl) === filter).length;
  }

  async function api(path, { method = 'GET', body } = {}) {
    const options = { method };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, options);
    } catch (err) {
      pushReportLog('error', `Network error on ${method} ${path}: ${err.message}`);
      throw err;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      pushReportLog('error', `${method} ${path} failed with ${res.status}${data?.error ? `: ${data.error}` : ''}`);
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function refreshState() {
    const data = await api('/api/state');
    applyState(data);
    return data;
  }

  function applyTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    window.arus?.setWindowTheme?.(value !== 'light');
    try {
      localStorage.setItem('arus.theme', value);
    } catch {
      /* storage can be unavailable */
    }
    for (const button of document.querySelectorAll('.theme-option')) {
      const active = button.dataset.themeValue === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function appearanceFrom(prefs) {
    return {
      compactMode: Boolean(prefs?.compactMode),
      reduceMotion: Boolean(prefs?.reduceMotion)
    };
  }

  function applyAppearance(prefs) {
    const value = state.previewAppearance || appearanceFrom(prefs || settings());
    document.documentElement.dataset.density = value.compactMode ? 'compact' : 'comfortable';
    document.documentElement.dataset.motion = value.reduceMotion ? 'reduce' : 'full';
    if (els.densityPicker) {
      for (const button of els.densityPicker.querySelectorAll('[data-density-value]')) {
        const active = (button.dataset.densityValue === 'compact') === value.compactMode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    }
    if (els.setMotion) els.setMotion.checked = value.reduceMotion;
  }

  function settingsHintFor(tab) {
    if (tab === 'downloads' && state.meta) {
      return state.meta.ffmpeg
        ? 'ffmpeg detected · changes apply to new transfers immediately.'
        : 'ffmpeg not found · HLS saves as MPEG-TS and DASH tracks cannot be combined.';
    }
    const hints = {
      downloads: 'Changes apply to new transfers immediately.',
      behaviour: 'Preferences are stored on this PC.',
      appearance: 'Changes preview instantly and save with the dialog.',
      capture: 'After updating the extension, click Reload in chrome://extensions.',
      about: 'Arus runs entirely on this PC.',
      privacy: 'No automatic telemetry, no accounts, no cloud sync.'
    };
    return hints[tab] || 'Changes apply immediately after saving.';
  }

  function updateExtensionStatus() {
    if (!els.extStatus) return;
    const exists = Boolean(state.meta?.extensionExists);
    const connected = Boolean(state.meta?.extensionConnected);
    els.extStatus.classList.toggle('is-off', !exists);
    els.extStatus.classList.toggle('is-on', connected);
    els.extStatusCopy.textContent = !exists
      ? 'Extension folder missing'
      : connected
        ? 'Extension connected'
        : 'Extension folder ready';
    els.openExtension.disabled = !exists;
    if (els.extOpenBrowser) els.extOpenBrowser.disabled = !exists;
    if (state.meta) {
      els.extPath.textContent = state.meta.extensionPath || 'extension folder';
      els.extPath.title = state.meta.extensionPath || '';
    }
    updateSetupStatus();
  }

  function updateSetupStatus() {
    if (!els.setupStatus) return;
    const exists = Boolean(state.meta?.extensionExists);
    const connected = Boolean(state.meta?.extensionConnected);
    els.setupStatus.classList.toggle('is-off', !connected);
    els.setupStatus.classList.toggle('is-on', connected);
    if (els.setupStatusCopy) {
      els.setupStatusCopy.textContent = !exists
        ? 'Extension folder missing'
        : connected
          ? 'Extension connected'
          : 'Waiting for the extension';
    }
    if (els.setupExtPath) {
      els.setupExtPath.textContent = state.meta?.extensionPath || 'extension folder';
      els.setupExtPath.title = state.meta?.extensionPath || '';
    }
    for (const button of [els.setupOpenBrowser, els.setupCopyPath, els.setupCheck]) {
      if (button) button.disabled = !exists;
    }
  }

  function populateAbout() {
    const meta = state.meta;
    const version = meta?.version || '1.1.1';
    if (els.aboutVersion) els.aboutVersion.textContent = `v${version}`;
    if (els.aboutVersionRow) els.aboutVersionRow.textContent = version;
    if (els.aboutEngine) els.aboutEngine.textContent = meta?.engine ? `${meta.engine} · axum` : 'Rust · axum';
    if (els.aboutFfmpeg) {
      els.aboutFfmpeg.textContent = meta ? (meta.ffmpeg ? 'Detected' : 'Not found') : 'Checking…';
    }
    if (els.aboutPlatform) {
      const os = meta?.os === 'windows' ? 'Windows' : meta?.os || '';
      els.aboutPlatform.textContent = meta?.os ? `${os} · ${meta.arch || 'n/a'}` : 'n/a';
    }
    if (els.aboutData) {
      els.aboutData.textContent = meta?.dataDir || 'n/a';
      els.aboutData.title = meta?.dataDir || '';
    }
    if (els.aboutExtension) {
      els.aboutExtension.textContent = meta?.extensionPath || 'n/a';
      els.aboutExtension.title = meta?.extensionPath || '';
    }
    if (els.aboutOpenExt) els.aboutOpenExt.disabled = !meta?.extensionExists;
    renderUpdateCard();
    updateExtensionStatus();
  }

  function readStore(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage can be unavailable in locked-down webviews */
    }
  }

  async function refreshMetaQuiet() {
    try {
      state.meta = await api('/api/meta');
      updateMetaHint();
      updateExtensionStatus();
      return state.meta;
    } catch {
      return null;
    }
  }

  function startSetupPolling() {
    stopSetupPolling();
    state.setupPoll = window.setInterval(() => {
      if (els.setupDialog?.open) refreshMetaQuiet();
    }, 2500);
  }

  function stopSetupPolling() {
    if (state.setupPoll) {
      window.clearInterval(state.setupPoll);
      state.setupPoll = 0;
    }
  }

  function openSetupDialog() {
    if (!els.setupDialog || !state.meta?.extensionExists) return;
    updateExtensionStatus();
    if (!els.setupDialog.open) els.setupDialog.showModal();
    startSetupPolling();
  }

  function finishSetup(offerSupport) {
    writeStore(SETUP_KEY, 'done');
    stopSetupPolling();
    if (els.setupDialog?.open) els.setupDialog.close();
    if (offerSupport && readStore(SUPPORT_KEY) !== 'seen') {
      window.setTimeout(() => openSupportDialog(), 420);
    }
  }

  async function openExtensionBrowser() {
    try {
      const result = await api('/api/open-extension-browser', { method: 'POST' });
      toast({
        icon: 'i-check',
        title: `Extensions page opened${result?.browser ? ` in ${result.browser}` : ''}`,
        body: 'Turn on Developer mode, then choose Load unpacked.',
        timeout: 7000
      });
    } catch (err) {
      toast({ icon: 'i-alert', title: 'Could not open a browser', body: err.message, timeout: 6000 });
    }
  }

  async function copyExtensionPath() {
    const path = state.meta?.extensionPath;
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      toast({ icon: 'i-copy', title: 'Extension path copied', timeout: 2400 });
    } catch {
      toast({ icon: 'i-alert', title: 'Could not copy the path' });
    }
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID').format(Math.round(Number(value) || 0));
  }

  function markSupportPresets(amount) {
    if (!els.supportPresets) return;
    for (const button of els.supportPresets.querySelectorAll('[data-amount]')) {
      button.classList.toggle('is-active', Number(button.dataset.amount) === amount);
    }
  }

  function renderSupportQr(amount) {
    if (!els.supportQr) return;
    if (!window.ArusQris) {
      els.supportQr.textContent = 'QRIS is not available';
      return;
    }
    try {
      window.ArusQris.render(els.supportQr, amount);
      if (els.supportQrAmount) els.supportQrAmount.textContent = `Rp ${formatRupiah(amount)}`;
    } catch {
      els.supportQr.textContent = 'QRIS is not available';
    }
  }

  function setSupportAmount(value, options = {}) {
    const amount = Math.round(Number(value) || 0);
    if (options.write !== false && els.supportAmount) {
      els.supportAmount.value = amount > 0 ? formatRupiah(amount) : '';
    }
    markSupportPresets(amount);
    if (!els.supportAmountHint) return;
    if (!window.ArusQris) {
      els.supportAmountHint.textContent = 'QRIS is not available in this build.';
      els.supportAmountHint.classList.add('is-error');
      return;
    }
    if (amount < window.ArusQris.min) {
      els.supportAmountHint.textContent = 'Minimum is Rp 1.000.';
      els.supportAmountHint.classList.add('is-error');
      return;
    }
    if (amount > window.ArusQris.max) {
      els.supportAmountHint.textContent = 'Maximum is Rp 50.000.000.';
      els.supportAmountHint.classList.add('is-error');
      return;
    }
    els.supportAmountHint.textContent = 'Any amount from Rp 1.000. The QR updates as you type.';
    els.supportAmountHint.classList.remove('is-error');
    state.supportAmount = amount;
    renderSupportQr(amount);
  }

  function openSupportDialog() {
    if (!els.supportDialog) return;
    writeStore(SUPPORT_KEY, 'seen');
    setSupportAmount(state.supportAmount || 25000);
    if (!els.supportDialog.open) els.supportDialog.showModal();
  }

  async function openExternal(url) {
    if (!url) return;
    try {
      await api('/api/open-url', { method: 'POST', body: { url } });
    } catch (err) {
      toast({ icon: 'i-alert', title: 'Could not open the link', body: err.message, timeout: 6000 });
    }
  }

  function formatCheckedAt(timestamp) {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function renderUpdateCard() {
    if (!els.updateTitle || !els.updateNote) return;
    const info = state.update;
    const current = state.meta?.version || '1.1.1';
    if (els.updateDownload) els.updateDownload.hidden = true;
    if (els.updateCheck) {
      els.updateCheck.hidden = false;
      els.updateCheck.disabled = info.status === 'loading';
      els.updateCheck.textContent = info.status === 'error' ? 'Try again' : info.status === 'done' ? 'Check again' : 'Check now';
    }
    if (info.status === 'loading') {
      els.updateTitle.textContent = 'Checking for updates';
      els.updateNote.textContent = 'Asking GitHub for the latest release.';
      return;
    }
    if (info.status === 'error' || (info.status === 'done' && info.error)) {
      els.updateTitle.textContent = 'Could not check for updates';
      els.updateNote.textContent = info.error || 'The release feed is unreachable right now.';
      return;
    }
    if (info.status === 'done' && info.available) {
      els.updateTitle.textContent = `Arus ${info.latest} is available`;
      els.updateNote.textContent = `You are on ${current}. Download the new installer from the Arus website.`;
      if (els.updateDownload) els.updateDownload.hidden = false;
      if (els.updateCheck) els.updateCheck.hidden = true;
      return;
    }
    if (info.status === 'done') {
      els.updateTitle.textContent = 'Arus is up to date';
      const time = formatCheckedAt(info.checkedAt);
      els.updateNote.textContent = `Version ${current} is the latest.${time ? ` Checked at ${time}.` : ''}`;
      return;
    }
    els.updateTitle.textContent = 'Not checked yet';
    els.updateNote.textContent = 'Arus can ask GitHub for newer releases at launch and every few hours while it runs.';
  }

  function dialogsBusy() {
    return [...document.querySelectorAll('dialog')].some((dialog) => dialog.open && dialog !== els.updateDialog);
  }

  function showUpdateDialog(info, options = {}) {
    if (!els.updateDialog || !info.latest) return;
    if (els.updateDialog.open) return;
    if (!options.force && readStore(UPDATE_NOTICE_KEY) === info.latest) return;
    if (dialogsBusy()) {
      const busy = [...document.querySelectorAll('dialog')].find((dialog) => dialog.open && dialog !== els.updateDialog);
      if (!busy || busy.dataset.updateWait === '1') return;
      busy.dataset.updateWait = '1';
      busy.addEventListener('close', () => {
        delete busy.dataset.updateWait;
        showUpdateDialog(info, { ...options, force: true });
      }, { once: true });
      return;
    }
    writeStore(UPDATE_NOTICE_KEY, info.latest);
    if (els.updateFrom) els.updateFrom.textContent = info.current || state.meta?.version || '';
    if (els.updateTo) els.updateTo.textContent = info.latest;
    els.updateDialog.showModal();
  }

  function closeUpdateDialog() {
    if (els.updateDialog?.open) els.updateDialog.close();
  }

  function openUpdateRelease() {
    closeUpdateDialog();
    openExternal(`${SITE_URL}/`);
  }

  async function checkForUpdates(options = {}) {
    if (state.update.status === 'loading') return;
    state.update = { ...state.update, status: 'loading' };
    renderUpdateCard();
    try {
      const result = await api(options.refresh ? '/api/update-check?refresh=1' : '/api/update-check');
      state.update = {
        status: 'done',
        latest: result.latest || '',
        available: Boolean(result.available),
        url: result.url || `${REPO_URL}/releases/latest`,
        error: result.error || '',
        checkedAt: result.checkedAt || Date.now()
      };
      renderUpdateCard();
      if (result.error) {
        if (!options.silent) {
          toast({ icon: 'i-alert', title: 'Could not check for updates', body: result.error, timeout: 6000 });
        }
      } else if (result.available) {
        if (options.silent && document.hidden && window.arus?.isDesktop && readStore(UPDATE_NOTICE_KEY) !== result.latest) {
          const say = window.ArusLang?.t || ((value) => value);
          window.arus.notify(
            say('Arus update available'),
            say(`Version ${result.latest} is ready. Open Arus to download it.`)
          );
        }
        showUpdateDialog(
          {
            latest: result.latest || '',
            current: result.current || state.meta?.version || '',
            url: state.update.url
          },
          { force: !options.silent }
        );
      } else if (!options.silent) {
        toast({
          icon: 'i-check',
          title: 'Arus is up to date',
          body: `Version ${result.current || state.meta?.version || ''} is the latest.`,
          timeout: 3200
        });
      }
    } catch (err) {
      state.update = { ...state.update, status: 'error', error: err.message };
      renderUpdateCard();
      if (!options.silent) {
        toast({ icon: 'i-alert', title: 'Could not check for updates', body: err.message, timeout: 6000 });
      }
    } finally {
      if (els.updateCheck) els.updateCheck.disabled = false;
    }
  }

  function scheduleUpdateCheck() {
    if (state.data?.settings?.checkUpdates === false) return;
    window.setTimeout(() => {
      if (state.data?.settings?.checkUpdates === false) return;
      if (state.update.status === 'idle') checkForUpdates({ silent: true });
    }, 3200);
    window.setInterval(() => {
      if (state.data?.settings?.checkUpdates === false) return;
      if (state.update.status === 'loading') return;
      checkForUpdates({ silent: true });
    }, UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (state.data?.settings?.checkUpdates === false) return;
      if (state.update.status === 'loading') return;
      if (Date.now() - (state.update.checkedAt || 0) < UPDATE_INTERVAL_MS) return;
      checkForUpdates({ silent: true });
    });
  }

  function maybeFirstRun() {
    if (!window.arus?.isDesktop) return;
    if (readStore(SETUP_KEY) === 'done') return;
    if (!state.meta?.extensionExists) return;
    if (state.meta.extensionConnected) {
      writeStore(SETUP_KEY, 'done');
      return;
    }
    window.setTimeout(() => {
      if (readStore(SETUP_KEY) !== 'done') openSetupDialog();
    }, 700);
  }

  function selectSettingsTab(tab) {
    const next = ['downloads', 'behaviour', 'appearance', 'capture', 'about', 'privacy'].includes(tab)
      ? tab
      : 'downloads';
    state.settingsTab = next;
    for (const button of els.settingsTabs) {
      const active = button.dataset.settingsTab === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of els.settingsPanels) {
      panel.hidden = panel.dataset.settingsPanel !== next;
      panel.classList.toggle('is-active', !panel.hidden);
    }
    const editable = next === 'downloads' || next === 'behaviour' || next === 'appearance';
    els.settingsSave.hidden = !editable;
    els.settingsCancel.textContent = editable ? 'Cancel' : 'Close';
    if (els.settingsHint) els.settingsHint.textContent = settingsHintFor(next);
    if (next === 'about') populateAbout();
    if (next === 'capture') {
      updateExtensionStatus();
      refreshMetaQuiet();
    }
  }

  async function copyDiagnostics() {
    const meta = state.meta || {};
    const lines = [
      `Arus ${meta.version || ''}`.trim(),
      `Engine: ${meta.engine || 'Rust'} / axum`,
      `FFmpeg: ${meta.ffmpeg ? 'detected' : 'not found'}`,
      `Platform: ${[meta.os, meta.arch].filter(Boolean).join(' ') || 'unknown'}`,
      `Data folder: ${meta.dataDir || 'unknown'}`,
      `Extension: ${meta.extensionPath || 'unknown'}`,
      `Downloads: ${settings().downloadDir || 'unknown'}`
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({ icon: 'i-copy', title: 'Diagnostics copied', timeout: 2400 });
    } catch {
      toast({ icon: 'i-alert', title: 'Could not copy diagnostics' });
    }
  }

  function collectReportDiagnostics() {
    const meta = state.meta || {};
    const prefs = settings();
    const all = downloads();
    const count = (status) => all.filter((dl) => dl.status === status).length;
    return {
      app: {
        version: meta.version || '',
        engine: meta.engine || 'Rust',
        shell: 'Tauri',
        channel: 'stable'
      },
      system: {
        os: meta.os || '',
        arch: meta.arch || '',
        ffmpeg: Boolean(meta.ffmpeg),
        webview: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      },
      settings: {
        theme: prefs.theme || 'dark',
        compactMode: Boolean(prefs.compactMode),
        reduceMotion: Boolean(prefs.reduceMotion),
        maxConcurrent: prefs.maxConcurrent,
        connections: prefs.connections,
        speedLimit: prefs.speedLimit,
        autoRetry: prefs.autoRetry,
        organizeByCategory: Boolean(prefs.organizeByCategory),
        clipboardWatch: Boolean(prefs.clipboardWatch),
        notifications: Boolean(prefs.notifications),
        minimizeToTray: Boolean(prefs.minimizeToTray),
        launchAtLogin: Boolean(prefs.launchAtLogin),
        checkUpdates: prefs.checkUpdates !== false
      },
      extension: {
        exists: Boolean(meta.extensionExists),
        connected: Boolean(meta.extensionConnected)
      },
      library: {
        total: all.length,
        downloading: count('downloading'),
        queued: count('queued'),
        paused: count('paused'),
        failed: count('failed'),
        completed: count('completed')
      },
      recentFailures: all
        .filter((dl) => dl.status === 'failed')
        .slice(-5)
        .map((dl) => ({
          kind: dl.kind || 'file',
          category: dl.category || 'other',
          attempts: dl.attempts || 0,
          error: redactReportText(dl.error || 'No error message').slice(0, 300)
        }))
    };
  }

  function buildReportText(message, contact) {
    const diagnostics = collectReportDiagnostics();
    const lines = [
      `Arus bug report`,
      `Message: ${message || '(empty)'}`,
      contact ? `Contact: ${contact}` : '',
      '',
      'Diagnostics:',
      JSON.stringify(diagnostics, null, 2),
      '',
      `Recent logs (${REPORT_LOGS.length}):`,
      ...REPORT_LOGS.map((entry) => `${entry.at} [${entry.level}] ${entry.message}`),
      '',
      `Issues: ${REPO_URL}/issues`
    ];
    return lines.filter((line) => line !== '').join('\n');
  }

  function updateReportSummary() {
    if (!els.reportSummary) return;
    const meta = state.meta || {};
    const platform = [meta.os, meta.arch].filter(Boolean).join(' ') || 'Windows';
    const version = meta.version ? `Arus ${meta.version}` : 'Arus';
    const logs = REPORT_LOGS.length;
    els.reportSummary.textContent = `${version}, ${platform}, ${logs} recent log${logs === 1 ? '' : 's'}. Links, folder paths, and URL tokens are removed.`;
  }

  function openReportDialog() {
    if (!els.reportDialog) return;
    els.reportSend.disabled = false;
    els.reportSend.textContent = 'Send report';
    els.reportStatus.textContent = '';
    updateReportSummary();
    if (!els.reportDialog.open) els.reportDialog.showModal();
    els.reportMessage.focus();
  }

  async function sendReport() {
    const message = els.reportMessage.value.trim();
    const contact = els.reportContact.value.trim();
    if (message.length < 10) {
      els.reportStatus.textContent = 'Add a little more detail first.';
      els.reportMessage.focus();
      return;
    }
    els.reportSend.disabled = true;
    els.reportSend.textContent = 'Sending…';
    els.reportStatus.textContent = 'Sending report to arus.xinet.id.';
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          contact,
          app: {
            version: state.meta?.version || '',
            build: 'tauri-nsis',
            channel: 'stable'
          },
          diagnostics: collectReportDiagnostics(),
          logs: REPORT_LOGS.slice(-REPORT_LOG_LIMIT)
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
      els.reportStatus.textContent = 'Report sent. Thank you.';
      els.reportSend.textContent = 'Sent';
      els.reportMessage.value = '';
      els.reportContact.value = '';
      toast({ icon: 'i-check', title: 'Report sent', body: 'Thanks, the maintainer can see it now.', timeout: 4200 });
    } catch (err) {
      const reason = err.name === 'AbortError' ? 'The request timed out.' : err.message;
      els.reportStatus.textContent = `Could not send: ${reason}`;
      els.reportSend.disabled = false;
      els.reportSend.textContent = 'Send report';
      pushReportLog('error', `Report send failed: ${reason}`);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function copyReportText() {
    const message = els.reportMessage.value.trim();
    try {
      await navigator.clipboard.writeText(buildReportText(message, els.reportContact.value.trim()));
      els.reportStatus.textContent = 'Report copied.';
      toast({ icon: 'i-copy', title: 'Report copied', timeout: 2400 });
    } catch {
      els.reportStatus.textContent = 'Could not copy the report.';
    }
  }

  async function openGithubIssue() {
    const message = els.reportMessage.value.trim();
    try {
      await navigator.clipboard.writeText(buildReportText(message, els.reportContact.value.trim()));
      els.reportStatus.textContent = 'Report copied. Paste it into the issue.';
    } catch {
      els.reportStatus.textContent = 'Clipboard unavailable. Copy the details manually.';
    }
    const title = message ? `Bug: ${message.slice(0, 70)}` : 'Bug report';
    openExternal(`${REPO_URL}/issues/new?title=${encodeURIComponent(title)}`);
  }

  function applyState(data) {
    state.data = data;
    if (!state.previewTheme) applyTheme(data.settings?.theme || 'dark');
    applyAppearance(data.settings);
    syncBridgeSettings();
    handleClipboardLink(data.clipboard);
    recordSpeedSample();
    updateNavCounts();
    updateStatsView();
    renderList();
    renderInspector();
    recordSpark();
    if (state.selectedId && !findDownload(state.selectedId)) closeInspector();
    updateMetaHint();
  }

  function syncBridgeSettings() {
    if (!state.data || !window.arus?.syncSettings) return;
    const settingsNow = state.data.settings;
    const serialized = JSON.stringify(settingsNow);
    if (serialized === state.lastSynced) return;
    state.lastSynced = serialized;
    window.arus.syncSettings(settingsNow);
  }

  function handleClipboardLink(clipboard) {
    if (!clipboard || typeof clipboard.url !== 'string') return;
    const url = clipboard.url;
    const key = `${url}@${clipboard.at}`;
    if (key === state.lastClipboard) return;
    state.lastClipboard = key;
    if (!state.data?.settings.clipboardWatch) return;
    if (!isHttpUrl(url)) return;
    toast({
      icon: 'i-link',
      title: 'Link copied',
      body: url,
      timeout: 14000,
      actions: [{ label: 'Download', primary: true, onClick: () => openAddDialog(url) }]
    });
  }

  function updateMetaHint() {
    if (!state.meta) return;
    if (els.addNote) {
      els.addNote.textContent = state.meta.ffmpeg
        ? 'HLS and DASH streams are downloaded as segments; DASH video and audio are combined with ffmpeg.'
        : 'ffmpeg was not found. HLS is saved as MPEG-TS, and DASH video/audio tracks cannot be combined.';
    }
    if (els.settingsHint) els.settingsHint.textContent = settingsHintFor(state.settingsTab);
    populateAbout();
  }

  function buildNav() {
    for (const entry of LIBRARY) {
      const button = el('button', 'nav-item');
      button.type = 'button';
      button.dataset.filter = entry.id;
      button.append(makeIcon(entry.icon), Object.assign(el('span'), { textContent: entry.label }));
      const count = el('span', 'count');
      count.textContent = '0';
      button.append(count);
      button.addEventListener('click', () => setFilter(entry.id));
      navButtons.set(entry.id, button);
      els.libraryNav.append(button);
    }

    for (const entry of TYPES) {
      const button = el('button', 'nav-item');
      button.type = 'button';
      button.dataset.filter = entry.id;
      button.append(makeIcon(entry.icon), Object.assign(el('span'), { textContent: entry.label }));
      const count = el('span', 'count');
      count.textContent = '0';
      button.append(count);
      button.addEventListener('click', () => setFilter(entry.id));
      typeButtons.set(entry.id, button);
      els.typeNav.append(button);
    }
  }

  function updateNavCounts() {
    for (const [id, button] of [...navButtons, ...typeButtons]) {
      const count = button.querySelector('.count');
      if (count) count.textContent = String(countFor(id));
      button.classList.toggle('is-active', state.filter === id);
      if (state.filter === id) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function setFilter(filter) {
    state.filter = filter;
    updateNavCounts();
    updateStatsView();
    renderList();
    try {
      localStorage.setItem('arus.filter', filter);
    } catch {
      /* ignore */
    }
  }

  function updateStatsView() {
    const currentStats = stats();
    const items = visibleDownloads();
    const all = downloads();

    els.statActive.textContent = `${currentStats.active} active${currentStats.queued ? ` · ${currentStats.queued} queued` : ''}`;
    els.statSpeed.textContent = formatSpeed(currentStats.totalSpeed);
    const limit = Number(settings().speedLimit) || 0;
    els.statLimit.hidden = !limit;
    els.statLimitSep.hidden = !limit;
    els.statLimit.textContent = limit ? `${formatSpeed(limit)} cap` : '';
    els.liveSpeed.title = limit ? `Total download speed · capped at ${formatSpeed(limit)}` : 'Total download speed';
    els.globalSpeed.textContent = formatSpeed(currentStats.totalSpeed);
    els.liveDot.classList.toggle('is-live', currentStats.active > 0);
    els.pauseAll.disabled = currentStats.active + currentStats.queued === 0;
    els.resumeAll.disabled = currentStats.paused === 0;
    els.clearHistory.disabled =
      all.filter((dl) => ['completed', 'failed', 'canceled'].includes(dl.status)).length === 0;
    document.title = currentStats.active > 0 ? `${currentStats.active} downloading · Arus` : 'Arus';

    renderMetrics();
    updateSideCard();

    els.viewTitle.textContent = filterLabel(state.filter);

    if (state.query) {
      els.viewSub.textContent = `${items.length} match${items.length === 1 ? '' : 'es'} for “${state.query}”`;
      return;
    }

    if (state.filter === 'all') {
      if (!all.length) {
        els.viewSub.textContent = 'Nothing here yet';
      } else {
        const done = all.filter((dl) => dl.status === 'completed').length;
        els.viewSub.textContent = `${all.length} download${all.length === 1 ? '' : 's'} · ${done} completed`;
      }
    } else if (state.filter === 'active') {
      els.viewSub.textContent = `${currentStats.active} downloading · ${Math.max(0, currentStats.queued - (currentStats.scheduled || 0))} queued`;
    } else if (state.filter === 'scheduled') {
      els.viewSub.textContent = `${items.length} scheduled`;
    } else if (state.filter === 'completed') {
      const size = all.filter((dl) => dl.status === 'completed').reduce((sum, dl) => sum + (dl.size || 0), 0);
      els.viewSub.textContent = `${items.length} file${items.length === 1 ? '' : 's'}${size ? ` · ${formatBytes(size)}` : ''}`;
    } else if (state.filter === 'paused') {
      els.viewSub.textContent = `${items.length} paused`;
    } else if (state.filter === 'failed') {
      els.viewSub.textContent = items.length ? `${items.length} need${items.length === 1 ? 's' : ''} attention` : 'No failures';
    } else {
      els.viewSub.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    }
  }

  function emptyCopy() {
    if (!downloads().length) {
      return {
        title: 'Nothing here yet',
        text: 'Add a link, drop a URL, or scan a web page for video and audio.',
        action: 'New download',
        icon: 'i-plus',
        mode: 'add'
      };
    }
    if (state.query) {
      return {
        title: 'No matches',
        text: `Nothing matches “${state.query}”. Try a different search.`,
        action: 'Clear search',
        icon: 'i-search',
        mode: 'clear'
      };
    }
    if (state.filter === 'active') {
      return { title: 'Nothing downloading', text: 'Add a link or scan a page to start a download.', action: 'New download', icon: 'i-plus', mode: 'add' };
    }
    if (state.filter === 'scheduled') {
      return { title: 'No scheduled downloads', text: 'Choose a start time when adding a link and it will wait here.', action: 'New download', icon: 'i-plus', mode: 'add' };
    }
    if (state.filter === 'completed') {
      return { title: 'No completed downloads', text: 'Finished files will be listed here.', action: 'New download', icon: 'i-plus', mode: 'add' };
    }
    if (state.filter === 'paused') {
      return { title: 'Nothing paused', text: 'Downloads you pause will wait here.', action: 'New download', icon: 'i-plus', mode: 'add' };
    }
    if (state.filter === 'failed') {
      return { title: 'No failures', text: 'Downloads that need another try will appear here.', action: 'New download', icon: 'i-plus', mode: 'add' };
    }
    const titles = {
      video: 'No videos',
      audio: 'No audio files',
      document: 'No documents',
      archive: 'No archives',
      program: 'No programs',
      image: 'No images',
      other: 'No other files'
    };
    return {
      title: titles[state.filter] || 'Nothing here yet',
      text: 'Downloads in this category will appear here.',
      action: 'New download',
      icon: 'i-plus',
      mode: 'add'
    };
  }

  function updateEmpty(items) {
    const libraryEmpty = downloads().length === 0;
    document.body.classList.toggle('library-empty', libraryEmpty);
    if (items.length) {
      els.empty.hidden = true;
      els.list.hidden = false;
      if (els.listHead) els.listHead.hidden = false;
      return;
    }
    const copy = emptyCopy();
    els.emptyTitle.textContent = copy.title;
    els.emptyText.textContent = copy.text;
    els.emptyEyebrow.textContent = libraryEmpty ? 'Local download manager' : 'Current view';
    els.emptySteps.hidden = !libraryEmpty;
    els.emptyFeatures.hidden = !libraryEmpty;
    if (els.emptyAdd.dataset.mode !== copy.mode) {
      els.emptyAdd.dataset.mode = copy.mode;
      els.emptyAdd.replaceChildren(makeIcon(copy.icon), document.createTextNode(` ${copy.action}`));
    }
    els.empty.hidden = false;
    els.list.hidden = true;
    if (els.listHead) els.listHead.hidden = true;
  }

  function rowAction(dl) {
    if (dl.status === 'downloading' || dl.status === 'queued') {
      return { key: 'pause', action: 'pause', icon: 'i-pause', title: 'Pause' };
    }
    if (dl.status === 'paused') {
      return { key: 'resume', action: 'resume', icon: 'i-play', title: 'Resume' };
    }
    if (dl.status === 'failed' || dl.status === 'canceled') {
      return { key: 'retry', action: 'retry', icon: 'i-refresh', title: 'Retry' };
    }
    if (dl.status === 'completed') {
      return { key: 'folder', action: 'open-folder', icon: 'i-folder', title: 'Show in folder' };
    }
    return null;
  }

  function createRow() {
    const row = el('div', 'row');
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;

    const icon = el('div', 'row-icon');
    const main = el('div', 'row-main');
    const top = el('div', 'row-top');
    const name = el('span', 'row-name');
    const tag = el('span', 'row-tag');
    top.append(name, tag);
    const sub = el('div', 'row-sub');
    const bar = el('div', 'row-bar');
    const fill = el('span', 'row-fill');
    bar.append(fill);
    const error = el('div', 'row-error');
    main.append(top, sub, bar, error);

    const stateBlock = el('div', 'row-state');
    const stateStrong = el('strong');
    const stateSmall = el('small');
    stateBlock.append(stateStrong, stateSmall);

    const actions = el('div', 'row-actions');

    row.append(icon, main, stateBlock, actions);

    row.addEventListener('click', (event) => {
      if (event.target.closest('.row-actions')) return;
      selectDownload(row.dataset.id);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        selectDownload(row.dataset.id);
      }
    });
    row.addEventListener('dblclick', (event) => {
      if (event.target.closest('.row-actions')) return;
      const current = findDownload(row.dataset.id);
      if (current?.status === 'completed' && current.savePath) performAction(current.id, 'open-file');
    });

    row._parts = { icon, name, tag, sub, fill, error, stateStrong, stateSmall, actions };
    return row;
  }

  function updateRow(row, dl) {
    const parts = row._parts;
    row.dataset.status = dl.status;
    const percent = percentOf(dl);
    row.dataset.indeterminate = String(dl.status === 'downloading' && percent === null);
    row.classList.toggle('is-selected', dl.id === state.selectedId);
    row.setAttribute('aria-label', `${displayName(dl)}, ${isScheduled(dl) ? 'Scheduled' : STATUS_LABEL[dl.status] || dl.status}`);

    setIcon(parts.icon, iconFor(dl));

    parts.name.textContent = displayName(dl);
    parts.name.title = displayName(dl);

    const streamKind = dl.kind === 'hls' ? 'HLS' : dl.kind === 'dash' ? 'DASH' : '';
    parts.tag.textContent = streamKind;
    parts.tag.hidden = !streamKind;

    parts.sub.textContent = rowSub(dl);
    parts.sub.title = parts.sub.textContent;

    parts.fill.style.width = percent === null ? '0%' : `${percent}%`;

    parts.error.textContent = dl.status === 'failed' && dl.error ? truncate(dl.error, 140) : '';
    parts.error.title = dl.error || '';

    if (dl.status === 'downloading') {
      parts.stateStrong.textContent = percent === null ? 'Starting' : `${Math.round(percent)}%`;
      const bits = [];
      if (dl.speed) bits.push(speedText(dl.speed));
      if (dl.eta != null) bits.push(`${formatEta(dl.eta)} left`);
      parts.stateSmall.textContent = bits.join(' · ') || 'Connecting';
    } else if (dl.status === 'queued') {
      if (isRetrying(dl)) {
        parts.stateStrong.textContent = 'Retrying';
        parts.stateSmall.textContent = `in ${formatWait(dl.retryAt)}${dl.attempts ? ` · try ${dl.attempts}` : ''}`;
      } else {
        const scheduled = isScheduled(dl);
        parts.stateStrong.textContent = scheduled ? 'Scheduled' : 'Queued';
        parts.stateSmall.textContent = scheduled
          ? formatStart(dl.startAt)
          : dl.priority === 'high'
            ? 'High priority'
            : dl.priority === 'low'
              ? 'Low priority'
              : 'Waiting';
      }
    } else if (dl.status === 'paused') {
      parts.stateStrong.textContent = 'Paused';
      parts.stateSmall.textContent = percent === null ? 'n/a' : `${Math.round(percent)}%`;
    } else if (dl.status === 'completed') {
      parts.stateStrong.textContent = 'Complete';
      parts.stateSmall.textContent = timeAgo(dl.completedAt);
    } else if (dl.status === 'failed') {
      parts.stateStrong.textContent = 'Failed';
      parts.stateSmall.textContent = 'n/a';
    } else {
      parts.stateStrong.textContent = STATUS_LABEL[dl.status] || dl.status;
      parts.stateSmall.textContent = 'n/a';
    }

    const priority = dl.priority === 'high' || dl.priority === 'low' ? dl.priority : 'normal';
    row.dataset.priority = priority;
    const action = rowAction(dl);
    const canCancel = ['downloading', 'queued', 'paused'].includes(dl.status);
    const actionKey = `${action ? `${action.key}:${dl.status}` : 'none'}|${canCancel ? 'cancel' : 'none'}`;
    if (parts.actions.dataset.actionKey !== actionKey) {
      parts.actions.dataset.actionKey = actionKey;
      parts.actions.replaceChildren();
      if (action) {
        const button = el('button', 'icon-btn row-action');
        button.type = 'button';
        button.title = action.title;
        button.setAttribute('aria-label', action.title);
        button.append(makeIcon(action.icon));
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          performAction(dl.id, action.action);
        });
        parts.actions.append(button);
      }
      if (canCancel) {
        const button = el('button', 'icon-btn row-action');
        button.type = 'button';
        button.title = 'Cancel';
        button.setAttribute('aria-label', 'Cancel download');
        button.append(makeIcon('i-stop'));
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          performAction(dl.id, 'cancel');
        });
        parts.actions.append(button);
      }
      const more = el('button', 'icon-btn row-action row-menu-btn');
      more.type = 'button';
      more.title = 'More actions';
      more.setAttribute('aria-label', 'More actions');
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      more.append(makeIcon('i-more'));
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        const current = findDownload(dl.id);
        if (current) openRowMenu(current, more);
      });
      parts.actions.append(more);
    }
  }

  const rowMenu = el('div', 'row-menu');
  rowMenu.hidden = true;
  rowMenu.setAttribute('role', 'menu');
  document.body.append(rowMenu);
  let rowMenuAnchor = null;

  function closeRowMenu(restoreFocus = false) {
    if (rowMenu.hidden) return;
    rowMenu.hidden = true;
    if (rowMenuAnchor) {
      rowMenuAnchor.setAttribute('aria-expanded', 'false');
      if (restoreFocus) rowMenuAnchor.focus();
      rowMenuAnchor = null;
    }
  }

  function menuButton(item) {
    const button = el('button', item.danger ? 'is-danger' : '');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    if (item.disabled) button.disabled = true;
    else
      button.addEventListener('click', () => {
        closeRowMenu();
        item.run();
      });
    button.append(makeIcon(item.icon));
    button.append(document.createTextNode(item.label));
    if (item.current) button.append(makeIcon('i-check', 'icon menu-check'));
    return button;
  }

  function openRowMenu(dl, anchor) {
    if (rowMenuAnchor === anchor) {
      closeRowMenu();
      return;
    }
    closeRowMenu();
    rowMenu.replaceChildren();
    const add = (item) => rowMenu.append(menuButton(item));
    const sep = () => rowMenu.append(el('div', 'row-menu-sep'));
    const status = dl.status;
    const canCancel = ['downloading', 'queued', 'paused'].includes(status);

    if (status === 'downloading' || status === 'queued') {
      add({ label: 'Pause', icon: 'i-pause', run: () => performAction(dl.id, 'pause') });
      if (isScheduled(dl) || isRetrying(dl)) {
        add({ label: 'Start now', icon: 'i-play', run: () => performAction(dl.id, 'start-now') });
      }
    } else if (status === 'paused') {
      add({ label: 'Resume', icon: 'i-play', run: () => performAction(dl.id, 'resume') });
    } else if (status === 'failed' || status === 'canceled') {
      add({ label: 'Retry', icon: 'i-refresh', run: () => performAction(dl.id, 'retry') });
      add({ label: 'Start now', icon: 'i-play', run: () => performAction(dl.id, 'start-now') });
    } else if (status === 'completed') {
      add({ label: 'Open file', icon: 'i-external', disabled: !dl.savePath, run: () => performAction(dl.id, 'open-file') });
      add({ label: 'Download again', icon: 'i-refresh', run: () => performAction(dl.id, 'again') });
    }
    if (canCancel) add({ label: 'Cancel', icon: 'i-stop', run: () => performAction(dl.id, 'cancel') });
    add({ label: 'Show in folder', icon: 'i-folder', run: () => performAction(dl.id, 'open-folder') });
    add({ label: 'Copy link', icon: 'i-copy', run: () => copyLink(dl) });

    if (['queued', 'paused', 'failed', 'canceled'].includes(status)) {
      sep();
      const current = dl.priority === 'high' || dl.priority === 'low' ? dl.priority : 'normal';
      for (const [value, label] of [['high', 'High'], ['normal', 'Normal'], ['low', 'Low']]) {
        add({
          label: `Priority: ${label}`,
          icon: 'i-layers',
          current: current === value,
          run: () => performAction(dl.id, 'priority', { priority: value })
        });
      }
    }

    sep();
    add({ label: 'Remove', icon: 'i-trash', danger: true, run: () => askRemove(dl) });

    rowMenu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = rowMenu.offsetWidth;
    const height = rowMenu.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    rowMenu.style.left = `${Math.round(left)}px`;
    rowMenu.style.top = `${Math.round(top)}px`;
    rowMenuAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    rowMenu.querySelector('button:not([disabled])')?.focus();
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (rowMenu.hidden) return;
      if (rowMenu.contains(event.target) || event.target.closest?.('.row-menu-btn')) return;
      closeRowMenu();
    },
    true
  );

  document.addEventListener('keydown', (event) => {
    if (rowMenu.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeRowMenu(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...rowMenu.querySelectorAll('button:not([disabled])')];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + offset + buttons.length) % buttons.length].focus();
  });

  window.addEventListener('resize', () => closeRowMenu());

  document.addEventListener(
    'scroll',
    () => {
      if (!rowMenu.hidden) closeRowMenu();
    },
    true
  );

  async function copyLink(dl) {
    try {
      await navigator.clipboard.writeText(dl.url);
      toast({ icon: 'i-copy', title: 'Link copied', timeout: 2200 });
    } catch {
      toast({ icon: 'i-alert', title: 'Could not copy the link' });
    }
  }

  function rowSub(dl) {
    const chunks = [];
    const host = dl.host || hostOf(dl.url);
    if (host) chunks.push(host);

    if (dl.status === 'downloading') {
      const stream = streamMeta(dl);
      if (stream?.totalSegments) {
        chunks.push(`${stream.completedSegments}/${stream.totalSegments} segments`);
      } else if (dl.size) {
        chunks.push(`${formatBytes(dl.received)} / ${formatBytes(dl.size)}`);
      } else if (dl.received) {
        chunks.push(formatBytes(dl.received));
      } else {
        chunks.push('Connecting');
      }
    } else if (dl.status === 'completed') {
      chunks.push(formatBytes(dl.size || dl.received));
      const duration = formatDuration(streamMeta(dl)?.duration);
      if (duration) chunks.push(duration);
    } else if (dl.status === 'paused') {
      if (dl.received) chunks.push(`${formatBytes(dl.received)} downloaded`);
    } else if (dl.status === 'failed') {
      if (dl.received) chunks.push(`${formatBytes(dl.received)} downloaded`);
    }
    return chunks.join(' · ');
  }

  function ensureGroup(id) {
    let entry = groupEls.get(id);
    if (entry) return entry;
    const def = LIST_GROUPS.find((group) => group.id === id) || { label: id };
    const group = el('div', 'group');
    group.dataset.group = id;
    const head = el('div', 'group-head');
    const label = el('span', 'group-label');
    label.textContent = def.label;
    const count = el('span', 'group-count');
    count.textContent = '0';
    const meta = el('span', 'group-meta');
    head.append(label, count, meta);
    const rows = el('div', 'group-rows');
    group.append(head, rows);
    entry = { group, count, meta, rows };
    groupEls.set(id, entry);
    return entry;
  }

  function sortGroup(id, items) {
    const list = items.slice();
    if (id === 'downloading') {
      return list.sort((a, b) => (b.speed || 0) - (a.speed || 0) || (a.createdAt || 0) - (b.createdAt || 0));
    }
    if (id === 'queued') {
      return list.sort((a, b) => priorityRank(b) - priorityRank(a) || (a.createdAt || 0) - (b.createdAt || 0));
    }
    if (id === 'scheduled') return list.sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
    if (id === 'retrying') return list.sort((a, b) => (a.retryAt || 0) - (b.retryAt || 0));
    if (id === 'completed') return list.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function renderList() {
    const items = visibleDownloads();
    const visibleIds = new Set(items.map((dl) => dl.id));

    for (const [id, row] of rowEls) {
      if (!visibleIds.has(id)) {
        row.remove();
        rowEls.delete(id);
      }
    }

    if (!items.length) {
      for (const entry of groupEls.values()) entry.group.remove();
      groupEls.clear();
      updateEmpty(items);
      return;
    }

    const buckets = new Map();
    for (const dl of items) {
      const groupId = groupIdFor(dl);
      if (!buckets.has(groupId)) buckets.set(groupId, []);
      buckets.get(groupId).push(dl);
    }

    let markerGroup = null;
    for (const def of LIST_GROUPS) {
      const bucket = buckets.get(def.id);
      if (!bucket || !bucket.length) {
        const stale = groupEls.get(def.id);
        if (stale) {
          stale.group.remove();
          groupEls.delete(def.id);
        }
        continue;
      }

      const entry = ensureGroup(def.id);
      entry.count.textContent = String(bucket.length);
      entry.meta.textContent = groupMeta(def.id, bucket);

      const expectedGroup = markerGroup ? markerGroup.nextSibling : els.list.firstChild;
      if (entry.group !== expectedGroup) els.list.insertBefore(entry.group, expectedGroup);
      markerGroup = entry.group;

      const ordered = sortGroup(def.id, bucket);
      let rowMarker = null;
      for (const dl of ordered) {
        let row = rowEls.get(dl.id);
        if (!row) {
          row = createRow();
          row.dataset.id = dl.id;
          rowEls.set(dl.id, row);
        }
        updateRow(row, dl);
        const expectedRow = rowMarker ? rowMarker.nextSibling : entry.rows.firstChild;
        if (row !== expectedRow) entry.rows.insertBefore(row, expectedRow);
        rowMarker = row;
      }
    }

    updateEmpty(items);
  }

  function selectDownload(id) {
    if (!findDownload(id)) return;
    const isNew = state.selectedId !== id;
    state.selectedId = id;
    if (isNew) {
      state.spark.set(id, new Array(30).fill(0));
      state.segmentSigs.delete(id);
    }
    els.inspector.hidden = false;
    document.body.classList.add('inspector-open');
    for (const [rowId, row] of rowEls) row.classList.toggle('is-selected', rowId === id);
    renderInspector();
    recordSpark();
    rowEls.get(id)?.scrollIntoView({ block: 'nearest' });
  }

  function closeInspector() {
    state.selectedId = null;
    document.body.classList.remove('inspector-open');
    els.inspector.hidden = true;
  }

  function detailKindLabel(dl) {
    if (dl.kind === 'hls') {
      return `${tt('HLS video')}${dl.hls?.outputExt ? ` · ${dl.hls.outputExt.toUpperCase()}` : ''}`;
    }
    if (dl.kind === 'dash') {
      const pieces = [tt(dl.dash?.video ? 'DASH video' : 'DASH audio')];
      if (dl.dash?.video?.resolution) pieces.push(dl.dash.video.resolution);
      if (dl.dash?.muxed) pieces.push(tt('video + audio'));
      return pieces.join(' · ');
    }
    const ext = extensionOf(dl);
    return `${tt(CATEGORY_LABEL[categoryOf(dl)])}${ext ? ` · ${ext.toUpperCase()}` : ''}`;
  }

  function detailNote(dl) {
    const percent = percentOf(dl);
    if (dl.status === 'downloading') {
      const pieces = [];
      const stream = streamMeta(dl);
      if (stream?.totalSegments) {
        pieces.push(tt(`${stream.completedSegments} of ${stream.totalSegments} segments`));
      } else if (dl.size) {
        pieces.push(tt(`${formatBytes(dl.received)} of ${formatBytes(dl.size)}`));
      } else {
        pieces.push(tt(`${formatBytes(dl.received)} downloaded`));
      }
      if (dl.speed) pieces.push(formatSpeed(dl.speed));
      if (dl.eta != null) pieces.push(tt(`${formatEta(dl.eta)} left`));
      return pieces.join(' · ');
    }
    if (dl.status === 'queued') {
      if (isScheduled(dl)) return `${tt(`Starts ${formatStart(dl.startAt)}`)} · ${tt('the queue picks it up automatically.')}`;
      return `${tt('Waiting for a slot')} · ${tt(`${settings().maxConcurrent} simultaneous downloads allowed.`)}`;
    }
    if (dl.status === 'paused') {
      return `${tt(`Paused${percent !== null ? ` at ${Math.round(percent)}%` : ''}`)} · ${tt(`${formatBytes(dl.received)} saved so far.`)}`;
    }
    if (dl.status === 'completed') {
      const duration = formatDuration(streamMeta(dl)?.duration);
      return `${tt(`Completed ${timeAgo(dl.completedAt)}`)} · ${formatBytes(dl.size || dl.received)}${duration ? ` · ${duration}` : ''}`;
    }
    if (dl.status === 'failed') {
      return tt('The engine stopped. Retry to continue; finished segments are kept when the server supports ranges.');
    }
    return tt(STATUS_LABEL[dl.status] || '');
  }

  function toggleActionFor(dl) {
    if (dl.status === 'completed') return { label: 'Completed', action: null, disabled: true };
    if (dl.status === 'downloading' || dl.status === 'queued') return { label: 'Pause', action: 'pause', disabled: false };
    if (dl.status === 'paused') return { label: 'Resume', action: 'resume', disabled: false };
    return { label: 'Retry', action: 'retry', disabled: false };
  }

  function renderSegments(dl) {
    let note = '';
    let signature;
    let blocks = [];

    const stream = streamMeta(dl);
    if (stream?.totalSegments) {
      const total = stream.totalSegments;
      const done = stream.completedSegments || 0;
      signature = `${dl.kind}:${total}:${done}`;
      const shown = Math.min(total, 240);
      for (let index = 0; index < shown; index += 1) {
        blocks.push(index < done ? 'segment is-done' : 'segment');
      }
      const duration = formatDuration(stream.duration);
      const resolution = streamResolution(dl);
      const detail = dl.kind === 'dash' && stream.muxed ? 'video + audio' : null;
      note = `${tt(`${done} of ${total} segments`)}${duration ? ` · ${duration}` : ''}${resolution ? ` · ${resolution}` : ''}${detail ? ` · ${tt(detail)}` : ''}`;
    } else if (Array.isArray(dl.segments) && dl.segments.length) {
      const done = dl.segments.filter((seg) => seg.downloaded >= seg.end - seg.start + 1).length;
      signature = `file:${dl.segments.length}:${dl.segments.map((seg) => seg.downloaded || 0).join(',')}`;
      for (const seg of dl.segments.slice(0, 240)) {
        const length = seg.end - seg.start + 1;
        const className = seg.downloaded >= length ? 'segment is-done' : seg.downloaded > 0 ? 'segment is-partial' : 'segment';
        blocks.push(className);
      }
      note = `${tt(`${done} of ${dl.segments.length} segments complete`)} · ${tt(`${dl.connections} connections`)}`;
    } else {
      signature = `single:${dl.status}:${dl.received}`;
      note = dl.status === 'downloading'
        ? 'Single connection · the server did not offer byte ranges.'
        : 'Single connection download.';
    }

    if (state.segmentSigs.get(dl.id) === signature) {
      els.detailSegmentNote.textContent = note;
      return;
    }
    state.segmentSigs.set(dl.id, signature);

    if (!blocks.length) {
      els.detailSegments.replaceChildren();
    } else {
      const fragment = document.createDocumentFragment();
      for (const className of blocks) {
        const segment = el('span', className);
        fragment.append(segment);
      }
      els.detailSegments.replaceChildren(fragment);
    }
    els.detailSegmentNote.textContent = note;
  }

  function queueNote(dl) {
    if (dl.status === 'downloading') {
      return `Running now · ${priorityLabel(dl.priority)} priority · ${dl.connections} connection${dl.connections === 1 ? '' : 's'}`;
    }
    if (dl.status === 'queued') {
      if (isRetrying(dl)) {
        return `Automatic retry ${dl.attempts || 1} in ${formatWait(dl.retryAt)}. Start now skips the wait.`;
      }
      if (isScheduled(dl)) {
        return `Starts ${formatStart(dl.startAt)}. Start now runs it immediately.`;
      }
      const waiting = downloads()
        .filter((item) => item.status === 'queued' && !isScheduled(item) && !isRetrying(item))
        .sort((a, b) => priorityRank(b) - priorityRank(a) || (a.createdAt || 0) - (b.createdAt || 0));
      const position = waiting.findIndex((item) => item.id === dl.id);
      return position >= 0
        ? `Waiting for a slot · position ${position + 1} of ${waiting.length}.`
        : 'Waiting for a free slot.';
    }
    if (dl.status === 'paused') {
      return 'Paused. Resume or start now to continue from the saved data.';
    }
    if (dl.status === 'completed') {
      return 'Finished. Download again adds a fresh copy to the queue.';
    }
    if (dl.status === 'failed' || dl.status === 'canceled') {
      return 'Retries exhausted. Retry or start now to try again.';
    }
    return 'n/a';
  }

  function renderInspector() {
    const dl = state.selectedId ? findDownload(state.selectedId) : null;
    if (!dl) {
      els.inspector.hidden = true;
      document.body.classList.remove('inspector-open');
      return;
    }

    els.inspector.hidden = false;
    document.body.classList.add('inspector-open');

    const name = displayName(dl);
    els.detailName.textContent = name;
    els.detailName.title = name;
    els.detailHost.textContent = dl.host || hostOf(dl.url) || 'n/a';

    const scheduled = isScheduled(dl);
    const retrying = isRetrying(dl);
    els.detailStatus.textContent = retrying ? 'Retrying' : scheduled ? 'Scheduled' : STATUS_LABEL[dl.status] || dl.status;
    els.detailStatus.dataset.status = retrying ? 'queued' : scheduled ? 'queued' : dl.status;

    setIcon(els.detailIcon, iconFor(dl));
    const percent = percentOf(dl);
    const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));
    els.detailPercent.textContent = percent === null ? (dl.status === 'downloading' ? '···' : 'n/a') : `${Math.round(clamped)}%`;
    els.detailPercent.dataset.empty = String(percent === null && dl.status !== 'downloading');
    els.detailRing.dataset.status = dl.status;
    els.detailRing.dataset.unknown = String(percent === null && dl.status === 'downloading');
    els.detailRingFill.style.strokeDashoffset = String(201.06 * (1 - clamped / 100));
    els.detailMeter.dataset.status = dl.status;
    els.detailMeter.dataset.unknown = String(percent === null && dl.status === 'downloading');
    els.detailMeterFill.style.width = percent === null ? '0%' : `${clamped}%`;
    if (percent === null) els.detailMeter.removeAttribute('aria-valuenow');
    else els.detailMeter.setAttribute('aria-valuenow', String(Math.round(clamped)));
    els.detailNote.textContent = detailNote(dl);

    if (dl.status === 'downloading') {
      els.detailLiveSpeed.textContent = speedText(dl.speed);
      els.detailLiveEta.textContent = dl.eta != null ? `${formatEta(dl.eta)} left` : 'connecting';
    } else if (dl.status === 'completed') {
      els.detailLiveSpeed.textContent = formatBytes(dl.size || dl.received);
      els.detailLiveEta.textContent = 'saved';
    } else if (dl.status === 'paused') {
      els.detailLiveSpeed.textContent = formatBytes(dl.received);
      els.detailLiveEta.textContent = 'on disk';
    } else {
      els.detailLiveSpeed.textContent = 'n/a';
      els.detailLiveEta.textContent = retrying ? `retry in ${formatWait(dl.retryAt)}` : scheduled ? formatStart(dl.startAt) : 'waiting';
    }

    els.detailSize.textContent = typeof dl.size === 'number' ? formatBytes(dl.size) : 'n/a';
    els.detailReceived.textContent = formatBytes(dl.received);
    els.detailSpeed.textContent = dl.status === 'downloading' ? speedText(dl.speed) : 'n/a';
    els.detailEta.textContent = dl.status === 'downloading' ? formatEta(dl.eta) : 'n/a';
    els.detailConnections.textContent = isStream(dl) ? String(dl.connections) : dl.resumable === false ? 'Single' : String(dl.connections);
    els.detailKind.textContent = detailKindLabel(dl);

    const toggle = toggleActionFor(dl);
    const done = dl.status === 'completed';
    els.detailToggle.textContent = toggle.label;
    els.detailToggle.disabled = toggle.disabled;
    els.detailToggle.dataset.action = toggle.action || '';
    els.detailToggle.hidden = done;
    els.detailCancel.hidden = !['downloading', 'queued', 'paused'].includes(dl.status);
    els.detailOpen.disabled = !dl.savePath;
    els.detailOpen.classList.toggle('primary', done);
    els.detailOpen.classList.toggle('ghost', !done);
    els.detailAgain.hidden = !done;
    els.detailPriority.value = dl.priority === 'high' || dl.priority === 'low' ? dl.priority : 'normal';
    els.detailPriority.disabled = done;
    const cap = Number(dl.speedLimit) || 0;
    let capOption = [...els.detailSpeedCap.options].find((option) => Number(option.value) === cap);
    if (!capOption && cap > 0) {
      capOption = new Option(`${formatSpeed(cap)} (custom)`, String(cap), true, true);
      els.detailSpeedCap.add(capOption);
    }
    els.detailSpeedCap.value = String(cap);
    els.detailSpeedCap.disabled = done;
    els.detailStart.hidden = done;
    els.detailStart.textContent = dl.status === 'paused' ? 'Resume now' : 'Start now';
    els.detailQueueNote.textContent = queueNote(dl);

    els.detailUrl.textContent = dl.url;
    els.detailUrl.title = dl.url;
    els.detailPath.textContent = dl.savePath || dl.folder || 'n/a';
    els.detailPath.title = dl.savePath || dl.folder || '';

    if (dl.error) {
      els.detailError.hidden = false;
      els.detailError.textContent = dl.error;
    } else {
      els.detailError.hidden = true;
      els.detailError.textContent = '';
    }

    renderSegments(dl);
    renderHash(dl);
    renderSpark();
  }

  function renderHash(dl) {
    const ready = dl.status === 'completed' && Boolean(dl.savePath);
    els.detailHashBlock.hidden = !ready;
    if (!ready) return;
    const hashed = typeof dl.sha256 === 'string' && dl.sha256.length > 0;
    els.detailHash.textContent = hashed ? dl.sha256 : 'Not computed';
    els.detailHashBtn.textContent = hashed ? 'Copy' : 'Compute';
    els.detailHashBtn.disabled = false;
    els.detailHashNote.textContent = hashed
      ? 'Cached with this download. Copy it to compare with the source.'
      : 'Run a checksum to verify the saved file.';
  }

  function recordSpark() {
    if (!state.selectedId) return;
    const dl = findDownload(state.selectedId);
    if (!dl) return;
    const samples = state.spark.get(dl.id) || new Array(30).fill(0);
    samples.push(dl.status === 'downloading' ? dl.speed || 0 : 0);
    while (samples.length > 48) samples.shift();
    state.spark.set(dl.id, samples);
    renderSpark();
  }

  function renderSpark() {
    if (!state.selectedId) return;
    const dl = findDownload(state.selectedId);
    els.detailSparkValue.textContent = dl && dl.status === 'downloading' ? speedText(dl.speed) : 'Idle';
    const samples = state.spark.get(state.selectedId) || [];
    const values = samples.length ? samples : new Array(30).fill(0);
    const max = Math.max(1024, ...values);
    const width = 300;
    const height = 48;
    const top = 6;
    const bottom = 44;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((value, index) => {
      const x = index * step;
      const y = bottom - (Math.max(0, value) / max) * (bottom - top);
      return [x, y];
    });
    const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    els.detailSpark.innerHTML = `<path d="${area}" fill="var(--track)"></path><path d="${line}" fill="none" stroke="var(--muted)" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"></path>`;
  }

  async function performAction(id, action, options = {}) {
    const dl = findDownload(id);
    if (!dl) return;
    let body;
    if (action === 'remove') body = { deleteFile: Boolean(options.deleteFile) };
    else if (action === 'priority') body = { priority: options.priority };
    else if (action === 'speed-limit') body = { speedLimit: Number(options.speedLimit) || 0 };
    try {
      const result = await api(`/api/downloads/${encodeURIComponent(id)}/${action}`, { method: 'POST', body });
      if (action === 'remove') {
        if (state.selectedId === id) closeInspector();
        toast({ icon: 'i-trash', title: 'Download removed', body: displayName(dl), timeout: 3200 });
        await refreshState();
        return;
      }
      if (action === 'again' && result?.id) {
        await revealAdded(result);
        toast({ icon: 'i-again', title: 'Added again', body: displayName(result), timeout: 3200 });
        return;
      }
      await refreshState();
      if (action === 'priority') {
        toast({
          icon: 'i-layers',
          title: `${priorityLabel(options.priority)} priority`,
          body: displayName(dl),
          timeout: 2200
        });
      }
      if (action === 'start-now') {
        toast({ icon: 'i-play', title: 'Starting now', body: displayName(dl), timeout: 2200 });
      }
      if (action === 'cancel') {
        toast({ icon: 'i-stop', title: 'Download canceled', body: displayName(dl), timeout: 2400 });
      }
      if (action === 'speed-limit') {
        const limit = Number(options.speedLimit) || 0;
        toast({
          icon: 'i-gauge',
          title: limit ? `Speed capped at ${formatSpeed(limit)}` : 'Speed cap cleared',
          body: displayName(dl),
          timeout: 2400
        });
      }
    } catch (err) {
      toast({ icon: 'i-alert', title: 'Action failed', body: err.message, timeout: 6000 });
    }
  }

  async function bulkAction(action) {
    try {
      await api(`/api/downloads/${action}-all`, { method: 'POST' });
      await refreshState();
      toast({
        icon: action === 'pause' ? 'i-pause' : 'i-play',
        title: action === 'pause' ? 'All downloads paused' : 'Queue resumed',
        timeout: 2800
      });
    } catch (err) {
      toast({ icon: 'i-alert', title: 'Action failed', body: err.message });
    }
  }

  function toggleSelected() {
    const dl = state.selectedId ? findDownload(state.selectedId) : null;
    if (!dl) return;
    const toggle = toggleActionFor(dl);
    if (toggle.action) performAction(dl.id, toggle.action);
  }

  function askRemove(dl) {
    if (!dl) return;
    state.confirmAction = (deleteFile) => performAction(dl.id, 'remove', { deleteFile });
    els.confirmTitle.textContent = `Remove “${displayName(dl)}”?`;
    els.confirmText.textContent = dl.savePath
      ? 'This removes the entry from Arus. The downloaded file stays on disk unless you choose to delete it.'
      : 'This removes the entry and any partial data from Arus.';
    els.confirmDeleteRow.hidden = !dl.savePath;
    els.confirmDelete.checked = false;
    els.confirmOk.textContent = 'Remove';
    els.confirmOk.disabled = false;
    els.confirmDialog.showModal();
  }

  function askClearHistory() {
    const finished = downloads().filter((dl) =>
      ['completed', 'failed', 'canceled'].includes(dl.status)
    ).length;
    if (!finished) {
      toast({ icon: 'i-trash', title: 'History is already clear', timeout: 2200 });
      return;
    }
    state.confirmAction = async () => {
      try {
        const result = await api('/api/history/clear', { method: 'POST' });
        await refreshState();
        toast({
          icon: 'i-trash',
          title: 'History cleared',
          body: `${result.removed} entr${result.removed === 1 ? 'y' : 'ies'} removed. Files stay on disk.`,
          timeout: 2800
        });
      } catch (err) {
        toast({ icon: 'i-alert', title: 'Could not clear history', body: err.message });
      }
    };
    els.confirmTitle.textContent = 'Clear download history?';
    els.confirmText.textContent =
      'Completed, failed, and canceled entries are removed from Arus. Downloaded files stay on disk.';
    els.confirmDeleteRow.hidden = true;
    els.confirmDelete.checked = false;
    els.confirmOk.textContent = 'Clear history';
    els.confirmOk.disabled = false;
    els.confirmDialog.showModal();
  }

  function toast({ title, body = '', icon = 'i-check', timeout = 4500, actions = [] }) {
    const node = el('div', 'toast');
    node.setAttribute('role', 'status');

    const head = el('div', 'toast-head');
    head.append(makeIcon(icon));
    const titleNode = el('span', 'toast-title');
    titleNode.textContent = title;
    head.append(titleNode);

    const close = el('button', 'toast-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.append(makeIcon('i-x'));
    head.append(close);
    node.append(head);

    if (body) {
      const bodyNode = el('div', 'toast-body');
      bodyNode.textContent = body;
      node.append(bodyNode);
    }

    let timer = timeout > 0 ? setTimeout(() => dismiss(), timeout) : null;

    function dismiss() {
      if (node.classList.contains('is-leaving')) return;
      node.classList.add('is-leaving');
      if (timer) clearTimeout(timer);
      setTimeout(() => {
        node.remove();
        if (
          !els.toasts.children.length &&
          typeof els.toasts.hidePopover === 'function' &&
          els.toasts.matches(':popover-open')
        ) {
          els.toasts.hidePopover();
        }
      }, 180);
    }

    close.addEventListener('click', dismiss);

    if (actions.length) {
      const actionRow = el('div', 'toast-actions');
      for (const action of actions) {
        const button = el('button', action.primary ? 'primary' : 'ghost');
        button.type = 'button';
        button.textContent = action.label;
        button.addEventListener('click', () => {
          dismiss();
          Promise.resolve()
            .then(() => action.onClick?.())
            .catch((err) => toast({ icon: 'i-alert', title: 'Action failed', body: err.message }));
        });
        actionRow.append(button);
      }
      node.append(actionRow);
    }

    els.toasts.append(node);
    while (els.toasts.children.length > 4) els.toasts.firstElementChild.remove();
    if (
      typeof els.toasts.showPopover === 'function' &&
      !els.toasts.matches(':popover-open')
    ) {
      els.toasts.showPopover();
    }
    return { dismiss };
  }

  function connectEvents() {
    if (state.source) state.source.close();
    const source = new EventSource('/api/events');
    state.source = source;
    source.addEventListener('state', (event) => {
      try {
        applyState(JSON.parse(event.data));
      } catch {
        /* ignore malformed frame */
      }
    });
    source.addEventListener('completed', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      refreshState().catch(() => {});
      if (window.arus?.isDesktop) return;
      const name = payload.filename || 'File';
      toast({
        icon: 'i-check',
        title: 'Download complete',
        body: name,
        timeout: 9000,
        actions: [
          { label: 'Open', primary: true, onClick: () => performAction(payload.id, 'open-file') },
          { label: 'Show in folder', onClick: () => performAction(payload.id, 'open-folder') }
        ]
      });
    });
    source.onopen = () => {
      if (!state.data) refreshState().catch(() => {});
    };
  }

  function selectTab(name) {
    state.tab = name === 'page' || name === 'batch' ? name : 'link';
    for (const tab of document.querySelectorAll('.tabs .tab')) {
      const active = tab.dataset.tab === state.tab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.hidden = panel.dataset.panel !== state.tab;
    }
    if (!state.busy) els.addSubmit.textContent = TAB_LABEL[state.tab];
    if (state.tab === 'page' && !els.scanUrl.value.trim() && els.addUrl.value.trim()) {
      els.scanUrl.value = els.addUrl.value.trim();
    }
  }

  function resetAddDialog() {
    els.addUrl.value = '';
    els.addName.value = '';
    els.addFolder.value = settings().downloadDir || '';
    els.addConnections.value = String(settings().connections || 16);
    els.addPriority.value = 'normal';
    els.addStart.value = '';
    els.addStart.min = localInputValue(Date.now() + 60 * 1000);
    els.batchUrls.value = '';
    els.batchFolder.value = settings().downloadDir || '';
    els.batchConnections.value = String(settings().connections || 16);
    els.batchStatus.hidden = true;
    els.batchStatus.textContent = '';
    els.scanUrl.value = '';
    els.scanResults.replaceChildren();
    els.scanStatus.textContent = SCAN_IDLE;
    els.addSubmit.disabled = false;
    els.scanBtn.disabled = false;
    state.busy = false;
    setTabLabel();
    selectTab('link');
  }

  function setTabLabel() {
    els.addSubmit.textContent = state.busy ? 'Working…' : TAB_LABEL[state.tab];
  }

  function openAddDialog(url = '', tab = '') {
    resetAddDialog();
    if (tab === 'page' || tab === 'batch') selectTab(tab);
    if (url) {
      if (tab === 'page') {
        els.scanUrl.value = url;
      } else if (tab === 'batch') {
        els.batchUrls.value = url;
      } else if (MEDIA_URL_RE.test(url) || FILE_URL_RE.test(url)) {
        els.addUrl.value = url;
      } else {
        els.scanUrl.value = url;
        selectTab('page');
      }
    }
    if (!els.addDialog.open) els.addDialog.showModal();
    requestAnimationFrame(() => {
      if (state.tab === 'page') els.scanUrl.focus();
      else if (state.tab === 'batch') els.batchUrls.focus();
      else els.addUrl.focus();
    });
  }

  async function submitDirect() {
    const url = els.addUrl.value.trim();
    if (!isHttpUrl(url)) {
      els.addUrl.focus();
      toast({ icon: 'i-alert', title: 'Enter a valid link', body: 'Only http and https URLs are supported.' });
      return;
    }
    const startRaw = els.addStart.value.trim();
    const startAt = startRaw ? new Date(startRaw).getTime() : undefined;
    if (startRaw && !Number.isFinite(startAt)) {
      els.addStart.focus();
      toast({ icon: 'i-alert', title: 'Check the start time', body: 'Pick a valid date and time.' });
      return;
    }
    if (startAt !== undefined && startAt <= Date.now()) {
      els.addStart.focus();
      toast({ icon: 'i-alert', title: 'Start time has passed', body: 'Pick a moment in the future.' });
      return;
    }
    state.busy = true;
    els.addSubmit.disabled = true;
    els.scanBtn.disabled = true;
    setTabLabel();
    try {
      const dl = await api('/api/downloads', {
        method: 'POST',
        body: {
          url,
          filename: els.addName.value.trim() || undefined,
          folder: els.addFolder.value.trim() || undefined,
          connections: Number(els.addConnections.value) || undefined,
          priority: els.addPriority.value,
          speedLimit: Number(els.addSpeed.value) || undefined,
          startAt
        }
      });
      state.busy = false;
      els.addSubmit.disabled = false;
      els.scanBtn.disabled = false;
      els.addDialog.close();
      await revealAdded(dl);
    } catch (err) {
      state.busy = false;
      els.addSubmit.disabled = false;
      els.scanBtn.disabled = false;
      setTabLabel();
      toast({ icon: 'i-alert', title: 'Could not add download', body: err.message, timeout: 6000 });
    }
  }

  async function submitBatch() {
    const lines = [...new Set(els.batchUrls.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
    if (!lines.length) {
      els.batchUrls.focus();
      toast({ icon: 'i-alert', title: 'Paste at least one link', body: 'One URL per line.' });
      return;
    }
    const urls = lines.slice(0, 50);
    const overflow = lines.length - urls.length;
    const folder = els.batchFolder.value.trim() || undefined;
    const connections = Number(els.batchConnections.value) || undefined;

    els.batchStatus.hidden = true;
    els.batchStatus.textContent = '';
    state.busy = true;
    els.addSubmit.disabled = true;
    els.scanBtn.disabled = true;
    setTabLabel();

    let added = 0;
    let duplicates = 0;
    const failed = [];
    try {
      const current = await api('/api/state');
      const activeUrls = new Set(
        (current.downloads || [])
          .filter((dl) => ['queued', 'downloading', 'paused'].includes(dl.status))
          .map((dl) => {
            try {
              return new URL(dl.url).toString();
            } catch {
              return dl.url;
            }
          })
      );
      const batchStartedAt = Date.now();
      for (const url of urls) {
        if (!isHttpUrl(url)) {
          failed.push(url);
          continue;
        }
        const normalized = new URL(url).toString();
        if (activeUrls.has(normalized)) {
          duplicates += 1;
          continue;
        }
        try {
          const record = await api('/api/downloads', { method: 'POST', body: { url, folder, connections } });
          if (record.createdAt >= batchStartedAt) added += 1;
          else duplicates += 1;
          activeUrls.add(normalized);
        } catch {
          failed.push(url);
        }
      }
    } catch (err) {
      toast({ icon: 'i-alert', title: 'Batch import failed', body: err.message, timeout: 6000 });
    }

    state.busy = false;
    els.addSubmit.disabled = false;
    els.scanBtn.disabled = false;
    setTabLabel();

    if (failed.length) {
      els.batchUrls.value = failed.join('\n');
      const body = [
        `${added} queued`,
        duplicates ? `${duplicates} already in the queue` : '',
        overflow ? `${overflow} over the 50-link limit skipped` : '',
        `${failed.length} could not be added`
      ].filter(Boolean).join(' · ');
      els.batchStatus.textContent = `${body}. Fix the remaining lines and import again.`;
      els.batchStatus.hidden = false;
      return;
    }

    els.addDialog.close();
    try {
      await refreshState();
    } catch {
      /* the records are saved; the next event will refresh */
    }
    updateNavCounts();
    const body = [
      `${added} link${added === 1 ? '' : 's'} queued`,
      duplicates ? `${duplicates} already in the queue` : '',
      overflow ? `${overflow} over the 50-link limit skipped` : ''
    ].filter(Boolean).join(' · ');
    toast({ icon: 'i-plus', title: 'Batch import complete', body, timeout: 4200 });
  }

  async function revealAdded(dl) {
    if (state.query) {
      state.query = '';
      els.search.value = '';
    }
    if (!matchesFilter(dl)) state.filter = 'all';
    updateNavCounts();
    try {
      await refreshState();
    } catch {
      /* the queued record is already saved; next event will refresh */
    }
    selectDownload(dl.id);
    if (isScheduled(dl)) {
      toast({ icon: 'i-clock', title: 'Scheduled', body: `${displayName(dl)} · ${formatStart(dl.startAt)}`, timeout: 4200 });
    } else {
      toast({ icon: 'i-plus', title: 'Added to the queue', body: displayName(dl), timeout: 3200 });
    }
  }

  async function runScan() {
    const url = els.scanUrl.value.trim();
    if (!isHttpUrl(url)) {
      els.scanUrl.focus();
      toast({ icon: 'i-alert', title: 'Enter a page URL', body: 'Only http and https URLs are supported.' });
      return;
    }
    state.busy = true;
    els.addSubmit.disabled = true;
    els.scanBtn.disabled = true;
    els.scanStatus.textContent = 'Fetching the page and looking for media…';
    els.scanResults.replaceChildren();
    setTabLabel();
    try {
      const result = await api('/api/scan', { method: 'POST', body: { url } });
      renderScanResults(result);
    } catch (err) {
      els.scanStatus.textContent = `Scan failed: ${err.message}`;
    } finally {
      state.busy = false;
      els.addSubmit.disabled = false;
      els.scanBtn.disabled = false;
      setTabLabel();
    }
  }

  function renderScanResults(result) {
    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    if (!candidates.length) {
      els.scanStatus.textContent = 'No direct media sources found. Many sites load video from scripts. The browser extension can catch those streams.';
      return;
    }
    const unsupported = candidates.filter((candidate) => !candidate.supported).length;
    els.scanStatus.textContent = `${candidates.length} media source${candidates.length === 1 ? '' : 's'} found${unsupported ? ` · ${unsupported} unsupported stream${unsupported === 1 ? '' : 's'}` : ''}. Pick one to download.`;
    const fragment = document.createDocumentFragment();

    for (const candidate of candidates) {
      const item = el('div', 'scan-item');
      const icon = el('div', 'scan-icon');
      icon.append(makeIcon(candidate.media === 'audio' ? 'i-audio' : candidate.kind === 'hls' ? 'i-video' : 'i-video'));
      const main = el('div', 'scan-main');
      const name = el('div', 'scan-name');
      name.textContent = candidate.name || candidate.url;
      name.title = candidate.url;
      const meta = el('div', 'scan-meta');
      const metaBits = [
        candidate.label,
        candidate.quality,
        hostOf(candidate.url),
        SOURCE_LABEL[candidate.source] || candidate.source
      ].filter(Boolean);
      for (const bit of metaBits) {
        const span = el('span');
        span.textContent = bit;
        meta.append(span);
      }
      main.append(name, meta);

      const button = el('button', 'ghost');
      button.type = 'button';
      button.textContent = candidate.supported ? 'Download' : 'Unsupported';
      button.disabled = !candidate.supported;
      button.title = candidate.supported ? `Download ${candidate.name}` : 'This stream is not supported';
      if (candidate.supported) {
        button.addEventListener('click', () => downloadCandidate(candidate, result.pageUrl, button));
      }

      item.append(icon, main, button);
      fragment.append(item);
    }

    els.scanResults.replaceChildren(fragment);
  }

  async function downloadCandidate(candidate, pageUrl, button) {
    button.disabled = true;
    button.textContent = 'Adding…';
    try {
      const filename = candidate.kind === 'file' && /\.[a-z0-9]{1,8}$/i.test(candidate.name) ? candidate.name : undefined;
      const dl = await api('/api/downloads', {
        method: 'POST',
        body: {
          url: candidate.url,
          filename,
          pageUrl,
          headers: pageUrl ? { referer: pageUrl } : undefined
        }
      });
      els.addDialog.close();
      await revealAdded(dl);
    } catch (err) {
      button.disabled = false;
      button.textContent = 'Download';
      toast({ icon: 'i-alert', title: 'Could not add download', body: err.message, timeout: 6000 });
    }
  }

  async function chooseFolder(current) {
    if (window.arus?.pickFolder) {
      try {
        return await window.arus.pickFolder(current || '');
      } catch {
        return null;
      }
    }
    const picked = window.prompt('Folder path', current || '');
    return picked && picked.trim() ? picked.trim() : null;
  }

  let shareData = null;
  let shareBusy = false;
  let shareTimer = null;
  const shareEl = (id) => document.getElementById(`share-${id}`);
  const shareText = (value) => window.ArusLang?.t(value) || value;

  function updateShareForm() {
    shareEl('start').disabled = shareBusy || !shareEl('network').value;
    shareEl('foot-hint').textContent = shareEl('lifetime').value === 'always'
      ? 'No time limit. Access closes when you stop sharing or Arus quits.'
      : 'Access closes when the period is over, when you stop sharing, or when Arus quits.';
  }

  function folderName(path) {
    const parts = String(path || '').split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'Downloads';
  }

  function renderShareStatus(data) {
    shareData = data;
    shareEl('access').hidden = !data.enabled;
    shareEl('renew-hint').hidden = !data.enabled;
    shareEl('start').textContent = data.enabled ? 'Update sharing' : 'Start sharing';
    shareEl('status').textContent = data.enabled
      ? (data.passwordProtected ? 'Folder sharing is on. Viewers need the password.' : 'Folder sharing is on. Anyone with this link can browse.')
      : 'Sharing is off. Allow access to your Downloads folder when you are ready.';
    shareEl('url').value = data.url || '';
    shareEl('qr').replaceChildren();
    if (data.enabled && data.url) {
      const qr = window.qrcode(0, 'M');
      qr.addData(data.url); qr.make();
      shareEl('qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
      shareEl('qr').querySelector('svg')?.setAttribute('aria-hidden', 'true');
    }
    shareEl('expiry').textContent = !data.enabled ? ''
      : data.expiresAt
        ? `${shareText('Access ends')}: ${new Date(data.expiresAt).toLocaleString(window.ArusLang?.locale, { dateStyle: 'medium', timeStyle: 'short' })}`
        : 'No time limit. Access ends when you stop sharing or Arus quits.';
    if (data.enabled && ['1h', '8h', '24h', 'always'].includes(data.lifetime)) shareEl('lifetime').value = data.lifetime;
    updateShareForm();
  }

  async function openShareDialog() {
    if (!state.data) return;
    const folder = settings().downloadDir || '';
    shareEl('folder-name').textContent = folderName(folder);
    shareEl('folder-path').textContent = folder;
    shareEl('folder-path').title = folder;
    shareEl('dialog').showModal();
    shareEl('status').textContent = 'Checking local networks…';
    shareEl('start').disabled = true;
    shareEl('access').hidden = true;
    shareEl('password').value = '';
    shareEl('password-enabled').checked = false;
    shareEl('password-field').hidden = true;
    shareEl('password').required = false;
    clearInterval(shareTimer);
    try {
      const data = await api('/api/share');
      if (!shareEl('dialog').open) return;
      shareEl('network').replaceChildren();
      for (const network of data.interfaces) {
        shareEl('network').add(new Option(`${network.label} · ${network.address}`, network.address));
      }
      if (data.url) shareEl('network').value = new URL(data.url).hostname;
      renderShareStatus(data);
      if (!data.interfaces.length) shareEl('status').textContent = 'No private network found. Connect this PC to trusted Wi-Fi or Ethernet, then reopen this panel.';
      shareEl('password-enabled').checked = !!data.passwordProtected;
      shareEl('password-field').hidden = !data.passwordProtected;
      shareEl('password').required = !!data.passwordProtected;
      shareTimer = setInterval(async () => {
        if (!shareEl('dialog').open || shareBusy || !shareData?.enabled) return;
        try {
          const latest = await api('/api/share');
          if (shareEl('dialog').open && !shareBusy && latest.enabled !== shareData.enabled) renderShareStatus(latest);
        } catch { shareEl('status').textContent = 'Could not reach local sharing. Check that Arus is still running.'; }
      }, 15000);
    } catch (error) {
      shareEl('status').textContent = error.message;
    }
  }

  function setShareBusy(value) {
    shareBusy = value;
    shareEl('dialog').querySelectorAll('button, input, select').forEach((control) => { control.disabled = value; });
    updateShareForm();
  }

  async function startShare(event) {
    event.preventDefault();
    if (shareBusy) return;
    const password = shareEl('password-enabled').checked ? shareEl('password').value : '';
    if (!shareEl('form').reportValidity()) return;
    setShareBusy(true);
    shareEl('status').textContent = 'Preparing private access…';
    try {
      const data = await api('/api/share', {
        method: 'POST',
        body: {
          address: shareEl('network').value,
          fileIds: [],
          password,
          folder: true,
          lifetime: shareEl('lifetime').value
        }
      });
      renderShareStatus(data);
      shareEl('password').value = '';
    } catch (error) { shareEl('status').textContent = error.message; }
    finally { setShareBusy(false); }
    if (shareData?.enabled) shareEl('url').focus();
  }

  async function stopShare() {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const data = await api('/api/share', { method: 'DELETE' });
      renderShareStatus(data);
      shareEl('password').value = '';
    } catch (error) { shareEl('status').textContent = error.message; }
    finally { setShareBusy(false); }
  }

  function openSettingsDialog(tab = 'downloads') {
    if (!state.data) return;
    const current = settings();
    state.previewTheme = null;
    state.previewAppearance = appearanceFrom(current);
    state.settingsSaved = false;
    els.setFolder.value = current.downloadDir || '';
    els.setMax.value = String(current.maxConcurrent || 4);
    els.setConnections.value = String(current.connections || 16);
    const limit = Number(current.speedLimit) || 0;
    if (![...els.setSpeed.options].some((option) => Number(option.value) === limit)) {
      els.setSpeed.add(new Option(`${formatSpeed(limit)} (custom)`, String(limit)));
    }
    els.setSpeed.value = String(limit);
    els.setRetry.value = String(Math.max(0, Math.min(5, Number(current.autoRetry) || 0)));
    els.setOrganize.checked = Boolean(current.organizeByCategory);
    const lifetime = stats().lifetime || { completed: 0, failed: 0, bytes: 0, since: Date.now() };
    els.setLifetimeBytes.textContent = formatBytes(lifetime.bytes || 0);
    els.setLifetimeCount.textContent = String(lifetime.completed || 0);
    els.setLifetimeFailed.textContent = String(lifetime.failed || 0);
    els.setLifetimeSince.textContent = lifetime.since
      ? new Date(lifetime.since).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'n/a';
    els.setClipboard.checked = Boolean(current.clipboardWatch);
    els.setNotifications.checked = Boolean(current.notifications);
    els.setTray.checked = Boolean(current.minimizeToTray);
    els.setLaunch.checked = current.launchAtLogin !== false;
    els.setUpdates.checked = current.checkUpdates !== false;
    els.trayRow.hidden = !window.arus?.isDesktop;
    els.launchRow.hidden = !window.arus?.isDesktop;
    applyTheme(current.theme || 'dark');
    applyAppearance(current);
    populateAbout();
    selectSettingsTab(tab);
    updateMetaHint();
    if (!els.settingsDialog.open) els.settingsDialog.showModal();
    if (tab === 'downloads') requestAnimationFrame(() => els.setFolder.focus());
  }

  async function saveSettings() {
    const payload = {
      downloadDir: els.setFolder.value.trim(),
      maxConcurrent: Number(els.setMax.value),
      connections: Number(els.setConnections.value),
      speedLimit: Number(els.setSpeed.value),
      autoRetry: Number(els.setRetry.value),
      organizeByCategory: els.setOrganize.checked,
      clipboardWatch: els.setClipboard.checked,
      notifications: els.setNotifications.checked,
      minimizeToTray: els.setTray.checked,
      launchAtLogin: els.setLaunch.checked,
      checkUpdates: els.setUpdates.checked,
      theme: state.previewTheme || settings().theme || 'dark',
      compactMode: Boolean(state.previewAppearance?.compactMode),
      reduceMotion: Boolean(state.previewAppearance?.reduceMotion)
    };
    els.settingsSave.disabled = true;
    try {
      const saved = await api('/api/settings', { method: 'PATCH', body: payload });
      if (state.data) state.data.settings = saved;
      state.lastSynced = '';
      state.previewTheme = null;
      state.previewAppearance = null;
      state.settingsSaved = true;
      applyTheme(saved.theme);
      applyAppearance(saved);
      syncBridgeSettings();
      if (window.arus?.setLaunchAtLogin) {
        try {
          await window.arus.setLaunchAtLogin(saved.launchAtLogin !== false);
        } catch {
          /* the OS login item is best-effort */
        }
      }
      els.settingsDialog.close();
      toast({ icon: 'i-check', title: 'Settings saved', timeout: 2600 });
      await refreshState();
    } catch (err) {
      toast({ icon: 'i-alert', title: 'Could not save settings', body: err.message, timeout: 6000 });
    } finally {
      els.settingsSave.disabled = false;
    }
  }

  function clearSearch() {
    state.query = '';
    els.search.value = '';
    renderList();
    updateStatsView();
  }

  function bindEvents() {
    els.newDownload.addEventListener('click', () => openAddDialog());
    els.addBtn.addEventListener('click', () => openAddDialog());
    els.emptyAdd.addEventListener('click', () => {
      if (els.emptyAdd.dataset.mode === 'clear') {
        clearSearch();
        els.search.focus();
      } else {
        openAddDialog();
      }
    });
    els.emptyScan?.addEventListener('click', () => openAddDialog('', 'page'));
    els.emptyBatch?.addEventListener('click', () => openAddDialog('', 'batch'));

    els.search.addEventListener('input', () => {
      state.query = els.search.value.trim();
      updateStatsView();
      renderList();
    });
    els.search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        clearSearch();
        els.search.blur();
      }
    });

    els.pauseAll.addEventListener('click', () => bulkAction('pause'));
    els.resumeAll.addEventListener('click', () => bulkAction('resume'));
    els.clearHistory.addEventListener('click', askClearHistory);
    els.openFolder.addEventListener('click', () => {
      api('/api/open-downloads-folder', { method: 'POST' }).catch((err) =>
        toast({ icon: 'i-alert', title: 'Could not open the folder', body: err.message })
      );
    });

    shareEl('btn').addEventListener('click', openShareDialog);
    document.getElementById('share-head-btn')?.addEventListener('click', openShareDialog);
    shareEl('form').addEventListener('submit', startShare);
    shareEl('stop').addEventListener('click', stopShare);
    shareEl('network').addEventListener('change', updateShareForm);
    shareEl('lifetime').addEventListener('change', updateShareForm);
    shareEl('password-enabled').addEventListener('change', () => {
      const enabled = shareEl('password-enabled').checked;
      shareEl('password-field').hidden = !enabled;
      shareEl('password').required = enabled;
      if (enabled) shareEl('password').focus(); else shareEl('password').value = '';
    });
    shareEl('copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareEl('url').value);
        shareEl('status').textContent = 'Private link copied. Share it only with people you trust.';
      } catch {
        shareEl('url').focus(); shareEl('url').select();
        shareEl('status').textContent = 'Copy the selected link manually.';
      }
    });
    shareEl('dialog').addEventListener('cancel', (event) => { if (shareBusy) event.preventDefault(); });
    shareEl('dialog').addEventListener('close', () => {
      clearInterval(shareTimer); shareTimer = null;
      shareEl('password').value = '';
      shareEl('qr').replaceChildren(); shareEl('url').value = '';
    });
    els.settingsBtn.addEventListener('click', () => openSettingsDialog('downloads'));
    els.aboutBtn.addEventListener('click', () => openSettingsDialog('about'));
    els.privacyBtn.addEventListener('click', () => openSettingsDialog('privacy'));
    els.supportBtn.addEventListener('click', openSupportDialog);
    els.aboutSupport.addEventListener('click', openSupportDialog);
    els.aboutGithub.addEventListener('click', () => openExternal(REPO_URL));
    els.aboutDiscord.addEventListener('click', () => openExternal(DISCORD_URL));
    els.updateCheck.addEventListener('click', () => checkForUpdates({ refresh: true }));
    els.updateDownload.addEventListener('click', openUpdateRelease);
    els.updateClose.addEventListener('click', closeUpdateDialog);
    els.updateLater.addEventListener('click', closeUpdateDialog);
    els.updateGo.addEventListener('click', openUpdateRelease);
    els.extOpenBrowser.addEventListener('click', openExtensionBrowser);
    els.setupOpenBrowser.addEventListener('click', openExtensionBrowser);
    els.setupCopyPath.addEventListener('click', copyExtensionPath);
    els.setupCheck.addEventListener('click', async () => {
      const meta = await refreshMetaQuiet();
      if (meta?.extensionConnected) {
        toast({ icon: 'i-check', title: 'Extension connected', body: 'Browser capture is ready.', timeout: 3000 });
      } else {
        toast({
          icon: 'i-info',
          title: 'Not connected yet',
          body: 'Load the folder in the extensions page, then check again.',
          timeout: 5000
        });
      }
    });
    els.setupSkip.addEventListener('click', () => finishSetup(false));
    els.setupDone.addEventListener('click', () => finishSetup(true));
    els.setupDialog.addEventListener('close', () => {
      stopSetupPolling();
      writeStore(SETUP_KEY, 'done');
    });
    if (els.supportPresets) {
      els.supportPresets.addEventListener('click', (event) => {
        const button = event.target.closest('[data-amount]');
        if (button) setSupportAmount(Number(button.dataset.amount));
      });
    }
    if (els.supportAmount) {
      els.supportAmount.addEventListener('input', () => {
        const digits = Number(els.supportAmount.value.replace(/\D+/g, '')) || 0;
        if (digits > 0) {
          setSupportAmount(digits, { write: false });
          els.supportAmount.value = formatRupiah(digits);
        } else {
          els.supportAmount.value = '';
          els.supportAmountHint.textContent = 'Minimum is Rp 1.000.';
          els.supportAmountHint.classList.add('is-error');
          markSupportPresets(0);
        }
      });
      els.supportAmount.addEventListener('focus', () => els.supportAmount.select());
      els.supportAmount.addEventListener('blur', () => setSupportAmount(state.supportAmount));
    }
    els.detailClose.addEventListener('click', closeInspector);
    els.detailToggle.addEventListener('click', () => {
      const dl = state.selectedId ? findDownload(state.selectedId) : null;
      if (!dl) return;
      const toggle = toggleActionFor(dl);
      if (toggle.action) performAction(dl.id, toggle.action);
    });
    els.detailOpen.addEventListener('click', () => {
      if (state.selectedId) performAction(state.selectedId, 'open-file');
    });
    els.detailAgain.addEventListener('click', () => {
      if (state.selectedId) performAction(state.selectedId, 'again');
    });
    els.detailStart.addEventListener('click', () => {
      if (state.selectedId) performAction(state.selectedId, 'start-now');
    });
    els.detailPriority.addEventListener('change', () => {
      if (state.selectedId) performAction(state.selectedId, 'priority', { priority: els.detailPriority.value });
    });
    els.detailSpeedCap.addEventListener('change', () => {
      if (state.selectedId) performAction(state.selectedId, 'speed-limit', { speedLimit: Number(els.detailSpeedCap.value) });
    });
    els.detailFolder.addEventListener('click', () => {
      if (state.selectedId) performAction(state.selectedId, 'open-folder');
    });
    els.detailRemove.addEventListener('click', () => {
      const dl = state.selectedId ? findDownload(state.selectedId) : null;
      if (dl) askRemove(dl);
    });
    els.detailCopy.addEventListener('click', () => {
      const dl = state.selectedId ? findDownload(state.selectedId) : null;
      if (dl) copyLink(dl);
    });
    els.detailCancel.addEventListener('click', () => {
      if (state.selectedId) performAction(state.selectedId, 'cancel');
    });
    els.detailHashBtn.addEventListener('click', async () => {
      const dl = state.selectedId ? findDownload(state.selectedId) : null;
      if (!dl) return;
      if (typeof dl.sha256 === 'string' && dl.sha256) {
        try {
          await navigator.clipboard.writeText(dl.sha256);
          toast({ icon: 'i-copy', title: 'SHA-256 copied', timeout: 2200 });
        } catch {
          toast({ icon: 'i-alert', title: 'Could not copy the checksum' });
        }
        return;
      }
      els.detailHashBtn.disabled = true;
      els.detailHashBtn.textContent = 'Computing…';
      try {
        const result = await api(`/api/downloads/${encodeURIComponent(dl.id)}/hash`, { method: 'POST' });
        dl.sha256 = result.sha256;
        toast({ icon: 'i-check', title: 'SHA-256 computed', body: formatBytes(result.size), timeout: 3200 });
        renderInspector();
      } catch (err) {
        els.detailHashBtn.disabled = false;
        els.detailHashBtn.textContent = 'Compute';
        toast({ icon: 'i-alert', title: 'Could not compute checksum', body: err.message, timeout: 6000 });
      }
    });

    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => button.closest('dialog')?.close());
    });
    for (const dialog of document.querySelectorAll('dialog.modal')) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }

    const addTabs = [...document.querySelectorAll('.tabs .tab')];
    for (const [index, tab] of addTabs.entries()) {
      tab.addEventListener('click', () => selectTab(tab.dataset.tab));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        const next = addTabs[(index + offset + addTabs.length) % addTabs.length];
        selectTab(next.dataset.tab);
        next.focus();
      });
    }

    els.addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (state.busy) return;
      if (state.tab === 'page') runScan();
      else if (state.tab === 'batch') submitBatch();
      else submitDirect();
    });
    els.scanBtn.addEventListener('click', () => {
      if (!state.busy) runScan();
    });

    els.addBrowse.addEventListener('click', async () => {
      const picked = await chooseFolder(els.addFolder.value.trim());
      if (picked) els.addFolder.value = picked;
    });
    els.batchBrowse.addEventListener('click', async () => {
      const picked = await chooseFolder(els.batchFolder.value.trim());
      if (picked) els.batchFolder.value = picked;
    });

    els.settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveSettings();
    });
    els.setBrowse.addEventListener('click', async () => {
      const picked = await chooseFolder(els.setFolder.value.trim());
      if (picked) els.setFolder.value = picked;
    });
    els.themePicker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme-value]');
      if (!button) return;
      state.previewTheme = button.dataset.themeValue;
      applyTheme(state.previewTheme);
    });
    for (const tab of els.settingsTabs) {
      tab.addEventListener('click', () => selectSettingsTab(tab.dataset.settingsTab));
    }
    els.densityPicker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-density-value]');
      if (!button) return;
      state.previewAppearance = {
        ...appearanceFrom(state.previewAppearance || settings()),
        compactMode: button.dataset.densityValue === 'compact'
      };
      applyAppearance();
    });
    els.setMotion.addEventListener('change', () => {
      state.previewAppearance = {
        ...appearanceFrom(state.previewAppearance || settings()),
        reduceMotion: els.setMotion.checked
      };
      applyAppearance();
    });
    els.aboutOpenData.addEventListener('click', () => {
      api('/api/open-data-folder', { method: 'POST' }).catch((err) =>
        toast({ icon: 'i-alert', title: 'Could not open the data folder', body: err.message })
      );
    });
    els.aboutOpenExt.addEventListener('click', () => {
      api('/api/open-extension-folder', { method: 'POST' }).catch((err) =>
        toast({ icon: 'i-alert', title: 'Could not open the extension folder', body: err.message })
      );
    });
    els.aboutCopy.addEventListener('click', copyDiagnostics);
    els.aboutReport.addEventListener('click', openReportDialog);
    els.reportSend.addEventListener('click', sendReport);
    els.reportCopy.addEventListener('click', copyReportText);
    els.reportGithub.addEventListener('click', openGithubIssue);
    els.reportDialog.addEventListener('close', () => {
      els.reportStatus.textContent = '';
    });
    els.openExtension.addEventListener('click', () => {
      api('/api/open-extension-folder', { method: 'POST' }).catch((err) =>
        toast({ icon: 'i-alert', title: 'Could not open the extension folder', body: err.message })
      );
    });
    els.settingsDialog.addEventListener('close', () => {
      if (!state.settingsSaved) {
        state.previewTheme = null;
        state.previewAppearance = null;
        if (state.data) applyTheme(state.data.settings.theme || 'dark');
        if (state.data) applyAppearance(state.data.settings);
      }
      state.settingsSaved = false;
      state.previewTheme = null;
      state.previewAppearance = null;
    });

    els.confirmOk.addEventListener('click', () => {
      const action = state.confirmAction;
      const deleteFile = els.confirmDelete.checked;
      els.confirmDialog.close();
      if (action) action(deleteFile);
    });
    els.confirmDialog.addEventListener('close', () => {
      state.confirmAction = null;
    });

    const dropTargets = ['dragenter', 'dragover', 'dragleave', 'drop'];
    let dragDepth = 0;
    for (const name of dropTargets) {
      window.addEventListener(name, (event) => event.preventDefault());
    }
    window.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer) return;
      const types = Array.from(event.dataTransfer.types || []);
      if (!types.includes('text/uri-list') && !types.includes('text/plain') && !types.includes('text/html')) return;
      dragDepth += 1;
      els.drop.hidden = false;
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) els.drop.hidden = true;
    });
    window.addEventListener('drop', (event) => {
      dragDepth = 0;
      els.drop.hidden = true;
      const transfer = event.dataTransfer;
      if (!transfer) return;
      const raw = `${transfer.getData('text/uri-list')}\n${transfer.getData('text/plain')}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => isHttpUrl(line));
      if (raw) openAddDialog(raw);
    });

    if (window.arus?.isDesktop) {
      els.windowControls.hidden = false;
      els.windowControls.addEventListener('click', (event) => {
        const button = event.target.closest('[data-window]');
        if (button) window.arus.windowControl(button.dataset.window);
      });
      $('.titlebar')?.addEventListener('dblclick', (event) => {
        if (!event.target.closest('button')) window.arus.windowControl('maximize');
      });
      window.arus.onAddLink?.((url) => openAddDialog(url || ''));
      window.arus.onClipboardLink?.((url) => {
        if (!isHttpUrl(url)) return;
        if (!state.data?.settings.clipboardWatch) return;
        toast({
          icon: 'i-link',
          title: 'Link copied',
          body: url,
          timeout: 14000,
          actions: [{ label: 'Download', primary: true, onClick: () => openAddDialog(url) }]
        });
      });
    } else {
      els.windowControls.hidden = true;
      els.trayRow.hidden = true;
    }

    document.addEventListener('keydown', (event) => {
      const dialogOpen = Boolean(document.querySelector('dialog[open]'));
      const interactive = event.target.closest?.('input, textarea, select, button, a, [contenteditable]');

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (!dialogOpen) openAddDialog();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        if (!dialogOpen) openSettingsDialog();
        return;
      }
      if (dialogOpen) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        els.search.focus();
        els.search.select();
        return;
      }
      if (event.key === 'Escape' && !els.inspector.hidden) {
        closeInspector();
        return;
      }
      if (interactive) return;
      if (event.code === 'Space' && state.selectedId) {
        event.preventDefault();
        toggleSelected();
        return;
      }
      if (event.key === 'Delete' && state.selectedId) {
        event.preventDefault();
        const dl = findDownload(state.selectedId);
        if (dl) askRemove(dl);
      }
    });
  }

  async function loadMeta() {
    try {
      state.meta = await api('/api/meta');
      updateMetaHint();
    } catch {
      /* metadata is optional for the UI */
    }
  }

  async function loadInitialState() {
    try {
      const data = await api('/api/state');
      applyState(data);
    } catch (err) {
      toast({
        icon: 'i-alert',
        title: 'Cannot reach the engine',
        body: err.message,
        timeout: 0,
        actions: [{ label: 'Retry', primary: true, onClick: () => loadInitialState() }]
      });
    }
  }

  async function init() {
    try {
      const storedTheme = localStorage.getItem('arus.theme');
      if (storedTheme === 'light' || storedTheme === 'dark') {
        document.documentElement.dataset.theme = storedTheme;
      }
      const storedFilter = localStorage.getItem('arus.filter');
      if (storedFilter && [...LIBRARY, ...TYPES].some((entry) => entry.id === storedFilter)) {
        state.filter = storedFilter;
      }
    } catch {
      /* ignore */
    }

    buildNav();
    bindEvents();
    updateEmpty([]);

    const scanParam = new URLSearchParams(location.search).get('scan');
    const autoScan = scanParam && isHttpUrl(scanParam) ? scanParam : null;
    if (autoScan) {
      history.replaceState(null, '', location.pathname);
      requestAnimationFrame(() => openAddDialog(autoScan));
    }

    await Promise.all([loadInitialState(), loadMeta()]);
    renderUpdateCard();
    scheduleUpdateCheck();
    maybeFirstRun();
    connectEvents();
    if (autoScan) {
      requestAnimationFrame(() => {
        if (els.addDialog.open && state.tab === 'page' && els.scanUrl.value.trim() === autoScan) runScan();
      });
    }
  }

  document.addEventListener('arus:languagechange', () => {
    renderMetrics();
    renderList();
    renderInspector();
    renderUpdateCard();
  });

  init();
})();
