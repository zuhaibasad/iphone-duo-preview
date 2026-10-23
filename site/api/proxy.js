// Mirrors a site through this origin as iPhone Safari would see it, so the preview
// iframes can load it: no X-Frame-Options/CSP blocks, and no CORS failures for module
// scripts, fonts or WebGL textures (everything is same-origin).
//
//   /m/<mode>/<scheme>/<host>/<path>   a page, rendered for one display mode
//   /m/_/<scheme>/<host>/<path>        any subresource (shared by all modes, CDN-cacheable)
//   /<anything else>                   root-absolute requests from the page ("/assets/x.js");
//                                      the target site comes from the duo_up cookie
//
// vercel.json rewrites those paths here as __m/__s/__h/__p or __fb query params.
const dns = require('dns').promises;
const net = require('net');

// iOS 26+ Safari freezes the OS token at 18_6; only Version/ moves.
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1';

const MODES = ['folded', 'landscape', 'portrait', 'seated', 'split'];
const SCREENS = { folded: [466, 678], landscape: [890, 626], portrait: [626, 890], seated: [626, 890], split: [890, 626] };
const ASSET = '_';
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BYTES = 60 * 1024 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15000;
// Per IP per minute, per warm instance. A game can pull hundreds of assets per load.
const LIMITS = { page: 120, asset: 3000 };
const hits = new Map();

function rateLimited(ip, kind) {
  const key = kind + ':' + ip;
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.start > 60000) {
    hits.set(key, { start: now, n: 1 });
    return false;
  }
  rec.n += 1;
  return rec.n > LIMITS[kind];
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublic(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs are supported.');
  if (url.port && !['80', '443', ''].includes(url.port)) throw new Error('Only standard ports are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private hosts are not allowed.');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Private hosts are not allowed.');
}

async function fetchFollowing(url, init) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(current);
    const res = await fetch(current, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current);
      if (res.status === 303) init = { ...init, method: 'GET', body: undefined };
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error('Too many redirects.');
}

async function readCapped(stream, max, what) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) throw new Error(`${what} is larger than ${Math.round(max / 1048576)} MB.`);
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) reject(new Error('Request body too large.'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function charsetOf(contentType, head) {
  const m = /charset=([\w-]+)/i.exec(contentType) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : 'utf-8';
}
function decode(buf, contentType) {
  try {
    return new TextDecoder(charsetOf(contentType, buf.subarray(0, 2048).toString('latin1'))).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

const mirrorPrefix = (seg, u) => `/m/${seg}/${u.protocol.slice(0, -1)}/${u.host}`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cookie(req, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// Runs inside the mirrored page before any of its own scripts.
function shim(finalUrl, mode) {
  const up = finalUrl.origin;
  const ap = mirrorPrefix(ASSET, finalUrl);
  const dims = SCREENS[mode] || SCREENS.folded;
  return `<script>(function(){
var UA=${JSON.stringify(IPHONE_UA)},UP=${JSON.stringify(up)},AP=${JSON.stringify(ap)},BASE=${JSON.stringify(finalUrl.href)},mode=${JSON.stringify(mode)};
// Routers read location: show the real path (on this origin) instead of the mirror path.
try{history.replaceState(history.state,'',${JSON.stringify(finalUrl.pathname + finalUrl.search + finalUrl.hash)});}catch(e){}
function def(o,k,v){try{Object.defineProperty(o,k,{get:function(){return v},configurable:true})}catch(e){}}
var N=Navigator.prototype;
def(N,'userAgent',UA);def(N,'appVersion',UA.slice(8));def(N,'platform','iPhone');
def(N,'vendor','Apple Computer, Inc.');def(N,'maxTouchPoints',5);def(N,'userAgentData',undefined);
try{window.ontouchstart=null;}catch(e){}
def(Screen.prototype,'width',${dims[0]});def(Screen.prototype,'height',${dims[1]});
def(Screen.prototype,'availWidth',${dims[0]});def(Screen.prototype,'availHeight',${dims[1]});
def(window,'devicePixelRatio',3);
var mm=window.matchMedia.bind(window);
window.matchMedia=function(q){
  var s=String(q);
  if(/\\((any-)?pointer:\\s*coarse\\)|\\((any-)?hover:\\s*none\\)/.test(s)&&!/,/.test(s)){var r=mm('all');def(r,'matches',true);return r;}
  if(/\\((any-)?pointer:\\s*fine\\)|\\((any-)?hover:\\s*hover\\)/.test(s)&&!/,/.test(s)){var r2=mm('not all');def(r2,'matches',false);return r2;}
  return mm(q);
};
// Requests to the site's own origin (absolute, or root-absolute on ours) go through the mirror.
function fix(u){try{var x=new URL(u,document.baseURI);
  if(!/^https?:$/.test(x.protocol))return u; // blob:, data: (three.js textures) stay as they are
  if(x.origin===UP||(x.origin===location.origin&&x.pathname.indexOf('/m/')!==0&&x.pathname.indexOf('/api/proxy')!==0))return AP+x.pathname+x.search+x.hash;
}catch(e){}return u;}
var of=window.fetch;
if(of)window.fetch=function(i,o){
  if(typeof i==='string'||i instanceof URL)i=fix(String(i));
  else if(i&&i.url){var f=fix(i.url);if(f!==i.url)i=new Request(f,i);}
  return of.call(this,i,o);
};
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){arguments[1]=fix(String(u));return xo.apply(this,arguments);};
// Mirror URL (or a root path on this origin) back to the real one.
function toReal(h){try{var x=new URL(h,document.baseURI);
  if(x.origin!==location.origin)return x.href;
  var m=/^\\/m\\/[^/]+\\/(https?)\\/([^/]+)(\\/.*)?$/.exec(x.pathname);
  return m?m[1]+'://'+m[2]+(m[3]||'/')+x.search+x.hash:UP+x.pathname+x.search+x.hash;
}catch(e){return null}}
function post(m){m.mode=mode;try{parent.postMessage(m,'*')}catch(e){}}
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest&&e.target.closest('a[href]');
  if(!a||e.defaultPrevented)return;
  var h=a.getAttribute('href');if(!h||h[0]==='#'||/^(javascript|mailto|tel|sms):/i.test(h))return;
  var u=toReal(h);if(!u)return;e.preventDefault();post({type:'duo-nav',url:u});
},true);
document.addEventListener('submit',function(e){
  var f=e.target;if((f.method||'get').toLowerCase()!=='get')return;
  e.preventDefault();var u=new URL(toReal(f.getAttribute('action')||BASE));
  new FormData(f).forEach(function(v,k){if(typeof v==='string')u.searchParams.append(k,v)});
  post({type:'duo-nav',url:u.href});
},true);
function report(){
  var de=document.documentElement,b=document.body;
  var vp=document.querySelector('meta[name="viewport"]');
  post({type:'duo-metrics',url:BASE,title:document.title,
    viewportMeta:vp?vp.getAttribute('content'):null,
    innerWidth:window.innerWidth,innerHeight:window.innerHeight,
    scrollWidth:Math.max(de.scrollWidth,b?b.scrollWidth:0),
    scrollHeight:Math.max(de.scrollHeight,b?b.scrollHeight:0)});
}
document.addEventListener('DOMContentLoaded',report);
window.addEventListener('load',function(){report();setTimeout(report,1500);});
window.addEventListener('resize',report);
})();</script>`;
}

// Root-absolute and same-origin absolute URLs in markup/CSS → the shared asset mirror.
function rewriteUrls(text, finalUrl, attrs) {
  const ap = mirrorPrefix(ASSET, finalUrl);
  const host = escapeRe(finalUrl.host);
  const same = `(?:https?:)?\\/\\/${host}(?=[\\/"'\\s)]|$)`;
  if (attrs) {
    return text.replace(
      new RegExp(`(\\s(?:src|href|action|poster|data-src)\\s*=\\s*["'])(?:${same}|(?=\\/(?!\\/)))`, 'gi'),
      `$1${ap}`
    );
  }
  return text.replace(new RegExp(`(url\\(\\s*["']?)(?:${same}|(?=\\/(?!\\/)))`, 'gi'), `$1${ap}`);
}

function rewriteHtml(html, finalUrl, mode) {
  const base = mirrorPrefix(ASSET, finalUrl) + finalUrl.pathname + finalUrl.search;
  const inject = `<base href="${base.replace(/"/g, '&quot;')}">` + shim(finalUrl, mode);
  html = html
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, '')
    .replace(/<base\s[^>]*>/gi, '');
  html = rewriteUrls(html, finalUrl, true);
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, b) => a + rewriteUrls(css, finalUrl, false) + b);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + inject);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + '<head>' + inject + '</head>');
  return inject + html;
}

function errorPage(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const safe = String(message).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;height:100vh;display:grid;place-items:center;font:15px -apple-system,system-ui,sans-serif;color:#6b6760;background:#f4f1ea;text-align:center;padding:24px;box-sizing:border-box"><div><div style="font-size:17px;color:#2b2925;margin-bottom:6px">Safari can't open the page</div>${safe}</div><script>parent.postMessage({type:'duo-error',message:${JSON.stringify(String(message))}},'*')</script>`);
}

// Works out what is being asked for: { seg, target, fallback } or { redirect } or { error }.
function parseRequest(req) {
  const q = new URL(req.url, 'http://x').searchParams;
  const take = (k) => { const v = q.get(k); q.delete(k); return v; };
  // Vercel also appends the route's named params; they are ours, not the site's.
  for (const k of ['duoSeg', 'duoScheme', 'duoHost', 'duoPath', 'duoFb']) q.delete(k);
  const rest = () => (q.toString() ? '?' + q.toString() : '');
  if (q.has('__m')) {
    const seg = take('__m'), scheme = take('__s'), host = take('__h'), path = take('__p') || '';
    if (!/^https?$/.test(scheme || '') || !host) return { error: 'That address is not a valid URL.' };
    return { seg, target: new URL(`${scheme}://${host}/${path}${rest()}`) };
  }
  if (q.has('__fb')) {
    const up = cookie(req, 'duo_up');
    const path = take('__fb') || '';
    if (!up) return { notFound: true };
    return { seg: ASSET, fallback: true, target: new URL('/' + path + rest(), up) };
  }
  if (q.has('__probe')) return { probe: true };
  // Old form: /api/proxy?url=…&__duo=mode
  if (q.has('url')) {
    let u;
    try { u = new URL(q.get('url')); } catch { return { error: 'That address is not a valid URL.' }; }
    const mode = MODES.includes(q.get('__duo')) ? q.get('__duo') : 'folded';
    return { redirect: mirrorPrefix(mode, u) + u.pathname + u.search };
  }
  return { error: 'That address is not a valid URL.' };
}

module.exports = async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let parsed;
  try {
    parsed = parseRequest(req);
  } catch {
    return errorPage(res, 400, 'That address is not a valid URL.');
  }
  if (parsed.probe) { res.statusCode = 204; res.setHeader('X-Duo-Proxy', '1'); res.setHeader('Cache-Control', 'no-store'); return res.end(); }
  if (parsed.error) return errorPage(res, 400, parsed.error);
  if (parsed.notFound) { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('Not found'); }
  if (parsed.redirect) { res.statusCode = 302; res.setHeader('Location', parsed.redirect); return res.end(); }

  const { seg, target, fallback } = parsed;
  const isPage = MODES.includes(seg);
  if (rateLimited(ip, isPage ? 'page' : 'asset')) return errorPage(res, 429, 'Too many requests. Wait a minute and try again.');

  try {
    const method = req.method === 'HEAD' ? 'HEAD' : req.method || 'GET';
    const headers = {
      'User-Agent': IPHONE_UA,
      Accept: isPage ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : req.headers.accept || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Sec-CH-UA-Mobile': '?1',
      'Sec-CH-UA-Platform': '"iOS"',
    };
    for (const h of ['range', 'content-type', 'if-none-match', 'if-modified-since']) if (req.headers[h]) headers[h] = req.headers[h];
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
    const { res: upstream, finalUrl } = await fetchFollowing(target, { method, headers, body });
    const type = upstream.headers.get('content-type') || '';

    if (isPage && /text\/html|application\/xhtml/i.test(type)) {
      const html = decode(await readCapped(upstream.body, MAX_PAGE_BYTES, 'Page'), type);
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Set-Cookie', `duo_up=${encodeURIComponent(finalUrl.origin)}; Path=/; SameSite=Lax`);
      return res.end(rewriteHtml(html, finalUrl, seg));
    }

    // Subresource: same bytes, served from this origin.
    res.statusCode = upstream.status;
    for (const h of ['content-type', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Fallback responses depend on the cookie, so they must never be shared by the CDN.
    res.setHeader('Cache-Control', fallback || upstream.status >= 400 ? 'private, no-store' : 'public, max-age=300, s-maxage=86400');
    if (method === 'HEAD' || !upstream.body) return res.end();
    if (/text\/css/i.test(type)) return res.end(rewriteUrls(decode(await readCapped(upstream.body, MAX_PAGE_BYTES, 'Stylesheet'), type), finalUrl, false));
    let sent = 0;
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sent += value.length;
      if (sent > MAX_ASSET_BYTES) { reader.cancel(); break; }
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (err) {
    if (res.headersSent) return res.end();
    const msg = err.name === 'TimeoutError' ? 'The site took too long to respond.' : err.message || 'The page could not be loaded.';
    return isPage ? errorPage(res, 502, msg) : (res.statusCode = 502, res.setHeader('Cache-Control', 'no-store'), res.end(msg));
  }
};
