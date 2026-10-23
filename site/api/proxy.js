// Fetches a page as iPhone Safari would, strips iframe-blocking headers, and
// injects a shim so the page believes it is running on an iPhone Duo.
const dns = require('dns').promises;
const net = require('net');

// iOS 26+ Safari freezes the OS token at 18_6; only Version/ moves.
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12000;
const RATE_LIMIT = 60; // requests per IP per minute, per warm instance
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > 60000) {
    hits.set(ip, { start: now, n: 1 });
    return false;
  }
  rec.n += 1;
  return rec.n > RATE_LIMIT;
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

async function fetchFollowing(url, headers) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(current);
    const res = await fetch(current, { headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current);
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error('Too many redirects.');
}

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) throw new Error('Page is larger than 8 MB.');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function charsetOf(contentType, head) {
  const m = /charset=([\w-]+)/i.exec(contentType) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : 'utf-8';
}

// Runs inside the proxied page before any of its own scripts.
function shim(finalUrl) {
  return `<script>(function(){
var UA=${JSON.stringify(IPHONE_UA)};
function def(o,k,v){try{Object.defineProperty(o,k,{get:function(){return v},configurable:true})}catch(e){}}
var N=Navigator.prototype;
def(N,'userAgent',UA);def(N,'appVersion',UA.slice(8));def(N,'platform','iPhone');
def(N,'vendor','Apple Computer, Inc.');def(N,'maxTouchPoints',5);def(N,'userAgentData',undefined);
try{window.ontouchstart=null;}catch(e){}
// Routers resolve URLs against the injected <base>, which is cross-origin here; keep state, drop the URL.
['pushState','replaceState'].forEach(function(n){var o=History.prototype[n];History.prototype[n]=function(s,t,u){try{return o.call(this,s,t,u)}catch(e){return o.call(this,s,t)}}});
var mode=(function(){try{return new URLSearchParams(location.search).get('__duo')||''}catch(e){return''}})();
var dims={folded:[466,678],landscape:[890,626],portrait:[626,890],seated:[626,890],split:[890,626]}[mode]||[466,678];
def(Screen.prototype,'width',dims[0]);def(Screen.prototype,'height',dims[1]);
def(Screen.prototype,'availWidth',dims[0]);def(Screen.prototype,'availHeight',dims[1]);
def(window,'devicePixelRatio',3);
var mm=window.matchMedia.bind(window);
window.matchMedia=function(q){
  var s=String(q);
  if(/\\((any-)?pointer:\\s*coarse\\)|\\((any-)?hover:\\s*none\\)/.test(s)&&!/,/.test(s)){var r=mm('all');def(r,'matches',true);return r;}
  if(/\\((any-)?pointer:\\s*fine\\)|\\((any-)?hover:\\s*hover\\)/.test(s)&&!/,/.test(s)){var r2=mm('not all');def(r2,'matches',false);return r2;}
  return mm(q);
};
var BASE=${JSON.stringify(finalUrl)};
function post(m){m.mode=mode;try{parent.postMessage(m,'*')}catch(e){}}
function abs(h){try{return new URL(h,document.baseURI||BASE).href}catch(e){return null}}
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest&&e.target.closest('a[href]');
  if(!a||e.defaultPrevented)return;
  var h=a.getAttribute('href');if(!h||h[0]==='#'||/^(javascript|mailto|tel|sms):/i.test(h))return;
  var u=abs(h);if(!u)return;e.preventDefault();post({type:'duo-nav',url:u});
},true);
document.addEventListener('submit',function(e){
  var f=e.target;if((f.method||'get').toLowerCase()!=='get')return;
  e.preventDefault();var u=new URL(f.action||BASE,document.baseURI);
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

function rewriteHtml(html, finalUrl) {
  const inject = `<base href="${finalUrl.replace(/"/g, '&quot;')}">` + shim(finalUrl);
  html = html
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, '');
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

module.exports = async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return errorPage(res, 429, 'Too many requests. Wait a minute and try again.');

  const params = new URL(req.url, 'http://x').searchParams;
  let target;
  try {
    target = new URL(params.get('url') || '');
  } catch {
    return errorPage(res, 400, 'That address is not a valid URL.');
  }

  try {
    const { res: upstream, finalUrl } = await fetchFollowing(target, {
      'User-Agent': IPHONE_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Sec-CH-UA-Mobile': '?1',
      'Sec-CH-UA-Platform': '"iOS"',
    });
    const type = upstream.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      // Not a page (PDF, image…): let the iframe load it directly.
      res.statusCode = 302;
      res.setHeader('Location', finalUrl.href);
      return res.end();
    }
    const buf = await readCapped(upstream);
    const charset = charsetOf(type, buf.subarray(0, 2048).toString('latin1'));
    let html;
    try {
      html = new TextDecoder(charset).decode(buf);
    } catch {
      html = buf.toString('utf8');
    }
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
    res.setHeader('X-Duo-Final-Url', finalUrl.href);
    res.end(rewriteHtml(html, finalUrl.href));
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'The site took too long to respond.' : err.message || 'The page could not be loaded.';
    return errorPage(res, 502, msg);
  }
};
