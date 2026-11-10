const crypto = require('node:crypto');
const { put } = require('@vercel/blob');

const MAX_BODY = 48 * 1024;
const MAX_MESSAGE = 4000;
const MAX_CONTACT = 200;
const MAX_LOGS = 80;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

function clean(value, limit) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, limit);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) {
      json(res, 413, { error: 'Report is too large' });
      return;
    }
    try {
      body = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    json(res, 400, { error: 'Invalid report' });
    return;
  }
  if (typeof body.honeypot === 'string' && body.honeypot.trim()) {
    json(res, 200, { ok: true });
    return;
  }

  const message = clean(body.message, MAX_MESSAGE);
  if (message.length < 10) {
    json(res, 400, { error: 'Tell us what happened in at least 10 characters' });
    return;
  }
  const contact = clean(body.contact, MAX_CONTACT);

  let diagnostics = body.diagnostics;
  if (diagnostics && typeof diagnostics === 'object') {
    diagnostics = JSON.stringify(diagnostics).slice(0, 12000);
    try {
      diagnostics = JSON.parse(diagnostics);
    } catch {
      diagnostics = undefined;
    }
  } else {
    diagnostics = undefined;
  }

  const rawLogs = Array.isArray(body.logs) ? body.logs.slice(-MAX_LOGS) : [];
  const logs = rawLogs
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      level: clean(entry.level, 12),
      at: clean(entry.at, 32),
      message: clean(entry.message, 500),
    }));

  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify({ message, contact, diagnostics, logs }));
  } catch {
    size = MAX_BODY + 1;
  }
  if (size > 40000) {
    json(res, 413, { error: 'Report is too large' });
    return;
  }

  const now = new Date();
  const id = `report_${now.getTime()}_${crypto.randomUUID().slice(0, 8)}`;
  const report = {
    id,
    createdAt: now.toISOString(),
    message,
    contact,
    app: {
      version: clean(body.app && body.app.version, 32),
      build: clean(body.app && body.app.build, 64),
      channel: clean(body.app && body.app.channel, 32),
    },
    diagnostics,
    logs,
    request: {
      country: clean(req.headers['x-vercel-ip-country'], 4),
      userAgent: clean(req.headers['user-agent'], 300),
    },
  };

  try {
    await put(`reports/${id}.json`, JSON.stringify(report), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    console.error('report store failed', error && error.message);
    json(res, 502, { error: 'Report could not be saved. Please try again.' });
    return;
  }

  json(res, 201, { ok: true, id });
};
