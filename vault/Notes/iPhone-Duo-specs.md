---
tags: [reference, iphone-duo]
---
# iPhone Duo display specs

| Mode | Screen (pt) | Pixels | Safari viewport | Native-app viewport |
|---|---|---|---|---|
| Folded (cover) | 466 × 678 | 1398 × 2034 @ 460 ppi | 386 × 604 | 386 × 678 |
| Landscape | 890 × 626 | 2670 × 1878 @ 430 ppi | 810 × 576 | 890 × 626 |
| Portrait | 626 × 890 | 1878 × 2670 | 546 × 840 | 626 × 890 |
| Seated (top half) | 626 × 445 | 1878 × 1335 | 546 × 395 | 626 × 445 |
| Split View pane | 439 × 626 | ~1317 × 1878 | 439 × 576 | 439 × 626 |

## iOS 27 system UI on Duo (from Anthropic's Claude-on-Duo video, b06pr0wm5H91CVSK.mp4)
- No top status bar and no home indicator. An ~80 pt **rail on the right edge**: (cover camera) → 9:41 → Wi-Fi glyph in a ring with a dotted lower arc → the app's own round 46 pt buttons stacked below.
- Cover: camera centre 49 pt from top/right, rail text at ~91 pt, ring ~129 pt; app content stays left of the rail.
- Unfolded windowed apps (e.g. Split View): same right rail.
- Unfolded **full screen**: rail becomes a top row — × (46 pt circle) top-left; top-right a pill [⤢ fullscreen (dark circle), ⋯], then 9:41 and the Wi-Fi ring. Content is edge to edge underneath (~90 pt tall control zone).
- Safari model used here (not shown in the video, assumed): right rail + Safari toolbar (top when unfolded, bottom pill when folded); pages are letterboxed out of the rail.

- Diagonals: inner 7.58", outer 5.36" (Apple newsroom footnote). Both ≈ 1:1.42–1.45.
- Body open 164.6 × 117.8 mm, 5.2 mm thick; folded ≈ 84.2 × 117.8 (measured from Apple footage), 11.3 mm.
- Inner display ≈ 157.5 × 110.7 mm, cover ≈ 77.4 × 112.6 mm. Cover camera centre ≈ 49 pt from top/right, Ø ≈ 34 pt.
- Point sizes = pixels ÷ 3 (not officially published). Safari toolbar heights are estimates.
- Fold axis: book-style. Folded hinge on the left; open landscape has a vertical crease; portrait a horizontal crease.
- Safari UA used: `iPhone OS 18_6` frozen token + `Version/27.1` (iOS 26+ freezes the OS version).

Sources: apple.com/newsroom/2026/09/apple-unveils-iphone-duo, macrumors iPhone Duo roundup, codeconfig.dev/blog/iphone-duo-screen-size, whatismyscreensize.com/device/iphone-duo
