---
date: 2026-10-23
tags: [session]
---
# 2026-10-23 — iPhone Duo preview site

## Done
- Vercel CLI 65.2.0 installed and logged in as `zuhaibasad`; project `iphone-duo-preview` linked in `site/`.
- Built `site/` (static + one serverless function) and deployed to production: https://iphone-duo-preview-eight.vercel.app
  - `index.html`, `app.css`, `app.js`: URL bar, CSS-built device at real mm proportions, 5 modes, test report.
  - `frames/f001–f090.webp`: Apple unfold video cropped at (305,105) 640×500, played forward/backward on a canvas with `mix-blend-mode: multiply`.
  - `api/proxy.js`: fetches the page with iPhone UA, strips XFO/CSP, injects `<base>` + shim (UA, platform, touch, screen, DPR, matchMedia pointer/hover), reports metrics via postMessage, routes link clicks/GET forms back through the app.
- Specs in [[iPhone-Duo-specs]].
- Tested with Playwright (apple.com, stripe.com → Fits everywhere; info.cern.ch → "Not mobile-ready", laid out at 980 px and shrunk).

## Decisions (user-confirmed)
- Animation: user's video + white overlay (wallpaper visible mid-animation; DOM crossfades frames 0–10 and 72–89).
- Vercel proxy for real iPhone UA (rate limit 60/min/IP per instance, SSRF block, 8 MB cap, 12 s timeout).
- Status bar + Safari bar shown, so viewports are the smaller Safari ones.
- Modes: Folded, Landscape, Portrait, Seated, Split View (site in left pane, right pane empty).

## Gotchas
- Video alignment constants (px/mm 431/117.8 folded → 426/117.8 open, centre 322.5,252) live in `VIDEO` in `app.js`; re-measure if the video changes.
- Seated deck uses `rotateX(86deg)` with perspective-origin above; negative angles fold it the wrong way.
- `iphone-duo-preview.vercel.app` belongs to someone else; ours is `-eight`.
- `vercel link` writes `site/.env.local` (OIDC token) — git-ignored, don't commit.
- Sites relying on cookies/logins, CORS fetches, or SPA routing off `location.pathname` can misbehave through the proxy.
- Local test: `node <scratch>/dev-server.js site` (port 5173) — the scratchpad is per-session, recreate if needed.

## Later the same day
- Unfold video now has white screens: `tools/whiten-frames.js` floods the outside through light *neutral* pixels (wallpaper is always tinted), labels dark pixels near the outside as bezel, fills each screen panel's convex hull; frames 39–51 use the fill-all variant. Output replaces `site/frames/`.
- Learned iOS 27 Duo UI from the user's second video (see [[iPhone-Duo-specs]]); added a **Website / Native app** render switch. Safari: right rail + Safari bar, viewport narrowed by the rail. App: rail when folded, floating × / ⤢ ⋯ top row when unfolded, full-bleed.
- `PROXY` in app.js falls back to the production proxy when the page isn't served from *.vercel.app or the local test server (port 5173).
- User saw "Forbidden. File doesn't reside within a trusted folder." for reportfor.agency; the site loads fine on production and via the proxy. Most likely the user opened `site/index.html` through an editor preview server, which has no /api/proxy — the fallback above fixes that. Confirm with the user.
- **Unfold animation replaced.** Per-frame whitening of Apple's video kept bleeding past the bezel and distorting mid-fold (user reported it as buggy). Now a CSS 3D rig (`buildRig` / `swing` in `site/app.js`): the open phone split at the hinge, left leaf turns 180°→0° on `rotateY` with its back face drawn as the folded phone, root slides `FOLD_SHIFT` (−40.2 mm) so the ends match the static devices exactly; 1.5 s, eased to mimic the footage. Live screens fade in after / out before the swing. The whitened frames are archived in `media/whitened-unfold-frames/`; `tools/whiten-frames.js` made them.
