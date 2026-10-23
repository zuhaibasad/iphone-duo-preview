// Visitor badges for the top bar.
//
// active: who has the page open now. Each tab sends a heartbeat every ~25 s; the list
//   lives in this function's memory. Fluid compute serves concurrent requests from one
//   warm instance, so every visitor sees the same number; a cold start just resets it.
// total:  all-time unique visitors from Vercel Web Analytics (same numbers as the
//   dashboard), cached for a minute. Needs VERCEL_ANALYTICS_TOKEN; null without it.
const ACTIVE_MS = 70 * 1000;
const TOTAL_TTL_MS = 60 * 1000;
const MAX_TRACKED = 10000;
const PROJECT_ID = process.env.ANALYTICS_PROJECT_ID || 'prj_9Ew9a8ZYQiGT9Fc4fDJCBHA0W4in';
const TEAM_ID = process.env.ANALYTICS_TEAM_ID || 'team_NpHkPL89u7DdadISRANjHSfP';

const seen = new Map(); // visitor id → last heartbeat (ms)
let totalCache = { at: 0, value: null };

function activeCount() {
  const cutoff = Date.now() - ACTIVE_MS;
  for (const [id, t] of seen) if (t < cutoff) seen.delete(id);
  return seen.size;
}

async function totalVisitors() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) return null;
  if (Date.now() - totalCache.at < TOTAL_TTL_MS) return totalCache.value;
  totalCache.at = Date.now();
  try {
    const u = new URL('https://api.vercel.com/v1/query/web-analytics/visits/count');
    u.searchParams.set('teamId', TEAM_ID);
    u.searchParams.set('projectId', PROJECT_ID);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      if (Number.isFinite(j?.data?.visitors)) totalCache.value = j.data.visitors;
    }
  } catch {
    // keep the last good value
  }
  return totalCache.value;
}

function readJson(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { if (s.length < 512) s += c; });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === 'POST') {
    const { id, leave } = await readJson(req);
    if (typeof id === 'string' && /^[a-z0-9-]{8,64}$/i.test(id)) {
      if (leave) seen.delete(id);
      else if (seen.has(id) || seen.size < MAX_TRACKED) seen.set(id, Date.now());
    }
  }
  const total = await totalVisitors();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ active: activeCount(), total }));
};
