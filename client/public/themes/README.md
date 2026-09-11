# Board artwork — spec (cells-as-backgrounds)

The board is a uniform 11×11 HTML grid — geometry can never drift. Generated
art appears only as **cell backgrounds** (one center image + one 4-corner
sheet per theme). Everything else (edge tiles, text, markers) stays HTML.

Drop files in THIS folder (`client/public/themes/`), then set their paths in
`client/src/components/boardThemes.ts` (`artImage`, `cornerSheet`). Until
then the built-in SVG scenes show. Recommended order: Grand Prix first.

## Files per theme (2 + 8 street tiles)

| Asset  | File                              | Size (px, square) |
|--------|-----------------------------------|-------------------|
| Center | `<theme>-center.webp`             | 1600 (min 1024)   |
| Corners| `<theme>-corners.webp`            | 1024 (min 512)    |
| brown streets | `<theme>-tile-brown.webp`  | 512 (min 256)     |
| lightblue streets | `<theme>-tile-lightblue.webp` | 512 (min 256) |
| pink streets | `<theme>-tile-pink.webp`     | 512 (min 256)     |
| orange streets | `<theme>-tile-orange.webp` | 512 (min 256)     |
| red streets | `<theme>-tile-red.webp`        | 512 (min 256)     |
| yellow streets | `<theme>-tile-yellow.webp`  | 512 (min 256)     |
| green streets | `<theme>-tile-green.webp`    | 512 (min 256)     |
| blue streets | `<theme>-tile-blue.webp`      | 512 (min 256)     |
| railroads | `<theme>-tile-railroad.webp`        | 512 (min 256)     |
| utilities | `<theme>-tile-utility.webp`         | 512 (min 256)     |
| taxes | `<theme>-tile-tax.webp`                 | 512 (min 256)     |
| chance | `<theme>-tile-chance.webp`              | 512 (min 256)     |
| chests | `<theme>-tile-chest.webp`               | 512 (min 256)     |

Example: `coastal-center.webp`, `coastal-corners.webp`, `coastal-tile-brown.webp`.

WebP quality ~80; center under ~600 KB, corners sheet under ~300 KB,
street tiles under ~80 KB each. Any subset works — missing groups fall back
to the plain tile color, so generate brown + blue first for a quick preview.

## Center image

The theme's hero scenery (Grand Prix: circuit/curbs/pit lane/grandstand;
City: towers/bridges/parks; Coastal: road/marina/lighthouse/cliffs/boats;
Mountain: switchbacks/tunnel/forest/lake). Rich is good — it must NOT read
as a second playable path (no shortcuts, branches, or arrows). **No text of
any kind**: the red title badge renders as HTML on top.

Displayed up to ~900 px + retina, hence 1600 px. `object-fit: cover` into a
square panel; keep 5% bleed free of anything critical.

## Corners sheet (the quadrant contract)

One square image, four vignettes in a **2×2 collage** — the app crops each
quadrant into its corner cell with pure CSS (`background-size: 200%`), so
one file can never misalign:

| Quadrant (in the sheet) | Corner cell (on the board) | Motif |
|-------------------------|----------------------------|-------|
| Top-left | GO (top-left) | start/finish celebration |
| Top-right | Jail (top-right) | confinement / barrier |
| Bottom-left | Go To Jail (bottom-left) | enforcement / siren |
| Bottom-right | Free Parking (bottom-right) | open restful scene |

Each vignette should read at ~90–180 px display size: one bold motif per
quadrant, **no text, numbers, or logos**, middle kept calm for the overlaid
name/token chips (dark pills + scrim guarantee readability on any art).

## Grid contract (fixed, no calibration)

Index 0 (GO) sits **top-left**, play proceeds **clockwise**: top row 0–10,
right column 11–20, bottom row 21–30, left column 31–39. Corners read GO
top-left · Jail top-right · Free Parking bottom-right · Go To Jail
bottom-left. Rules and order never change — only art swaps.

Tile order around the perimeter:

**Top row** (left → right): 0 GO · 1 Med Ave (brown $60) · 2 Chest ·
3 Baltic Ave (brown $60) · 4 Income Tax ($100) · 5 Reading RR ($200) ·
6 Oriental Ave (light blue $100) · 7 Chance · 8 Vermont Ave (light blue
$100) · 9 Conn Ave (light blue $120) · 10 Jail

**Right column** (top → bottom): 11 St Charles (pink $140) · 12 Electric Co
($150) · 13 States Ave (pink $140) · 14 Virginia Ave (pink $160) ·
15 Penn RR ($200) · 16 St James (orange $180) · 17 Chest · 18 Tennessee
(orange $180) · 19 New York Ave (orange $200) · 20 Free Parking

**Bottom row** (right → left): 21 Kentucky (red $220) · 22 Chance ·
23 Indiana Ave (red $220) · 24 Illinois Ave (red $240) · 25 B&O RR ($200) ·
26 Atlantic Ave (yellow $260) · 27 Ventnor Ave (yellow $260) ·
28 Water Works ($150) · 29 Marvin Gardens (yellow $280) · 30 Go To Jail

**Left column** (bottom → top): 31 Pacific Ave (green $300) ·
32 N Carolina (green $300) · 33 Chest · 34 Penn Ave (green $320) ·
35 Short Line ($200) · 36 Chance · 37 Park Place (blue $350) ·
38 Luxury Tax ($150) · 39 Boardwalk (blue $400)

## Art direction per file

- **Center:** the theme's hero scenery (Grand Prix: circuit/curbs/pit lane/
  grandstand; City: towers/bridges/parks; Coastal: road/marina/lighthouse/
  cliffs/boats; Mountain: switchbacks/tunnel/forest/lake). Rich is good —
  it must NOT read as a second playable path (no shortcuts, branches, or
  arrows). No text of any kind (the title badge renders as HTML on top).
- **Corners** (one motif each): `go` = start/finish celebration ·
  `jail` = confinement/barrier · `parking` = open restful scene ·
  `gotojail` = enforcement/siren. Keep the middle calm for the name + token
  chips the app overlays; no text, numbers, logos, or signs anywhere.
- **Edge tiles:** no art needed — HTML draws them (names, prices, color
  bands, highlights all stay exact).
- **Street tiles** — generate **one set of 8 and reuse across all themes**
  to start (copy/rename per theme; each theme maps its own 8 paths, so
  per-theme variants can replace them later with zero code changes):

  | Color group | File | Art direction |
  |---|---|---|
  | brown | `<theme>-tile-brown.webp` | weathered wood planks / packed dirt road, warm dark brown |
  | lightblue | `<theme>-tile-lightblue.webp` | dusty slate-blue evening gradient, soft clouds ok |
  | pink | `<theme>-tile-pink.webp` | magenta neon glow on dark base, dusk gradient |
  | orange | `<theme>-tile-orange.webp` | burnt-orange sunset / desert dusk gradient |
  | red | `<theme>-tile-red.webp` | dark red brick wall, subtle mortar lines |
  | yellow | `<theme>-tile-yellow.webp` | golden sand dunes, shaded (not bleached) |
  | green | `<theme>-tile-green.webp` | dark turf / grass texture |
  | blue | `<theme>-tile-blue.webp` | deep navy night gradient, faint stars ok |

  Example: generate `tile-brown.webp` … `tile-blue.webp` once, copy to
  `grandprix-tile-brown.webp`, `city-tile-brown.webp`, etc.
- **512 × 512 px square** (min 256). Displayed tiny (~80–180 px), so bold
  simple texture beats fine detail. WebP ~80, each under ~80 KB.
- Medium-dark overall with darker edges (vignette) so white chips pop.
- **No text, numbers, bands, logos, or signs** — the app draws the exact
  HTML color band across the top plus all names/prices/chips, so keep the
  top edge and the middle calm.
- Railroads, utilities, tax, Chance and Chest keep HTML styling — no art
  needed for them.

  Copy-paste generator brief per file:

  ```text
  Square 512x512 game tile background, <DIRECTION FROM TABLE>.
  Flat subtle texture, medium-dark with darker vignette edges.
  Absolutely no text, numbers, letters, logos, signs, people, or animals.
  Top edge kept plain and calm (a color band overlays there).
  Center kept calm for overlaid game chips.
  ```

  Specials share one brief each (generate once, reuse across themes):
  railroad = dark steel rails + sleepers from above · utility = stormy teal
  gradient with a faint lightning fork · tax = grey parchment / official
  seal motif, no readable text · chance + chest = deep-purple mystery
  card-back pattern (one file may serve both: point both paths at it).

## Style + acceptance

Premium modern board-game look: clean, colorful, slightly illustrated,
consistent across themes; no photorealistic clutter, fake ads, or heavy 3D.
Readable at ~900 px display width. Checklist per file: square, right content,
zero generated text/logos, calm chip zones, correct filenames.
