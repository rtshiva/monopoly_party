# Board center art — image spec

Drop one square scenery image per theme in THIS folder:

| Theme      | File              |
|------------|-------------------|
| Grand Prix | `grandprix.webp`  |
| City       | `city.webp`       |
| Coastal    | `coastal.webp`    |
| Mountain   | `mountain.webp`   |

Then tell the assistant (or set `artImage: '/themes/<name>.webp'` on each entry
in `client/src/components/boardThemes.ts`). Until then the built-in SVG scenes show.

## Why scenery-only (no property boxes in the image)

All live data — tile names, prices, owner chips, tokens, houses, auction/trade
markers — renders as HTML **on top of** opaque tiles. The image is purely the
middle scenery, so it needs **zero alignment or calibration**.

## Spec for the generator

- **Size:** 2048 × 2048 px square (minimum 1024 × 1024). Displayed at up to
  ~900 px + retina, so 2048 covers every TV.
- **Aspect:** exactly 1:1. Displayed with `object-fit: cover`; keep a 5% bleed
  margin free of anything critical (it may crop on non-square screens).
- **Content:** scenery only — race track / city / coast / mountains. **No text,
  no words, no logos** (AI text garbles; the title badge renders as crisp HTML
  on top). No property boxes, grid lines, or board edges.
- **Contrast:** mid-tone overall is fine; avoid large pure-white or pure-black
  fields (the red title badge + gold tagline overlay the bottom-center).
- **Format:** WebP quality ~80 (or JPG). Keep each file under ~600 KB.
- **Palette hints:** match the board frame — warm parchment for Grand Prix /
  Coastal (`#ece1c9` / `#f3e8cf`), cool light blue-grey for City / Mountain
  (`#e8eef5` / `#e4e7ec`).

## If you ever want drawn property squares inside the image instead

Don't — but if you insist, the fallback protocol is: strict 11×11 grid,
tile size = image/11, origin top-left, classic order (GO bottom-right,
clockwise), plus a `tileRects` calibration override and a debug outline mode.
Ask the assistant to add it; expect an alignment-tuning round per image.
