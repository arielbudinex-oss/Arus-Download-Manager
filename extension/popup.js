'use strict';

const $ = (selector) => document.querySelector(selector);
const svgNS = 'http://www.w3.org/2000/svg';

const els = {
  refresh: $('#refresh'),
  server: $('#server'),
  serverDot: $('#server-dot'),
  serverText: $('#server-text'),
  pageHost: $('#page-host'),
  count: $('#count'),
  list: $('#list'),
  empty: $('#empty'),
  bulk: $('#bulk'),
  sendAll: $('#send-all'),
  copyAll: $('#copy-all'),
  manual: $('#manual'),
  url: $('#url'),
  status: $('#status'),
  optTakeover: $('#opt-takeover'),
  optOverlay: $('#opt-overlay'),
  optSite: $('#opt-site'),
  optSiteNote: $('#opt-site-note'),
  openApp: $('#open-app'),
  scanPage: $('#scan-page'),
  emptyTitle: $('#empty-title'),
  emptyHint: $('#empty-hint')
};

let currentTab = null;
let currentItems = [];
let serverBase = null;
let siteHost = '';
let siteOverlay = {};
let statusTimer = null;

function svgIcon(name) {
  const paths = {
    video: '<rect x="3" y="5.5" width="12.5" height="13" rx="2.2"></rect><path d="m15.5 10.5 5-3v9l-5-3z"></path>',
    audio: '<path d="M9 17.5V6.2l10-2v11.3"></path><circle cx="6.8" cy="17.5" r="2.2"></circle><circle cx="16.8" cy="15.5" r="2.2"></circle>',
    subtitle: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="M7 12h4M13 12h4M7 15.5h6M15 15.5h2"></path>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"></path><path d="M5 18.5h14"></path>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
    file: '<path d="M7 3.5h6.8L18 7.8v12.7H7z"></path><path d="M13.8 3.5v4.3H18"></path>'
  };
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths[name] || paths.file;
  return svg;
}

function setButtonIcon(button, name) {
  button.replaceChildren(svgIcon(name));
}

function setButtonBusy(button) {
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  button.replaceChildren(spinner);
}

function setStatus(message, kind = 'info', autoHide = 0) {
  if (statusTimer) clearTimeout(statusTimer);
  els.status.hidden = !message;
  els.status.textContent = message || '';
  els.status.dataset.kind = kind;
  if (message && autoHide) statusTimer = setTimeout(() => { els.status.hidden = true; }, autoHide);
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function isProtectedPage(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'youtu.be' || /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com)$/.test(host);
  } catch {
    return false;
  }
}

function setServerState(base) {
  serverBase = base;
  els.serverDot.classList.toggle('is-on', Boolean(base));
  els.serverText.textContent = base ? 'Engine online' : 'Engine offline';
  els.server.title = base ? `Connected to ${base}` : 'Start Arus to download';
}

async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    return { error: err?.message || 'Extension background is unavailable.' };
  }
}

async function refresh() {
  els.refresh.disabled = true;
  const [status, list] = await Promise.all([
    send({ type: 'server:status' }),
    send({ type: 'media:list', tabId: currentTab?.id })
  ]);
  setServerState(status?.base || null);
  currentItems = Array.isArray(list?.items) ? list.items : [];
  renderList();
  els.refresh.disabled = false;
}

function renderList() {
  const protectedPage = isProtectedPage(currentTab?.url || '');
  els.emptyTitle.textContent = protectedPage ? 'YouTube is not supported' : 'No media yet';
  els.emptyHint.textContent = protectedPage
    ? 'Its streams are protected. Send a direct MP4, HLS, or DASH link instead.'
    : 'Play the video, then refresh.';
  els.count.textContent = String(currentItems.length);
  els.empty.hidden = currentItems.length > 0;
  els.bulk.hidden = currentItems.length === 0;
  els.list.replaceChildren();
  if (!currentItems.length) return;

  const fragment = document.createDocumentFragment();
  for (const item of currentItems) {
    const row = document.createElement('div');
    row.className = 'item';

    const icon = document.createElement('div');
    icon.className = 'item-icon';
    const iconName = item.media === 'audio' ? 'audio' : item.media === 'subtitle' ? 'subtitle' : 'video';
    icon.append(svgIcon(iconName));

    const main = document.createElement('div');
    main.className = 'item-main';
    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = item.name || item.url;
    name.title = item.url;
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    for (const text of [item.label, item.quality, hostname(item.url)].filter(Boolean)) {
      const span = document.createElement('span');
      span.textContent = text;
      meta.append(span);
    }
    main.append(name, meta);

    const supported = item.supported !== false;
    let action;
    if (supported) {
      action = document.createElement('button');
      action.type = 'button';
      action.className = 'send';
      action.title = 'Send to Arus';
      action.setAttribute('aria-label', 'Send to Arus');
      setButtonIcon(action, 'download');
      action.addEventListener('click', () => captureItem(item, action));
    } else {
      action = document.createElement('span');
      action.className = 'unsupported';
      action.textContent = 'Unsupported';
      action.title = 'This stream is not supported';
    }

    row.append(icon, main, action);
    fragment.append(row);
  }
  els.list.append(fragment);
}

async function captureItem(item, button) {
  button.disabled = true;
  setButtonBusy(button);
  button.removeAttribute('aria-label');
  const pageUrl = currentTab?.url || null;
  const filename = item.kind === 'file' && /\.[a-z0-9]{1,8}$/i.test(item.name || '') ? item.name : undefined;
  const result = await send({
    type: 'capture',
    url: item.url,
    pageUrl,
    tabId: currentTab?.id,
    filename,
    kind: item.kind
  });
  if (result?.error) {
    button.disabled = false;
    setButtonIcon(button, 'download');
    button.setAttribute('aria-label', 'Send to Arus');
    setStatus(result.error, 'error');
    return;
  }
  button.classList.add('is-done');
  setButtonIcon(button, 'check');
  button.setAttribute('aria-label', 'Sent');
  button.title = 'Sent to Arus';
  setStatus(`Sent to Arus${result.download?.filename ? `: ${result.download.filename}` : '.'}`, 'ok', 4000);
}

async function sendAll() {
  const targets = currentItems.filter((item) => item.supported !== false);
  if (!targets.length) {
    setStatus('Nothing on this page can be sent.', 'error');
    return;
  }
  els.sendAll.disabled = true;
  els.copyAll.disabled = true;
  let sent = 0;
  let failed = 0;
  for (const item of targets) {
    const filename = item.kind === 'file' && /\.[a-z0-9]{1,8}$/i.test(item.name || '') ? item.name : undefined;
    const result = await send({
      type: 'capture',
      url: item.url,
      pageUrl: currentTab?.url || null,
      tabId: currentTab?.id,
      filename,
      kind: item.kind
    });
    if (result?.error) failed += 1;
    else sent += 1;
  }
  els.sendAll.disabled = false;
  els.copyAll.disabled = false;
  if (!sent) {
    setStatus('Could not send anything to Arus.', 'error');
    return;
  }
  setStatus(`Sent ${sent} item${sent === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}.`, failed ? 'error' : 'ok', 5000);
}

async function copyAll() {
  const links = currentItems.map((item) => item.url);
  if (!links.length) return;
  try {
    await navigator.clipboard.writeText(links.join('\n'));
    setStatus(`Copied ${links.length} link${links.length === 1 ? '' : 's'}.`, 'ok', 4000);
  } catch {
    setStatus('Could not copy the links.', 'error');
  }
}

function updateSiteToggle() {
  const hidden = Boolean(siteHost) && siteOverlay[siteHost] === false;
  els.optSite.checked = !siteHost || !hidden;
  els.optSite.disabled = !siteHost || !els.optOverlay.checked;
  els.optSiteNote.textContent = siteHost
    ? `${hidden ? 'Hidden' : 'Shown'} on ${siteHost}.`
    : 'Available on http and https pages.';
}

function loadPrefs() {
  siteHost = hostname(currentTab?.url || '');
  chrome.storage.local.get({ takeover: true, overlay: true, siteOverlay: {} }, (stored) => {
    els.optTakeover.checked = stored.takeover !== false;
    els.optOverlay.checked = stored.overlay !== false;
    siteOverlay = stored.siteOverlay && typeof stored.siteOverlay === 'object' ? stored.siteOverlay : {};
    updateSiteToggle();
  });
}

async function openApp({ scan }) {
  if (scan && isProtectedPage(currentTab?.url || '')) {
    setStatus('YouTube pages cannot be scanned. Send a direct video, HLS, or DASH link instead.', 'error');
    return;
  }
  if (scan && !/^https?:/i.test(currentTab?.url || '')) {
    setStatus('This page cannot be scanned.', 'error');
    return;
  }
  const result = await send({ type: 'open:app', pageUrl: scan ? currentTab?.url : undefined });
  if (result?.error) {
    setStatus(result.error, 'error');
    return;
  }
  window.close();
}

function init() {
  els.refresh.addEventListener('click', refresh);
  els.manual.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = els.url.value.trim();
    if (!/^https?:\/\//i.test(value)) {
      setStatus('Enter an http or https link.', 'error');
      els.url.focus();
      return;
    }
    const button = els.manual.querySelector('button');
    button.disabled = true;
    send({ type: 'capture', url: value, tabId: currentTab?.id, pageUrl: currentTab?.url || undefined })
      .then((result) => {
        if (result?.error) {
          setStatus(result.error, 'error');
          return;
        }
        els.url.value = '';
        setStatus('Link sent to Arus.', 'ok', 4000);
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  els.openApp.addEventListener('click', () => openApp({ scan: false }));
  els.scanPage.addEventListener('click', () => openApp({ scan: true }));
  els.sendAll.addEventListener('click', sendAll);
  els.copyAll.addEventListener('click', copyAll);

  els.optTakeover.addEventListener('change', () => {
    chrome.storage.local.set({ takeover: els.optTakeover.checked });
  });
  els.optOverlay.addEventListener('change', () => {
    chrome.storage.local.set({ overlay: els.optOverlay.checked });
    updateSiteToggle();
  });
  els.optSite.addEventListener('change', () => {
    if (!siteHost) return;
    siteOverlay = { ...siteOverlay, [siteHost]: els.optSite.checked };
    chrome.storage.local.set({ siteOverlay });
    updateSiteToggle();
  });

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    currentTab = tabs?.[0] || null;
    const host = hostname(currentTab?.url || '');
    els.pageHost.textContent = host || 'This page';
    els.pageHost.title = currentTab?.url || '';
    loadPrefs();
    refresh();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !currentTab) return;
    if (changes[`media:${currentTab.id}`]) refresh();
  });
}

init();
