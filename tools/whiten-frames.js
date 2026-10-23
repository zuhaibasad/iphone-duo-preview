// Paints the display area of each unfold-video frame luxury white.
// Screen = pixels enclosed by the black bezel: flood the outside from the frame
// border through non-dark pixels; dark pixels close to the outside are bezel/frame,
// everything else that is not outside is display.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [ff, src, outDir, wallLum = '45', bezelPx = '14', chromaMax = '13'] = process.argv.slice(2);
const W = 1260, H = 612, CX = 305, CY = 105, CW = 640, CH = 500;
const SCREEN = [243, 239, 231]; // --screen #f3efe7
const T = +wallLum, D = +bezelPx, C = +chromaMax;
const raw = spawnSync(ff, ['-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 }).stdout;
const N = raw.length / (W * H * 3);
fs.mkdirSync(outDir, { recursive: true });
const out = Buffer.alloc(N * CW * CH * 3);
const stats = [];
for (let f = 0; f < N; f++) {
  const o = f * W * H * 3;
  const lum = new Float32Array(W * H), open = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const r = raw[o + i * 3], g = raw[o + i * 3 + 1], b = raw[o + i * 3 + 2]; lum[i] = 0.299 * r + 0.587 * g + 0.114 * b; open[i] = lum[i] >= T && Math.max(r, g, b) - Math.min(r, g, b) < C ? 1 : 0; }
  const state = new Uint8Array(W * H); // 0 unknown, 1 outside, 2 bezel
  const q = new Int32Array(W * H);
  let h = 0, t = 0;
  const push = (i) => { state[i] = 1; q[t++] = i; };
  for (let x = 0; x < W; x++) { if (open[x]) push(x); const b = (H - 1) * W + x; if (open[b] && !state[b]) push(b); }
  for (let y = 0; y < H; y++) { const a = y * W, b = a + W - 1; if (open[a] && !state[a]) push(a); if (open[b] && !state[b]) push(b); }
  while (h < t) {
    const i = q[h++], x = i % W;
    for (const j of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) if (j >= 0 && j < W * H && !state[j] && open[j]) push(j);
  }
  // bezel: dark pixels within D steps of the outside
  const dist = new Int16Array(W * H).fill(-1);
  h = 0; t = 0;
  for (let i = 0; i < W * H; i++) if (state[i] === 1) { dist[i] = 0; q[t++] = i; }
  while (h < t) {
    const i = q[h++], x = i % W;
    if (dist[i] >= D) continue;
    for (const j of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) if (j >= 0 && j < W * H && dist[j] < 0 && lum[j] < T) { dist[j] = dist[i] + 1; state[j] = 2; q[t++] = j; }
  }

  // Each visible display panel is convex: fill the convex hull of every large
  // screen component so edge shading doesn't leave dark notches.
  const comp = new Int32Array(W * H).fill(-1);
  let nc = 0;
  for (let i0 = 0; i0 < W * H; i0++) {
    if (state[i0] !== 0 || comp[i0] >= 0) continue;
    const pts = []; h = 0; t = 0; q[t++] = i0; comp[i0] = nc;
    while (h < t) {
      const i = q[h++], x = i % W; pts.push(i);
      for (const j of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) if (j >= 0 && j < W * H && state[j] === 0 && comp[j] < 0) { comp[j] = nc; q[t++] = j; }
    }
    nc++;
    if (pts.length < 3000) continue;
    const minX = new Int32Array(H).fill(W), maxX = new Int32Array(H).fill(-1);
    for (const i of pts) { const y = (i / W) | 0, x = i % W; if (x < minX[y]) minX[y] = x; if (x > maxX[y]) maxX[y] = x; }
    const P = [];
    for (let y = 0; y < H; y++) if (maxX[y] >= 0) { P.push([minX[y], y], [maxX[y], y]); }
    P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let k = P.length - 1; k >= 0; k--) { const p = P[k]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const poly = lo.slice(0, -1).concat(up.slice(0, -1));
    for (let y = 0; y < H; y++) {
      const xs = [];
      for (let e = 0; e < poly.length; e++) {
        const [x1, y1] = poly[e], [x2, y2] = poly[(e + 1) % poly.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        else if (y1 === y && y2 === y) xs.push(x1, x2);
      }
      if (xs.length < 2) continue;
      const a = Math.ceil(Math.min(...xs)), b = Math.floor(Math.max(...xs));
      for (let x = a; x <= b; x++) { const i = y * W + x; if (!(state[i] === 2 && lum[i] < 28)) state[i] = 3; }
    }
  }
  let painted = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = (y + CY) * W + (x + CX), s = o + i * 3, d = (f * CW * CH + y * CW + x) * 3;
    if (state[i] === 0 || state[i] === 3) { out[d] = SCREEN[0]; out[d + 1] = SCREEN[1]; out[d + 2] = SCREEN[2]; painted++; }
    else { out[d] = raw[s]; out[d + 1] = raw[s + 1]; out[d + 2] = raw[s + 2]; }
  }
  stats.push(painted);
}
// 1px soften of the painted edge so it doesn't look cut out
console.log('frames', N, 'painted px min/max', Math.min(...stats), Math.max(...stats));
console.log(stats.map((v, i) => i + ':' + v).filter((_, i) => i % 6 === 0).join(' '));
const r = spawnSync(ff, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${CW}x${CH}`, '-r', '30', '-i', '-',
  '-vf', 'gblur=sigma=0.5:steps=1', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', path.join(outDir, 'f%03d.webp')], { input: out, maxBuffer: 1 << 30 });
if (r.status) console.log(String(r.stderr));
