// Visitor badges for the top bar.
//
// active: who has the page open now. Each tab sends a heartbeat every ~25 s. The
//   id → last-seen map lives in Vercel Runtime Cache, which every function instance
//   in the region shares (in-process memory alone gave each instance its own count).
//   Concurrent writes can drop a heartbeat; the next one, 25 s later, restores it.
// total: all-time unique visitors from Vercel Web Analytics (same numbers as the
//   dashboard), cached for a minute. Needs VERCEL_ANALYTICS_TOKEN; null without it.
const { getCache } = require('@vercel/functions');

const ACTIVE_MS = 70 * 1000;
const TOTAL_TTL_S = 60;
const MAX_TRACKED = 5000; // keeps the presence entry far below the 2 MB item limit
const PROJECT_ID = process.env.ANALYTICS_PROJECT_ID || 'prj_9Ew9a8ZYQiGT9Fc4fDJCBHA0W4in';
const TEAM_ID = process.env.ANALYTICS_TEAM_ID || 'team_NpHkPL89u7DdadISRANjHSfP';

// On Hobby every project in the team shares one Runtime Cache, hence the namespace.
const cache = getCache({ namespace: 'iphone-duo-preview' });

async function presence(id, leave) {
  const now = Date.now();
  const seen = (await cache.get('presence')) || {};
  for (const k of Object.keys(seen)) if (now - seen[k] > ACTIVE_MS) delete seen[k];
  if (id) {
    const changed = leave ? id in seen : true;
    if (leave) delete seen[id];
    else if (id in seen || Object.keys(seen).length < MAX_TRACKED) seen[id] = now;
    if (changed) await cache.set('presence', seen, { ttl: Math.ceil(ACTIVE_MS / 1000) * 2, name: 'online visitors' });
  }
  return Object.keys(seen).length;
}

async function totalVisitors() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) return null;
  const cached = await cache.get('total');
  if (cached && typeof cached.value === 'number') return cached.value;
  try {
    const u = new URL('https://api.vercel.com/v1/query/web-analytics/visits/count');
    u.searchParams.set('teamId', TEAM_ID);
    u.searchParams.set('projectId', PROJECT_ID);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const value = j?.data?.visitors;
    if (!Number.isFinite(value)) return null;
    await cache.set('total', { value }, { ttl: TOTAL_TTL_S, name: 'total visitors' });
    return value;
  } catch {
    return null;
  }
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
  let id = null, leave = false;
  if (req.method === 'POST') {
    const body = await readJson(req);
    if (typeof body.id === 'string' && /^[a-z0-9-]{8,64}$/i.test(body.id)) id = body.id;
    leave = !!body.leave;
  }
  const [active, total] = await Promise.all([presence(id, leave), totalVisitors()]);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ active, total }));
};
