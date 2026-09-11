# Board background images — approved spec

Drop one file per theme in THIS folder (`client/public/themes/`):

| Theme      | File              | Status         |
|------------|-------------------|----------------|
| Grand Prix | `grandprix.png`   | ✅ live (1254², calibrated) |
| City       | `city.webp`       | pending        |
| Coastal    | `coastal.webp`    | pending        |
| Mountain   | `mountain.webp`   | pending        |

Then set `image: '/themes/<name>.<ext>'` on that theme in
`client/src/components/boardSkins.ts`. Until then the classic light tiles +
SVG center show. Recommended order: **Grand Prix first** (done), then City,
Coastal, Mountain.

## 1. Core principle

The image is a **pure visual layer**. It must contain no game-state
information, and the game never inspects its pixels:

- Image draws: scenery, roads/tracks, buildings, landscape, empty property
  boxes, decorative details.
- HTML draws (always, on top): tile names, prices, color bands, tile borders
  and highlights, owner chips, player tokens, houses/hotels, auction/trade
  markers, title badge.

## 2. Canvas

- **2048 × 2048 px**, exactly square (minimum 1024 × 1024 fallback).
- WebP quality ~80, target under ~800 KB (PNG accepted for calibration
  rounds; convert before game night).
- Board artwork extends **edge to edge**: no outer margin, no title area, no
  legend, no explanatory text.

## 3. Grid contract (do not break this)

The board is an **11 × 11 logical grid**. Index 0 (GO) sits **top-left**
(start/finish corner) and play proceeds **clockwise**. Corners read:
GO top-left · Jail top-right · Free Parking bottom-right · Go To Jail
bottom-left (a 180° rotation of the classic layout; rules and order are
unchanged, only the start corner moved).

**Top row** (row 0, left → right): 0 GO (green corner, Collect $200) ·
1 Med Ave (brown $60) · 2 Chest · 3 Baltic Ave (brown $60) · 4 Income Tax
($100) · 5 Reading RR ($200) · 6 Oriental Ave (light blue $100) · 7 Chance ·
8 Vermont Ave (light blue $100) · 9 Conn Ave (light blue $120) ·
10 Jail / Just Visiting (orange corner)

**Right column** (col 10, top → bottom): 11 St Charles (pink $140) ·
12 Electric Co ($150) · 13 States Ave (pink $140) · 14 Virginia Ave (pink
$160) · 15 Penn RR ($200) · 16 St James (orange $180) · 17 Chest ·
18 Tennessee (orange $180) · 19 New York Ave (orange $200) · 20 Free Parking
(corner)

**Bottom row** (row 10, right → left): 21 Kentucky (red $220) · 22 Chance ·
23 Indiana Ave (red $220) · 24 Illinois Ave (red $240) · 25 B&O RR ($200) ·
26 Atlantic Ave (yellow $260) · 27 Ventnor Ave (yellow $260) ·
28 Water Works ($150) · 29 Marvin Gardens (yellow $280) · 30 Go To Jail
(corner)

**Left column** (col 0, bottom → top): 31 Pacific Ave (green $300) ·
32 N Carolina (green $300) · 33 Chest · 34 Penn Ave (green $320) ·
35 Short Line ($200) · 36 Chance · 37 Park Place (blue $350) ·
38 Luxury Tax ($150) · 39 Boardwalk (blue $400)

Generated grids are never perfectly uniform (wide corners, AI wobble), so
tiles map through **explicit boundary arrays** (`cols[12]`, `rows[12]` as
fractions in `shared/src/boardLayout.ts`, e.g. `GRANDPRIX_BOUNDS`), measured
from the art with pixel line detection. Overlay chips are small and centered,
so residuals ≤ ~20 px are invisible. Never re-export art for alignment.

## 4. Center 9 × 9: the theme lives here

The middle 9 × 9 region is the primary visual identity — make it rich
(Grand Prix: flowing circuit with curbs, pit lane, grandstand, paddock;
City: street circuit, towers, bridges, parks; Coastal: coastal road, marina,
lighthouse, cliffs, boats; Mountain: switchbacks, tunnel, bridge, forest,
lake). It must NOT read as a second playable path: no shortcuts, branches,
or arrows suggesting alternate movement. The logical game path stays the
single perimeter lap.

## 5. Property boxes: calm, empty, unbanded

- Each perimeter box keeps its **lower ~60% visually calm** (subtle texture
  ok): no busy buildings, high-contrast patterns, roads, characters, cars,
  or shadows behind the expected HTML text/chips/tokens/houses.
- Do **NOT** bake property color bands — the app draws them as HTML (exact
  colors, exact geometry). Keep box tops neutral.
- Prefer simple, consistent box frames; the app renders outlines, hover,
  ownership and active-turn highlights itself.

## 6. No generated text or logos, ever

No property names, prices, numbers, Chance/Chest/GO/Jail text, Monopoly logo,
theme titles, slogans, legends, fake brands, ads, or legible signs. All text
is crisp HTML on top — this also guarantees visuals always match game state.

## 7. Style

Premium modern board-game artwork: clean, colorful, slightly illustrated,
strong center composition, restrained perimeter, consistent language across
themes. Avoid photorealistic clutter, tiny details, text-heavy environments,
fake ads, and heavy 3D perspective. Must read well at ~900 px display width.

## 8. Calibration workflow (when a file lands)

1. Drop the file in this folder, set its `image` path in `boardSkins.ts`.
2. Open `/host/<code>?calibrate=1` — red outlines show where the app places
   each box (`#index col,row`).
3. If boxes drift, measure grid lines (see `gridscan.mjs` pattern: PNG
   decode + darkness profiles per side) and update that theme's bounds in
   `shared/src/boardLayout.ts` (suite guards monotonicity). No art changes
   needed for alignment, ever.

## 9. Acceptance checklist

- [ ] Exactly 2048 × 2048, square, board reaches all four edges
- [ ] 11 × 11 geometry compatible; 40 perimeter spaces clearly separated
- [ ] GO top-left with start/finish character; corners read correctly
- [ ] Rich center, clean perimeter, single-lap reading preserved
- [ ] Zero generated text/numbers/logos/titles/slogans
- [ ] Lower ~60% of boxes calm; chips, tokens, houses readable
- [ ] No baked color bands; no text where HTML overlays sit
- [ ] WebP ~80, under ~800 KB; good at ~900 px
