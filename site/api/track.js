const crypto = require('node:crypto');
const { put } = require('@vercel/blob');

const MAX_BODY = 16 * 1024;
const MAX_EVENTS = 20;
const NAMES = new Set(['pageview', 'download', 'github', 'discord', 'support', 'faq', 'lang', 'nav']);
const WINDOW_MS = 60 * 60 * 1000;
const MAX_BATCHES = 120;
const buckets = new Map();

function clean(value, limit) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return clean(req.headers['x-real-ip'], 64) || 'unknown';
}

function limited(ip) {
  const now = Date.now();
  const list = (buckets.get(ip) || []).filter((at) => now - at < WINDOW_MS);
  if (list.length >= MAX_BATCHES) {
    buckets.set(ip, list);
    return true;
  }
  list.push(now);
  buckets.set(ip, list);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

function city(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    return clean(decodeURIComponent(value), 64);
  } catch {
    return clean(value, 64);
  }
}

function end(res, status) {
  res.statusCode = status;
  res.end();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    end(res, 405);
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) {
      end(res, 413);
      return;
    }
    try {
      body = JSON.parse(body);
    } catch {
      end(res, 400);
      return;
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    end(res, 400);
    return;
  }

  const vid = clean(body.vid, 64);
  const sid = clean(body.sid, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(vid) || !/^[A-Za-z0-9_-]{8,64}$/.test(sid)) {
    end(res, 400);
    return;
  }

  const raw = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const now = Date.now();
  const events = raw
    .filter((event) => event && NAMES.has(event.name))
    .map((event) => ({
      name: event.name,
      label: clean(event.label, 120),
      href: clean(event.href, 300),
      at: Number.isFinite(Number(event.at)) ? Number(event.at) : now
    }));
  if (!events.length) {
    end(res, 204);
    return;
  }

  const ip = clientIp(req);
  if (limited(ip)) {
    end(res, 429);
    return;
  }

  const stamp = new Date(now);
  const date = stamp.toISOString().slice(0, 10);
  const record = {
    at: stamp.toISOString(),
    vid,
    sid,
    ip,
    country: clean(req.headers['x-vercel-ip-country'], 8),
    region: clean(req.headers['x-vercel-ip-country-region'], 16),
    city: city(req.headers['x-vercel-ip-city']),
    ua: clean(req.headers['user-agent'], 300),
    ref: clean(body.ref, 200),
    lang: body.lang === 'en' ? 'en' : 'id',
    path: clean(body.path, 80) || '/',
    vw: Math.min(Math.max(Number(body.vw) || 0, 0), 10000),
    events
  };

  const pathname = `analytics/${date}/${now}_${crypto.randomBytes(4).toString('hex')}.json`;
  try {
    await put(pathname, JSON.stringify(record), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      cacheControlMaxAge: 60
    });
  } catch (error) {
    console.error('track store failed', error && error.message);
    end(res, 502);
    return;
  }

  end(res, 204);
};
