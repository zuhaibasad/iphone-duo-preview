---
updated: 2026-10-23
session: "[[2026-10-23-duo-preview-build]]"
---
# Current hand-off

## Goal
A temporary website that previews any URL inside a realistic, true-to-scale iPhone Duo (folded and unfolded), animated with Apple's unfold footage, so people can see how their site renders and breaks on the device.

## State
- Live: https://iphone-duo-preview-eight.vercel.app (Vercel project `iphone-duo-preview`, account `zuhaibasad`).
- Code in `site/`; deploy with `vercel deploy --prod --yes` from `site/`. Frame-whitening script in `tools/whiten-frames.js`.
- Unfold is a CSS 3D hinge rig (white screens, pixel-exact ends); Apple-video frames archived in `media/`. Website / Native app render switch added, modelled on iOS 27 Duo UI. Specs in [[iPhone-Duo-specs]].

## Next steps
- Confirm where the user saw the "Forbidden… trusted folder" message (likely an editor preview, not the live site).
- Get the user's feedback on the look and feel (bezel thickness, metal colour, seated angle, animation speed `VIDEO.fps`).
- Decide whether to put the proxy behind a password/allowlist (it is a public proxy now, only rate-limited).
- Optional: user agent for the inner screen (iPad-style desktop UA?), the in-frame back/forward history, and a custom domain.

## Open questions
- Should the right Split View pane show something (a second URL)?

## Key files
- `site/app.js` (geometry `MODES`, `VIDEO`, transitions), `site/api/proxy.js`, `site/app.css`
