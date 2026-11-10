const crypto = require('node:crypto');
const { list } = require('@vercel/blob');

const MAX_REPORTS = 30;

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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!authorized(req)) {
    json(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const collected = [];
    let cursor;
    for (let page = 0; page < 10; page += 1) {
      const result = await list({ prefix: 'reports/', limit: 100, cursor });
      collected.push(...result.blobs);
      if (!result.hasMore) break;
      cursor = result.cursor;
    }
    const blobs = collected
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, MAX_REPORTS);
    const hasMore = collected.length > MAX_REPORTS;

    const reports = await Promise.all(blobs.map(async (blob) => {
      try {
        const response = await fetch(blob.url, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }));

    json(res, 200, {
      ok: true,
      reports: reports.filter(Boolean),
      hasMore,
    });
  } catch (error) {
    console.error('report list failed', error && error.message);
    json(res, 502, { error: 'Could not load reports' });
  }
};
