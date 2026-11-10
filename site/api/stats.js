const REPO = 'arielbudinex-oss/Arus-Download-Manager';
const CACHE = 'public, s-maxage=600, stale-while-revalidate=3600';

function json(res, status, payload, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(payload));
}

function parseCount(value) {
  const text = String(value == null ? '' : value).replace(/,/g, '').trim();
  const match = /^([\d.]+)\s*([kKmMbB])?/.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  if (!isFinite(number)) return null;
  const unit = (match[2] || '').toLowerCase();
  const factor = unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : unit === 'b' ? 1e9 : 1;
  return Math.round(number * factor);
}

async function fromGitHub() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'arus-site' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  }
  const [releasesResponse, repoResponse] = await Promise.all([
    fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=100', { headers }),
    fetch('https://api.github.com/repos/' + REPO, { headers })
  ]);
  if (!releasesResponse.ok || !repoResponse.ok) throw new Error('GitHub API');
  const releases = await releasesResponse.json();
  const repo = await repoResponse.json();
  let downloads = 0;
  (Array.isArray(releases) ? releases : []).forEach((release) => {
    (release.assets || []).forEach((asset) => {
      downloads += Number(asset.download_count) || 0;
    });
  });
  return {
    downloads,
    stars: Number(repo.stargazers_count) || 0,
    forks: Number(repo.forks_count) || 0
  };
}

async function fromShields() {
  const [downloadsResponse, starsResponse, forksResponse] = await Promise.all([
    fetch('https://img.shields.io/github/downloads/' + REPO + '/total.json'),
    fetch('https://img.shields.io/github/stars/' + REPO + '.json'),
    fetch('https://img.shields.io/github/forks/' + REPO + '.json')
  ]);
  if (!downloadsResponse.ok) throw new Error('Shields');
  const downloads = parseCount((await downloadsResponse.json()).message);
  if (downloads === null) throw new Error('Shields');
  let stars = null;
  let forks = null;
  if (starsResponse.ok) stars = parseCount((await starsResponse.json()).message);
  if (forksResponse.ok) forks = parseCount((await forksResponse.json()).message);
  return { downloads, stars, forks };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    json(res, 405, { error: 'Method not allowed' }, 'no-store');
    return;
  }

  try {
    json(res, 200, await fromGitHub(), CACHE);
    return;
  } catch {
    /* GitHub bisa membatasi permintaan tanpa token */
  }

  try {
    json(res, 200, await fromShields(), CACHE);
    return;
  } catch {
    json(res, 502, { error: 'Stats unavailable' }, 'no-store');
  }
};
