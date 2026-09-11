# Board background images — spec

Drop one file per theme in THIS folder:

| Theme      | File              |
|------------|-------------------|
| Grand Prix | `grandprix.webp`  |
| City       | `city.webp`       |
| Coastal    | `coastal.webp`    |
| Mountain   | `mountain.webp`   |

Then set `image: '/themes/<name>.webp'` on that theme in
`client/src/components/boardSkins.ts`. Until then the classic light tiles +
SVG center show. Open any `/host/:code` URL with `?calibrate=1` to see red
index outlines over every tile while tuning.

## The deal (read this first)

The image draws the pretty board — track, scenery, **empty** property boxes.
Everything live renders as HTML **on top**: tile names, prices, owner chips,
player tokens, houses/hotels, auction/trade markers. Nothing in the game reads
pixels, so the contract below is just geometry + content rules.

## 1. Canvas

- **2048 × 2048 px, exactly square** (minimum 1024 × 1024). Displayed up to
  ~900 px wide + retina, so 2048 covers every TV with headroom.
- **WebP quality ~80** (or JPG). Keep each file under ~800 KB.
- Board area = the **full image, edge to edge** (see grid). No outer margins.

## 2. Grid contract (the important part)

The board is an **11 × 11 grid**: tile size = image / 11 (≈186.2 px at 2048).
Tile `i` lives at column/row below (col 0 = left, row 0 = top).
If your generator drifts a few px, don't re-export — tell the assistant and the
four calibration numbers (`x, y, w, h` in `boardSkins.ts`) absorb it.

Walk the perimeter **clockwise starting bottom-right**:

**Bottom row** (row 10, right → left)

| # | Box | Color band | Price/info |
|---|-----|-----------|------------|
| 0 | GO | green corner | Collect $200 |
| 1 | Med Ave | brown | $60 |
| 2 | Chest | — | (draw icon ok) |
| 3 | Baltic Ave | brown | $60 |
| 4 | Income Tax | — | Pay $100 |
| 5 | Reading RR | railroad grey | $200 |
| 6 | Oriental Ave | light blue | $100 |
| 7 | Chance | — | (? icon ok) |
| 8 | Vermont Ave | light blue | $100 |
| 9 | Conn Ave | light blue | $120 |
| 10 | Jail / Just Visiting | orange corner | — |

**Left column** (col 0, bottom → top): 11 St Charles (pink $140) · 12 Electric Co ($150) ·
13 States Ave (pink $140) · 14 Virginia Ave (pink $160) · 15 Penn RR ($200) ·
16 St James (orange $180) · 17 Chest · 18 Tennessee (orange $180) ·
19 New York Ave (orange $200) · 20 Free Parking (corner)

**Top row** (row 0, left → right): 21 Kentucky (red $220) · 22 Chance ·
23 Indiana Ave (red $220) · 24 Illinois Ave (red $240) · 25 B&O RR ($200) ·
26 Atlantic Ave (yellow $260) · 27 Ventnor Ave (yellow $260) ·
28 Water Works ($150) · 29 Marvin Gardens (yellow $280) · 30 Go To Jail (corner)

**Right column** (col 10, top → bottom): 31 Pacific Ave (green $300) ·
32 N Carolina (green $300) · 33 Chest · 34 Penn Ave (green $320) ·
35 Short Line ($200) · 36 Chance · 37 Park Place (blue $350) ·
38 Luxury Tax ($150) · 39 Boardwalk (blue $400)

## 3. Box content rules

- Draw the box frame + **color band** (top edge, classic colors above) + a
  small corner icon where noted. That is all.
- **No text, words, numbers, or logos anywhere** (AI text garbles; all text is
  crisp HTML on top). No prices, no names.
- Keep each box's **lower ~60% visually calm** — our overlay puts the name,
  price chip, owner chip, up to 4 tokens and house icons there (dark pills, so
  any art shows through around them, but calm art reads best).
- Center 9 × 9 area: anything (scenery, title art). Our HTML title badge sits
  bottom-center over it.

## 4. Calibration workflow (when a file lands)

1. Drop the file, set the `image` path in `boardSkins.ts`.
2. Open `/host/<code>?calibrate=1` — red outlines show where the app thinks
   each box is (`#index col,row`).
3. If boxes drift: adjust that theme's `grid: { x, y, w, h }` (fractions of
   image size, e.g. `{ x: 0.004, y: 0, w: 0.992, h: 1 }`) until outlines match.
   No art changes needed, ever, for alignment.
