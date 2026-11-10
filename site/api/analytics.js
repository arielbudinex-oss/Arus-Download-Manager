const crypto = require('node:crypto');
const { list } = require('@vercel/blob');

const MAX_DAYS = 14;
const MAX_BLOBS = 500;
const CONCURRENCY = 25;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  const expected = process.env.REPORTS_KEY;
  const given = req.headers['x-reports-key'];
  if (!expected || typeof given !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseDevice(ua) {
  const text = typeof ua === 'string' ? ua : '';
  let browser = 'Other';
  if (/Edg\//.test(text)) browser = 'Edge';
  else if (/OPR\//.test(text)) browser = 'Opera';
  else if (/Firefox\//.test(text)) browser = 'Firefox';
  else if (/Chrome\//.test(text)) browser = 'Chrome';
  else if (/Safari\//.test(text)) browser = 'Safari';
  let os = 'Other';
  if (/Windows/.test(text)) os = 'Windows';
  else if (/Android/.test(text)) os = 'Android';
  else if (/iPhone|iPad|iOS/.test(text)) os = 'iOS';
  else if (/Mac OS X/.test(text)) os = 'macOS';
  else if (/Linux/.test(text)) os = 'Linux';
  return { browser, os };
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!authorized(req)) {
    json(res, 401, { error: 'Unauthorized' });
    return;
  }

  const requested = Number(new URL(req.url, 'http://x').searchParams.get('days'));
  const days = Math.min(Math.max(Number.isFinite(requested) && requested > 0 ? Math.round(requested) : 7, 1), MAX_DAYS);
  const now = new Date();
  const cutoff = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const collected = [];
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      const result = await list({ prefix: 'analytics/', limit: 100, cursor });
      collected.push(...result.blobs);
      if (!result.hasMore) break;
      cursor = result.cursor;
    }

    const matching = collected
      .filter((blob) => {
        const match = /^analytics\/(\d{4}-\d{2}-\d{2})\//.exec(blob.pathname || '');
        return match && match[1] >= cutoff;
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    const selected = matching.slice(0, MAX_BLOBS);
    const since = collected
      .map((blob) => (/^analytics\/(\d{4}-\d{2}-\d{2})\//.exec(blob.pathname || '') || [])[1])
      .filter(Boolean)
      .sort()[0] || null;

    const records = (await mapLimit(selected, CONCURRENCY, async (blob) => {
      try {
        const response = await fetch(blob.url, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    })).filter((record) => record && typeof record === 'object' && Array.isArray(record.events));

    const totals = { pageviews: 0, downloads: 0, github: 0, discord: 0, support: 0, lang: 0, faq: 0, nav: 0 };
    const vids = new Set();
    const ips = new Set();
    const clicks = { download: 0, github: 0, discord: 0, support: 0, lang: 0, faq: 0, nav: 0 };
    const countryMap = new Map();
    const dayMap = new Map();
    const sessionMap = new Map();
    const pageMap = new Map();
    const refMap = new Map();
    const ipMap = new Map();

    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dayMap.set(date, { date, pageviews: 0, visitors: new Set() });
    }

    function eventAt(event, fallback) {
      const ms = Number(event && event.at);
      if (Number.isFinite(ms) && ms > 0) {
        const date = new Date(ms);
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
      return fallback;
    }

    function noteEvent(session, at, name, label, href) {
      if (session.timeline.length >= 200) return;
      session.timeline.push({
        at,
        name,
        label: String(label || '').slice(0, 120),
        href: String(href || '').slice(0, 300)
      });
    }

    for (const record of records) {
      const at = new Date(record.at);
      const date = Number.isNaN(at.getTime()) ? cutoff : at.toISOString().slice(0, 10);
      const day = dayMap.get(date) || { date, pageviews: 0, visitors: new Set() };
      const vid = String(record.vid || '').slice(0, 64);
      if (vid) {
        vids.add(vid);
        day.visitors.add(vid);
      }
      if (record.ip && record.ip !== 'unknown') ips.add(record.ip);

      const ipKey = String(record.ip || 'unknown').slice(0, 64);
      let ipEntry = ipMap.get(ipKey);
      if (!ipEntry) {
        ipEntry = {
          ip: ipKey,
          firstAt: record.at,
          lastAt: record.at,
          sessions: new Set(),
          pageviews: 0,
          downloads: 0,
          clicks: 0,
          events: new Set(),
          country: '',
          region: '',
          city: '',
          lang: 'id',
          device: { browser: 'Other', os: 'Other' }
        };
        ipMap.set(ipKey, ipEntry);
      }
      if (!ipEntry.firstAt || new Date(record.at) < new Date(ipEntry.firstAt)) ipEntry.firstAt = record.at;
      if (!ipEntry.lastAt || new Date(record.at) >= new Date(ipEntry.lastAt)) {
        ipEntry.lastAt = record.at;
        ipEntry.country = record.country || ipEntry.country;
        ipEntry.region = record.region || ipEntry.region;
        ipEntry.city = record.city || ipEntry.city;
        ipEntry.lang = record.lang === 'en' ? 'en' : 'id';
        ipEntry.device = parseDevice(record.ua);
      }

      const sid = String(record.sid || '').slice(0, 64);
      let session = sessionMap.get(sid);
      if (!session) {
        session = {
          at: record.at,
          firstAt: record.at,
          ip: record.ip || '',
          country: record.country || '',
          region: record.region || '',
          city: record.city || '',
          lang: record.lang === 'en' ? 'en' : 'id',
          path: record.path || '/',
          ref: record.ref || '',
          vw: Number(record.vw) || 0,
          pageviews: 0,
          downloads: 0,
          events: new Set(),
          timeline: [],
          device: parseDevice(record.ua)
        };
      }
      ipEntry.sessions.add(sid);
      if (new Date(record.at) > new Date(session.at)) {
        session.at = record.at;
        session.ip = record.ip || session.ip;
        session.country = record.country || session.country;
        session.region = record.region || session.region;
        session.city = record.city || session.city;
        session.lang = record.lang === 'en' ? 'en' : 'id';
        session.path = record.path || session.path;
        session.ref = record.ref || session.ref;
        session.device = parseDevice(record.ua);
      }
      if (!session.firstAt || new Date(record.at) < new Date(session.firstAt)) session.firstAt = record.at;
      sessionMap.set(sid, session);

      const country = record.country || '??';
      const entry = countryMap.get(country) || { code: country, views: 0, visitors: new Set() };
      countryMap.set(country, entry);

      const recordPath = String(record.path || '/').slice(0, 80) || '/';
      const recordRef = String(record.ref || '').slice(0, 200);

      for (const event of record.events) {
        if (!event || typeof event.name !== 'string') continue;
        const when = eventAt(event, record.at);
        if (event.name === 'pageview') {
          totals.pageviews += 1;
          day.pageviews += 1;
          entry.views += 1;
          ipEntry.pageviews += 1;
          if (vid) entry.visitors.add(vid);
          session.pageviews += 1;
          session.events.add('pageview');
          noteEvent(session, when, 'pageview', recordPath, recordPath);
          const page = pageMap.get(recordPath) || { path: recordPath, views: 0, visitors: new Set() };
          page.views += 1;
          if (vid) page.visitors.add(vid);
          pageMap.set(recordPath, page);
          const ref = refMap.get(recordRef) || { host: recordRef, views: 0, visitors: new Set() };
          ref.views += 1;
          if (vid) ref.visitors.add(vid);
          refMap.set(recordRef, ref);
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(clicks, event.name)) {
          clicks[event.name] += 1;
          totals[event.name === 'download' ? 'downloads' : event.name] += 1;
          session.events.add(event.name);
          if (event.name === 'download') {
            session.downloads += 1;
            ipEntry.downloads += 1;
          }
          ipEntry.clicks += 1;
          ipEntry.events.add(event.name);
          noteEvent(session, when, event.name, event.label, event.href);
        }
      }
    }

    for (const day of dayMap.values()) {
      day.visitors = day.visitors.size;
    }

    const sessions = Array.from(sessionMap.values())
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 80)
      .map((session) => ({
        at: session.at,
        firstAt: session.firstAt,
        ip: session.ip,
        country: session.country,
        region: session.region,
        city: session.city,
        lang: session.lang,
        path: session.path,
        ref: session.ref,
        vw: session.vw,
        pageviews: session.pageviews,
        downloads: session.downloads,
        events: Array.from(session.events).filter((name) => name !== 'pageview'),
        device: session.device,
        timeline: session.timeline
          .slice()
          .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
          .slice(-40)
      }));

    const deviceMap = { browser: new Map(), os: new Map() };
    for (const session of sessionMap.values()) {
      const browser = (session.device && session.device.browser) || 'Other';
      const os = (session.device && session.device.os) || 'Other';
      deviceMap.browser.set(browser, (deviceMap.browser.get(browser) || 0) + 1);
      deviceMap.os.set(os, (deviceMap.os.get(os) || 0) + 1);
    }
    const topCounts = (map) => Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    const ipList = Array.from(ipMap.values())
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
      .slice(0, 24)
      .map((entry) => ({
        ip: entry.ip,
        firstAt: entry.firstAt,
        lastAt: entry.lastAt,
        country: entry.country,
        region: entry.region,
        city: entry.city,
        lang: entry.lang,
        device: entry.device,
        sessions: entry.sessions.size,
        pageviews: entry.pageviews,
        downloads: entry.downloads,
        clicks: entry.clicks,
        events: Array.from(entry.events)
      }));

    json(res, 200, {
      ok: true,
      days,
      cutoff,
      totals: {
        pageviews: totals.pageviews,
        visitors: vids.size,
        ips: ips.size,
        sessions: sessionMap.size,
        downloads: totals.downloads,
        github: totals.github,
        discord: totals.discord,
        support: totals.support
      },
      clicks,
      byDay: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      countries: Array.from(countryMap.values())
        .sort((a, b) => b.views - a.views)
        .slice(0, 8)
        .map((entry) => ({ code: entry.code, views: entry.views, visitors: entry.visitors.size })),
      pages: Array.from(pageMap.values())
        .sort((a, b) => b.views - a.views)
        .slice(0, 8)
        .map((entry) => ({ path: entry.path, views: entry.views, visitors: entry.visitors.size })),
      refs: Array.from(refMap.values())
        .sort((a, b) => b.views - a.views)
        .slice(0, 8)
        .map((entry) => ({ host: entry.host, views: entry.views, visitors: entry.visitors.size })),
      devices: {
        browsers: topCounts(deviceMap.browser),
        os: topCounts(deviceMap.os)
      },
      sessions,
      sessionsTotal: sessionMap.size,
      ipList,
      batches: records.length,
      since,
      truncated: matching.length > MAX_BLOBS
    });
  } catch (error) {
    console.error('analytics failed', error && error.message);
    json(res, 502, { error: 'Analytics unavailable' });
  }
};
