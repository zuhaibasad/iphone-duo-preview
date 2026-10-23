(() => {
  'use strict';

  // ---------- real-world geometry (millimetres) and iOS points ----------
  // Inner: 7.58" 1878×2670 @430ppi → 626×890 pt. Outer: 5.36" 1398×2034 @460ppi → 466×678 pt.
  // Body open 164.6 × 117.8 mm; folded body measured from Apple's footage at 0.715 aspect.
  const PT_1X = 890 / 157.5; // CSS px per mm when one CSS px = one iOS point
  // iOS 27 on Duo has no top status bar: time and Wi-Fi sit in an 80 pt rail on the
  // right edge (under the cover camera). Safari letterboxes pages out of that rail and
  // under its own toolbar; a native app goes edge to edge when unfolded, with the
  // floating ×  /  ⤢ ⋯ window controls on top. Viewports are [x, y, w, h] in points.
  const RAIL = 80, TOOLBAR = 50, PILL = 74;
  const MODES = {
    folded:    { label: 'Folded',     screen: [466, 678], px: '1398 × 2034',
                 safari: [0, 0, 466 - RAIL, 678 - PILL], app: [0, 0, 466 - RAIL, 678] },
    landscape: { label: 'Landscape',  screen: [890, 626], px: '2670 × 1878',
                 safari: [0, TOOLBAR, 890 - RAIL, 626 - TOOLBAR], app: [0, 0, 890, 626] },
    portrait:  { label: 'Portrait',   screen: [626, 890], px: '1878 × 2670',
                 safari: [0, TOOLBAR, 626 - RAIL, 890 - TOOLBAR], app: [0, 0, 626, 890] },
    seated:    { label: 'Seated',     screen: [626, 445], px: '1878 × 1335',
                 safari: [0, TOOLBAR, 626 - RAIL, 445 - TOOLBAR], app: [0, 0, 626, 445] },
    split:     { label: 'Split View', screen: [439, 626], px: '1317 × 1878',
                 safari: [0, TOOLBAR, 439, 626 - TOOLBAR], app: [0, 0, 439, 626] },
  };
  const vpOf = (mode) => MODES[mode][state.render];
  const ORDER = ['folded', 'landscape', 'portrait', 'seated', 'split'];
  const EDGES = { folded: ['landscape'], landscape: ['folded', 'split', 'portrait'], split: ['landscape'], portrait: ['landscape', 'seated'], seated: ['portrait'] };


  const $ = (s, r = document) => r.querySelector(s);
  const stage = $('#stage');
  const wrap = $('#stageWrap');

  let k = 3.5;
  let zoom = 'fit';
  const placed = [];   // [element, {x,y,w,h,r}] in mm
  const inners = [];   // [element, displayWidthMm, pointWidth]
  const frames = {};   // mode → { iframe, vp, root, layoutW, metrics }
  const state = { mode: 'folded', url: '', busy: false, queued: null, render: 'safari' };

  // ---------- icons ----------
  const I = {
    signal: '<svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx=".8" fill="currentColor"/><rect x="4.6" y="5" width="3" height="6" rx=".8" fill="currentColor"/><rect x="9.2" y="2.6" width="3" height="8.4" rx=".8" fill="currentColor"/><rect x="13.8" y="0" width="3" height="11" rx=".8" fill="currentColor"/></svg>',
    wifi: '<svg width="15" height="11" viewBox="0 0 15 11"><path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.1A9.6 9.6 0 0 0 7.5.6 9.6 9.6 0 0 0 .7 3.3l1.1 1.1a8 8 0 0 1 5.7-2.2Zm0 3.1c1.3 0 2.5.5 3.5 1.3l1.1-1.1a6.6 6.6 0 0 0-9.2 0L4 6.6a5 5 0 0 1 3.5-1.3Zm0 3.1c.5 0 1 .2 1.3.5L7.5 10.6 6.2 8.9c.3-.3.8-.5 1.3-.5Z" fill="currentColor"/></svg>',
    battery: '<svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="19" height="8" rx="2" fill="currentColor"/><path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4Z" fill="currentColor" opacity=".4"/></svg>',
    lock: '<svg class="lock" viewBox="0 0 10 12"><path d="M2.5 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="5" width="8" height="6.5" rx="1.4" fill="currentColor"/></svg>',
    sidebar: '<svg viewBox="0 0 20 20"><rect x="2" y="3.5" width="16" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 3.5v13" stroke="currentColor" stroke-width="1.5"/></svg>',
    back: '<svg viewBox="0 0 20 20"><path d="M12.5 3.5 6 10l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 20 20" opacity=".35"><path d="M7.5 3.5 14 10l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 20 20"><path d="M10 2.5v10M6.5 6 10 2.5 13.5 6M6 9H4.5v8.5h11V9H14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 20 20"><path d="M10 3.5v13M3.5 10h13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    tabs: '<svg viewBox="0 0 20 20"><rect x="2.5" y="6" width="11" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 3.5h8a3 3 0 0 1 3 3v8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    reload: '<svg viewBox="0 0 20 20" style="width:15px;height:15px;color:#111"><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9M15.5 3.5v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 20 20" style="color:#111"><circle cx="4.5" cy="10" r="1.6" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><circle cx="15.5" cy="10" r="1.6" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    expand: '<svg viewBox="0 0 20 20"><path d="M11.5 3.5h5v5M8.5 16.5h-5v-5M16.5 3.5 11 9M3.5 16.5 9 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // Duo's Wi-Fi glyph sits in a ring with a dotted lower arc
    wifiRing: '<svg viewBox="0 0 42 42"><path d="M8.2 30.5A16 16 0 1 1 33.8 30.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><g fill="currentColor"><circle cx="12.5" cy="34.2" r="1.5"/><circle cx="17.6" cy="36.4" r="1.5"/><circle cx="23.2" cy="36.6" r="1.5"/><circle cx="28.6" cy="34.6" r="1.5"/></g><path d="M21 16.5c3 0 5.6 1.1 7.6 3l-1.6 1.6a8.4 8.4 0 0 0-12 0l-1.6-1.6c2-1.9 4.6-3 7.6-3Zm0 4.6c1.6 0 3.1.6 4.3 1.7l-1.6 1.6a3.8 3.8 0 0 0-5.4 0l-1.6-1.6c1.2-1.1 2.7-1.7 4.3-1.7Zm0 4.4 1.9 1.9-1.9 1.9-1.9-1.9 1.9-1.9Z" fill="currentColor"/></svg>',
  };

  // ---------- DOM builders ----------
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }
  function put(parent, e, spec) {
    parent.appendChild(e);
    placed.push([e, spec]);
    return e;
  }
  function inner(display, displayWmm, w, h) {
    const box = el('div', 'screen-inner');
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    display.appendChild(box);
    inners.push([box, displayWmm, w]);
    return box;
  }
  function abs(e, x, y, w, h) {
    Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    return e;
  }
  function hw(parent, x, y, w, h) { put(parent, el('div', 'btn-hw'), { x, y, w, h, r: [0.5, 0.5, 0.5, 0.5] }); }

  // Right-edge rail: 9:41, Wi-Fi ring, then round buttons (Safari's, or none for an app).
  function rail(kind, extraCls = '') {
    const r = el('div', `chrome rail ${kind} ${extraCls}`);
    r.innerHTML = `<span class="time">9:41</span><span class="ring">${I.wifiRing}</span>` +
      `<span class="rbtn safari-only">${I.tabs}</span><span class="rbtn safari-only">${I.more}</span>`;
    return r;
  }
  // Native app, unfolded and full screen: × at top left; ⤢ ⋯ pill, time and Wi-Fi at top right.
  function appBar() {
    return el('div', 'chrome appbar app-only',
      `<span class="abtn">${I.close}</span><span class="right"><span class="apill"><span class="aexp">${I.expand}</span>${I.more}</span><span class="time">9:41</span><span class="ring">${I.wifiRing}</span></span>`);
  }
  function addr() {
    return `<div class="addr">${I.lock}<span class="host">&nbsp;</span>${I.reload}<span class="bar"></span></div>`;
  }
  function tabletToolbar(right = RAIL) {
    const t = el('div', 'chrome toolbar tablet safari-only', `${I.sidebar}${I.back}${I.fwd}${addr()}${I.share}${I.plus}`);
    t.style.right = right + 'px';
    return t;
  }
  function placeViewport(mode) {
    const [x, y, w, h] = vpOf(mode);
    abs(frames[mode].vp, x, y, w, h);
  }
  function viewport(mode, parent) {
    const vp = el('div', 'vp');
    const w = vpOf(mode)[2];
    const iframe = el('iframe');
    iframe.title = `${MODES[mode].label} preview`;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals');
    iframe.setAttribute('allow', 'fullscreen');
    vp.appendChild(iframe);
    parent.appendChild(vp);
    frames[mode] = { iframe, vp, root: parent, layoutW: w, metrics: null, status: 'idle' };
    placeViewport(mode);
    setLayoutWidth(mode, w);
    iframe.addEventListener('load', () => {
      if (!iframe.src) return;
      parent.classList.remove('loading');
      if (frames[mode].status === 'loading') frames[mode].status = 'loaded';
      renderReport();
    });
    return vp;
  }
  function tabletScreen(mode, box, crease) {
    viewport(mode, box);
    box.appendChild(tabletToolbar());
    box.appendChild(rail('tablet', 'safari-only'));
    box.appendChild(appBar());
    if (crease) box.appendChild(el('div', `crease ${crease}`));
  }

  // ---------- devices ----------
  function device(name, w, h) {
    const root = el('div', `device ${name}`);
    root.dataset.w = w;
    root.dataset.h = h;
    stage.appendChild(root);
    return root;
  }

  function buildFolded() {
    const root = device('folded', 84.2, 117.8);
    hw(root, 38.7, -0.7, 11, 1.2);
    hw(root, 52.2, -0.7, 11, 1.2);
    hw(root, 83.5, 34.2, 1.2, 16.5);
    put(root, el('div', 'hinge'), { x: 0, y: 1.2, w: 3.2, h: 115.4, r: [1.2, 1.2, 1.2, 1.2] });
    put(root, el('div', 'body'), { x: 1.4, y: 0, w: 82.8, h: 117.8, r: [2.4, 10.5, 10.5, 2.4] });
    put(root, el('div', 'bezel'), { x: 2.15, y: 0.75, w: 81.3, h: 116.3, r: [1.7, 9.75, 9.75, 1.7] });
    const d = put(root, el('div', 'display'), { x: 3.7, y: 2.6, w: 77.4, h: 112.6, r: [2.2, 8.2, 8.2, 2.2] });
    const box = inner(d, 77.4, 466, 678);
    box.appendChild(abs(el('div', 'camera'), 466 - 32 - 34, 32, 34, 34));
    viewport('folded', box);
    box.appendChild(rail('phone'));
    const bar = el('div', 'chrome toolbar phone safari-only', `<div class="pill">${I.back.replace('20 20"', '20 20" style="color:#111"')}${addr()}</div>`);
    bar.style.right = RAIL + 'px';
    box.appendChild(bar);
    return root;
  }

  function buildLandscape() {
    const root = device('landscape', 164.6, 117.8);
    hw(root, 118.5, -0.7, 11.5, 1.2);
    hw(root, 133.3, -0.7, 11.5, 1.2);
    hw(root, 163.9, 34.2, 1.2, 16.5);
    put(root, el('div', 'body'), { x: 0, y: 0, w: 164.6, h: 117.8, r: [9, 9, 9, 9] });
    put(root, el('div', 'bezel'), { x: 0.75, y: 0.75, w: 163.1, h: 116.3, r: [8.25, 8.25, 8.25, 8.25] });
    const d = put(root, el('div', 'display'), { x: 3.55, y: 3.55, w: 157.5, h: 110.7, r: [6.6, 6.6, 6.6, 6.6] });
    const box = inner(d, 157.5, 890, 626);

    const single = el('div', 'layer landscape');
    tabletScreen('landscape', single, 'v');
    box.appendChild(single);

    // Split View: your site in the left window, an empty window on the right; the rail
    // overlays the right window, so the left one keeps its full 439 pt.
    const split = el('div', 'layer split off');
    const left = abs(el('div', 'pane'), 0, 0, 439, 626);
    viewport('split', left);
    left.appendChild(tabletToolbar(0));
    left.appendChild(appBar());
    const right = abs(el('div', 'pane'), 451, 0, 439, 626);
    split.append(left, right, abs(el('div', 'divider'), 442.5, 292, 5, 42), rail('tablet'));
    box.appendChild(split);
    return root;
  }

  function buildPortrait() {
    const root = device('portrait', 117.8, 164.6);
    hw(root, -0.7, 19.75, 1.2, 11.5);
    hw(root, -0.7, 34.6, 1.2, 11.5);
    hw(root, 34.2, -0.7, 16.5, 1.2);
    put(root, el('div', 'body'), { x: 0, y: 0, w: 117.8, h: 164.6, r: [9, 9, 9, 9] });
    put(root, el('div', 'bezel'), { x: 0.75, y: 0.75, w: 116.3, h: 163.1, r: [8.25, 8.25, 8.25, 8.25] });
    const d = put(root, el('div', 'display'), { x: 3.55, y: 3.55, w: 110.7, h: 157.5, r: [6.6, 6.6, 6.6, 6.6] });
    const box = inner(d, 110.7, 626, 890);
    tabletScreen('portrait', box, 'h');
    return root;
  }

  function buildSeated() {
    const root = device('seated', 117.8, 164.6);
    const w = el('div', 'seated-wrap');
    root.appendChild(w);
    const top = el('div', 'seated-top');
    const bottom = el('div', 'seated-bottom');
    w.append(top, bottom);
    hw(top, -0.7, 19.75, 1.2, 11.5);
    hw(top, -0.7, 34.6, 1.2, 11.5);
    hw(top, 34.2, -0.7, 16.5, 1.2);
    put(top, el('div', 'body'), { x: 0, y: 0, w: 117.8, h: 82.3, r: [9, 9, 0, 0] });
    put(top, el('div', 'bezel'), { x: 0.75, y: 0.75, w: 116.3, h: 81.55, r: [8.25, 8.25, 0, 0] });
    const d = put(top, el('div', 'display'), { x: 3.55, y: 3.55, w: 110.7, h: 78.75, r: [6.6, 6.6, 0, 0] });
    const box = inner(d, 110.7, 626, 445);
    tabletScreen('seated', box);
    put(bottom, el('div', 'body'), { x: 0, y: 0, w: 117.8, h: 82.3, r: [0, 0, 9, 9] });
    put(bottom, el('div', 'bezel'), { x: 0.75, y: 0, w: 116.3, h: 81.55, r: [0, 0, 8.25, 8.25] });
    put(bottom, el('div', 'display'), { x: 3.55, y: 0, w: 110.7, h: 78.75, r: [0, 0, 6.6, 6.6] });
    root._bottom = bottom;
    return root;
  }

  // Unfold rig: the open phone split at the hinge. The right half stays put; the left
  // leaf turns on the hinge from 180° (lying on top, showing the cover display) to 0°.
  // Its back face is drawn exactly like the folded phone, so both ends match the static devices.
  const HALF = 82.3;
  const FOLD_SHIFT = -40.2; // mm: puts the rig's folded stack where the folded device sits
  function buildRig() {
    const root = device('rig', 164.6, 117.8);
    hw(root, 118.5, -0.7, 11.5, 1.2);
    hw(root, 133.3, -0.7, 11.5, 1.2);
    hw(root, 163.9, 34.2, 1.2, 16.5);
    const right = put(root, el('div', 'rig-half'), { x: HALF, y: 0, w: HALF, h: 117.8 });
    put(right, el('div', 'body'), { x: 0, y: 0, w: HALF, h: 117.8, r: [0, 9, 9, 0] });
    put(right, el('div', 'bezel'), { x: 0, y: 0.75, w: HALF - 0.75, h: 116.3, r: [0, 8.25, 8.25, 0] });
    put(right, el('div', 'display'), { x: 0, y: 3.55, w: HALF - 3.55, h: 110.7, r: [0, 6.6, 6.6, 0] });

    const leaf = put(root, el('div', 'rig-leaf'), { x: 0, y: 0, w: HALF, h: 117.8 });
    const front = put(leaf, el('div', 'rig-face'), { x: 0, y: 0, w: HALF, h: 117.8 });
    put(front, el('div', 'body'), { x: 0, y: 0, w: HALF, h: 117.8, r: [9, 0, 0, 9] });
    put(front, el('div', 'bezel'), { x: 0.75, y: 0.75, w: HALF - 0.75, h: 116.3, r: [8.25, 0, 0, 8.25] });
    put(front, el('div', 'display'), { x: 3.55, y: 3.55, w: HALF - 3.55, h: 110.7, r: [6.6, 0, 0, 6.6] });
    const frontShade = put(front, el('div', 'rig-shade'), { x: 0, y: 0, w: HALF, h: 117.8, r: [9, 0, 0, 9] });

    // Folded-device geometry shifted 1.9 mm left so its right edge meets the leaf's.
    const back = put(leaf, el('div', 'rig-face back'), { x: 0, y: 0, w: HALF, h: 117.8 });
    put(back, el('div', 'hinge'), { x: -1.9, y: 1.2, w: 3.2, h: 115.4, r: [1.2, 1.2, 1.2, 1.2] });
    put(back, el('div', 'body'), { x: -0.5, y: 0, w: 82.8, h: 117.8, r: [2.4, 10.5, 10.5, 2.4] });
    put(back, el('div', 'bezel'), { x: 0.25, y: 0.75, w: 81.3, h: 116.3, r: [1.7, 9.75, 9.75, 1.7] });
    put(back, el('div', 'display'), { x: 1.8, y: 2.6, w: 77.4, h: 112.6, r: [2.2, 8.2, 8.2, 2.2] });
    put(back, el('div', 'camera'), { x: 68.2, y: 7.9, w: 5.65, h: 5.65, r: [2.83, 2.83, 2.83, 2.83] });
    const backShade = put(back, el('div', 'rig-shade'), { x: -0.5, y: 0, w: 82.8, h: 117.8, r: [2.4, 10.5, 10.5, 2.4] });
    Object.assign(root, { _leaf: leaf, _frontShade: frontShade, _backShade: backShade });
    return root;
  }

  const dev = {
    folded: buildFolded(),
    landscape: buildLandscape(),
    portrait: buildPortrait(),
    seated: buildSeated(),
    rig: buildRig(),
  };
  const deviceOf = (mode) => dev[mode === 'split' ? 'landscape' : mode];
  dev.folded.classList.add('on');

  // ---------- layout ----------
  function fitK() {
    const r = wrap.getBoundingClientRect();
    return Math.max(1.2, Math.min((r.width - 32) / 176, (r.height - 24) / 172, PT_1X));
  }
  function layout() {
    k = zoom === 'fit' ? fitK() : PT_1X;
    document.documentElement.style.setProperty('--k', k);
    const r = wrap.getBoundingClientRect();
    const need = 176 * k;
    wrap.classList.toggle('scroll', zoom !== 'fit');
    stage.style.width = zoom === 'fit' ? '' : Math.max(r.width, need) + 'px';
    stage.style.height = zoom === 'fit' ? '' : Math.max(r.height, 172 * k) + 'px';
    for (const root of Object.values(dev)) {
      const w = root.dataset.w * k, h = root.dataset.h * k;
      Object.assign(root.style, { width: w + 'px', height: h + 'px', marginLeft: -w / 2 + 'px', marginTop: -h / 2 + 'px' });
    }
    for (const [e, s] of placed) {
      Object.assign(e.style, { left: s.x * k + 'px', top: s.y * k + 'px', width: s.w * k + 'px', height: s.h * k + 'px' });
      if (s.r) e.style.borderRadius = s.r.map((v) => v * k + 'px').join(' ');
    }
    for (const [box, mm, pt] of inners) box.style.transform = `scale(${(mm * k) / pt})`;
    if (zoom !== 'fit') {
      wrap.scrollLeft = (stage.scrollWidth - wrap.clientWidth) / 2;
      wrap.scrollTop = (stage.scrollHeight - wrap.clientHeight) / 2;
    }
  }

  function show(root, opacity = 1) {
    root.classList.add('on');
    root.style.opacity = opacity;
  }
  function hide(root) {
    root.classList.remove('on');
    root.style.opacity = '';
    root.style.transform = '';
  }

  // Timing follows Apple's unfold footage: a slow lift off the stack, a quick swing
  // through 90°, then a soft settle as the screen goes flat.
  const HINGE = { duration: 1500, easing: 'cubic-bezier(.55,0,.25,1)' };
  const SCREEN_FADE = 260;

  // t = 0 folded, 1 open
  function swing(fromOpen) {
    const R = dev.rig;
    const closed = { leaf: 'translateZ(1px) rotateY(180deg)', root: `translateX(${FOLD_SHIFT * k}px)` };
    const open = { leaf: 'translateZ(1px) rotateY(0deg)', root: 'translateX(0px)' };
    const [a, b] = fromOpen ? [open, closed] : [closed, open];
    const opts = { ...HINGE, fill: 'forwards' };
    // Each face darkens as it turns away from the light, like the footage.
    const frontShade = fromOpen ? [0, 0.42] : [0.42, 0];
    const backShade = fromOpen ? [0.5, 0] : [0, 0.5];
    return Promise.all([
      R._leaf.animate([{ transform: a.leaf }, { transform: b.leaf }], opts).finished,
      R.animate([{ transform: a.root }, { transform: b.root }], opts).finished,
      R._frontShade.animate([{ opacity: frontShade[0] }, { opacity: frontShade[1] }], opts).finished,
      R._backShade.animate([{ opacity: backShade[0] }, { opacity: backShade[1] }], opts).finished,
    ]);
  }
  function resetRig() {
    const R = dev.rig;
    [R, R._leaf, R._frontShade, R._backShade].forEach((e) => e.getAnimations().forEach((x) => x.cancel()));
    hide(R);
  }
  const fadeTo = (e, from, to) => e.animate([{ opacity: from }, { opacity: to }], { duration: SCREEN_FADE, fill: 'forwards' }).finished;

  async function unfold() {
    const F = dev.folded, L = dev.landscape, R = dev.rig;
    show(R);
    const swung = swing(false); // its first keyframe is identical to the folded phone
    hide(F);
    await swung;
    // The rig's last frame is the open phone with blank screens; fade the live screens in over it.
    show(L, 0);
    await fadeTo(L, 0, 1);
    L.getAnimations().forEach((x) => x.cancel());
    show(L);
    resetRig();
  }

  async function fold() {
    const F = dev.folded, L = dev.landscape, R = dev.rig;
    R.style.transform = '';
    show(R);
    await fadeTo(L, 1, 0);
    L.getAnimations().forEach((x) => x.cancel());
    hide(L);
    await swing(true);
    show(F);
    resetRig();
  }

  // Landscape at angle a is the same silhouette as portrait at a + 90°.
  async function rotate(toPortrait) {
    const L = dev.landscape, P = dev.portrait;
    show(L);
    show(P);
    const opts = { duration: 720, easing: 'cubic-bezier(.65,0,.35,1)' };
    const fadeOut = [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0, offset: 0.65 }, { opacity: 0, offset: 1 }];
    const fadeIn = [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1, offset: 0.65 }, { opacity: 1, offset: 1 }];
    const [from, to] = toPortrait ? [L, P] : [P, L];
    const rotFrom = toPortrait ? ['rotate(0deg)', 'rotate(-90deg)'] : ['rotate(0deg)', 'rotate(90deg)'];
    const rotTo = toPortrait ? ['rotate(90deg)', 'rotate(0deg)'] : ['rotate(-90deg)', 'rotate(0deg)'];
    const a = from.animate(fadeOut.map((f, i) => ({ ...f, transform: i === 0 ? rotFrom[0] : i === 3 ? rotFrom[1] : undefined })).map(clean), opts);
    const b = to.animate(fadeIn.map((f, i) => ({ ...f, transform: i === 0 ? rotTo[0] : i === 3 ? rotTo[1] : undefined })).map(clean), opts);
    await Promise.all([a.finished, b.finished]);
    hide(from);
    show(to);
  }
  function clean(f) {
    if (f.transform === undefined) delete f.transform;
    return f;
  }

  const SEATED_ANGLE = 'rotateX(86deg)';
  async function seat(down) {
    const P = dev.portrait, S = dev.seated, B = S._bottom;
    const lift = `translateY(${22 * k}px)`;
    const opts = { duration: 760, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' };
    show(S);
    show(P);
    if (down) {
      P.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      const a = B.animate([{ transform: 'rotateX(0deg)' }, { transform: SEATED_ANGLE }], opts);
      const b = S.animate([{ transform: 'translateY(0)' }, { transform: lift }], opts);
      await Promise.all([a.finished, b.finished]);
      hide(P);
      P.getAnimations().forEach((x) => x.cancel());
    } else {
      P.style.opacity = 0;
      const a = B.animate([{ transform: SEATED_ANGLE }, { transform: 'rotateX(0deg)' }], opts);
      const b = S.animate([{ transform: lift }, { transform: 'translateY(0)' }], opts);
      await Promise.all([a.finished, b.finished]);
      await P.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' }).finished;
      P.getAnimations().forEach((x) => x.cancel());
      show(P);
      hide(S);
      S.getAnimations().forEach((x) => x.cancel());
      B.getAnimations().forEach((x) => x.cancel());
    }
  }
  function settleSeated() {
    // Swap the finished animations for inline styles so re-layout can update the lift.
    dev.seated.getAnimations().forEach((x) => x.cancel());
    dev.seated._bottom.getAnimations().forEach((x) => x.cancel());
    dev.seated._bottom.style.transform = SEATED_ANGLE;
    dev.seated.style.transform = `translateY(${22 * k}px)`;
  }

  function setLayer(split) {
    const L = dev.landscape;
    $('.layer.landscape', L).classList.toggle('off', split);
    $('.layer.split', L).classList.toggle('off', !split);
    return new Promise((r) => setTimeout(r, 320));
  }

  async function step(a, b) {
    if (a === 'folded' && b === 'landscape') return unfold();
    if (a === 'landscape' && b === 'folded') return fold();
    if (a === 'landscape' && b === 'split') return setLayer(true);
    if (a === 'split' && b === 'landscape') return setLayer(false);
    if (a === 'landscape' && b === 'portrait') return rotate(true);
    if (a === 'portrait' && b === 'landscape') return rotate(false);
    if (a === 'portrait' && b === 'seated') return seat(true);
    if (a === 'seated' && b === 'portrait') return seat(false);
  }

  function path(from, to) {
    const prev = { [from]: null };
    const q = [from];
    while (q.length) {
      const n = q.shift();
      if (n === to) break;
      for (const m of EDGES[n]) if (!(m in prev)) { prev[m] = n; q.push(m); }
    }
    const out = [];
    for (let n = to; n !== from; n = prev[n]) out.unshift(n);
    return out;
  }

  async function goTo(target) {
    if (state.busy) { state.queued = target; return; }
    if (target === state.mode) return;
    state.busy = true;
    foldBtn.disabled = true;
    for (const next of path(state.mode, target)) {
      await step(state.mode, next);
      state.mode = next;
      renderControls();
    }
    if (state.mode === 'seated') settleSeated();
    else { dev.seated._bottom.style.transform = ''; dev.seated.style.transform = ''; }
    state.busy = false;
    foldBtn.disabled = false;
    if (state.queued && state.queued !== state.mode) {
      const q = state.queued;
      state.queued = null;
      goTo(q);
    } else state.queued = null;
  }

  // ---------- loading sites ----------
  function normalise(raw) {
    let s = raw.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
      return u.href;
    } catch { return null; }
  }

  // The proxy is a Vercel function. When the page is opened some other way (an editor's
  // preview server, a file:// URL) there is no /api/proxy, so use the deployed one.
  // Pages are mirrored at /m/<mode>/<scheme>/<host>/<path> (see api/proxy.js).
  const DEPLOYED_ORIGIN = 'https://iphone-duo-preview-eight.vercel.app';
  let PROXY_ORIGIN = '';
  const proxyReady = fetch('/api/proxy?__probe=1')
    .then((r) => { if (r.headers.get('X-Duo-Proxy') !== '1') PROXY_ORIGIN = DEPLOYED_ORIGIN; })
    .catch(() => { PROXY_ORIGIN = DEPLOYED_ORIGIN; });
  const mirrorUrl = (url, mode) => {
    const u = new URL(url);
    return `${PROXY_ORIGIN}/m/${mode}/${u.protocol.slice(0, -1)}/${u.host}${u.pathname}${u.search}`;
  };

  function setRender(render) {
    state.render = render;
    document.body.classList.toggle('render-app', render === 'app');
    document.querySelectorAll('#render button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.render === render)));
    for (const mode of ORDER) {
      const f = frames[mode];
      placeViewport(mode);
      setLayoutWidth(mode, f.metrics ? layoutWidthFor(mode, f.metrics.viewportMeta) : vpOf(mode)[2]);
    }
    renderReport();
  }

  function setLayoutWidth(mode, layoutW) {
    const f = frames[mode];
    const [, , vw, vh] = vpOf(mode);
    f.layoutW = layoutW;
    const scale = vw / layoutW;
    Object.assign(f.iframe.style, { width: layoutW + 'px', height: vh / scale + 'px', transform: `scale(${scale})` });
  }

  function loadSite(url) {
    state.url = url;
    $('#urlInput').value = url.replace(/^https:\/\//, '').replace(/\/$/, '');
    document.body.classList.add('has-site');
    const host = new URL(url).hostname.replace(/^www\./, '');
    document.querySelectorAll('.addr .host').forEach((h) => (h.textContent = host));
    const current = state.mode;
    const order = [current, ...ORDER.filter((m) => m !== current)];
    order.forEach((mode, i) => {
      const f = frames[mode];
      f.metrics = null;
      f.status = 'queued';
      f.error = null;
      setLayoutWidth(mode, vpOf(mode)[2]);
      // Current view first; the other four load in the background before they are needed.
      setTimeout(async () => {
        await proxyReady;
        if (state.url !== url) return;
        f.status = 'loading';
        f.root.classList.add('loading');
        f.iframe.src = mirrorUrl(url, mode);
        renderReport();
      }, i === 0 ? 0 : 500 + i * 250);
    });
    renderReport();
    renderControls();
  }

  function modeOfSource(src) {
    return Object.keys(frames).find((m) => frames[m].iframe.contentWindow === src);
  }

  function layoutWidthFor(mode, meta) {
    const vw = vpOf(mode)[2];
    if (meta == null) return 980; // Safari's default layout width for pages without a viewport tag
    const m = /width\s*=\s*([\w-]+)/i.exec(meta);
    if (!m || m[1].toLowerCase() === 'device-width') return vw;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : vw;
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    const mode = modeOfSource(e.source);
    if (!mode) return;
    if (d.type === 'duo-nav' && typeof d.url === 'string' && /^https?:/i.test(d.url)) loadSite(d.url);
    if (d.type === 'duo-error') {
      frames[mode].error = d.message;
      frames[mode].status = 'error';
      renderReport();
      renderControls();
    }
    if (d.type === 'duo-metrics') {
      const f = frames[mode];
      f.metrics = d;
      const want = layoutWidthFor(mode, d.viewportMeta);
      if (want !== f.layoutW) setLayoutWidth(mode, want);
      if (d.title) f.title = d.title;
      renderReport();
      renderControls();
    }
  });

  function verdict(mode) {
    const f = frames[mode];
    if (!state.url) return { cls: 'wait', text: 'No site loaded' };
    if (f.status === 'error') return { cls: 'bad', text: "Couldn't load", note: f.error };
    const m = f.metrics;
    if (!m) return { cls: 'wait', text: f.status === 'queued' ? 'Queued' : 'Loading…' };
    const overflow = m.scrollWidth - m.innerWidth;
    if (m.viewportMeta == null) {
      return { cls: 'bad', text: 'Not mobile-ready', note: `No viewport tag: Safari lays it out ${f.layoutW} px wide and shrinks it to fit.` };
    }
    if (overflow > 1) return { cls: 'bad', text: `Overflows ${overflow} px`, note: `Content is ${m.scrollWidth} px wide in a ${m.innerWidth} px viewport.` };
    return { cls: 'good', text: 'Fits', note: `Layout ${m.innerWidth} × ${m.innerHeight}, page ${m.scrollHeight} px tall.` };
  }

  // ---------- UI ----------
  const foldBtn = $('#foldBtn');
  function renderControls() {
    $('#foldLabel').textContent = state.mode === 'folded' ? 'Unfold' : 'Fold';
    document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
    const M = MODES[state.mode];
    const v = verdict(state.mode);
    $('#readout').innerHTML =
      `<b>${M.label}</b> · ${state.render === 'app' ? 'native app' : 'Safari'} · ${M.screen[0]} × ${M.screen[1]} pt · ${M.px} px · viewport ${vpOf(state.mode)[2]} × ${vpOf(state.mode)[3]}` +
      (state.url ? `<span class="tag ${v.cls}">${v.text}</span>` : '');
  }

  function renderReport() {
    renderControls();
    $('#reportSub').textContent = state.url ? `Results for ${state.url}` : 'Load a website to test it in all five modes at once.';
    $('#reportBody').innerHTML = ORDER.map((mode) => {
      const M = MODES[mode];
      const v = verdict(mode);
      return `<tr><td>${M.label}</td><td>${M.screen[0]} × ${M.screen[1]}<small>${M.px} px</small></td><td>${vpOf(mode)[2]} × ${vpOf(mode)[3]}</td><td><span class="tag ${v.cls}">${v.text}</span>${v.note ? `<small>${escapeHtml(v.note)}</small>` : ''}</td></tr>`;
    }).join('');
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

  $('#urlForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = normalise($('#urlInput').value);
    if (!url) { $('#urlInput').select(); return; }
    $('#urlInput').blur();
    loadSite(url);
  });
  foldBtn.addEventListener('click', () => goTo(state.mode === 'folded' ? 'landscape' : 'folded'));
  $('#modes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goTo(b.dataset.mode); });
  $('#render').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setRender(b.dataset.render); });
  $('#zoom').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    zoom = b.dataset.zoom;
    document.querySelectorAll('#zoom button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    layout();
    if (state.mode === 'seated') settleSeated();
  });
  // Clicking the phone itself folds or unfolds it (the screen stays interactive once a site is loaded).
  stage.addEventListener('click', (e) => {
    const onBody = e.target.closest('.body, .bezel, .hinge, .btn-hw');
    const onBlankScreen = !state.url && e.target.closest('.display');
    if (onBody || onBlankScreen) goTo(state.mode === 'folded' ? 'landscape' : 'folded');
  });
  const report = $('#report');
  $('#reportBtn').addEventListener('click', () => {
    report.hidden = !report.hidden;
    $('#reportBtn').setAttribute('aria-expanded', String(!report.hidden));
  });
  $('#reportClose').addEventListener('click', () => { report.hidden = true; $('#reportBtn').setAttribute('aria-expanded', 'false'); });

  window.addEventListener('resize', () => { layout(); if (state.mode === 'seated') settleSeated(); });
  layout();
  renderReport();

  const q = new URLSearchParams(location.search).get('url');
  if (q && normalise(q)) loadSite(normalise(q));
  // ---------- visitor badges ----------
  const HEARTBEAT_MS = 25000;
  const visitorId = (() => {
    const fresh = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    try {
      let id = localStorage.getItem('duo-visitor');
      if (!id) { id = fresh(); localStorage.setItem('duo-visitor', id); }
      return id;
    } catch { return fresh(); }
  })();
  const fmt = new Intl.NumberFormat();
  function setStat(el, value) {
    const text = value == null ? '—' : fmt.format(value);
    if (el.textContent === text) return;
    el.classList.add('bump');
    setTimeout(() => { el.textContent = text; el.classList.remove('bump'); }, 140);
  }
  async function heartbeat(leave = false) {
    await proxyReady;
    const url = `${PROXY_ORIGIN}/api/stats`;
    const body = JSON.stringify({ id: visitorId, leave });
    if (leave) { navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' })); return; }
    try {
      const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
      const s = await r.json();
      setStat($('#activeNum'), Math.max(1, s.active));
      setStat($('#totalNum'), s.total);
      $('#statTotal').title = s.total == null ? 'Total visitors appear once Vercel Web Analytics is connected' : 'Total visitors, from Vercel Web Analytics';
    } catch { /* badges keep their last values */ }
  }
  let beat = null;
  function startBeating() {
    if (beat) return;
    heartbeat();
    beat = setInterval(heartbeat, HEARTBEAT_MS);
  }
  function stopBeating() {
    clearInterval(beat);
    beat = null;
    heartbeat(true);
  }
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? startBeating() : stopBeating()));
  window.addEventListener('pagehide', stopBeating);
  if (document.visibilityState === 'visible') startBeating();

  window.duo = { goTo, loadSite, state, frames }; // handy for testing from the console
})();
