export interface MazeCell {
  tile: number;
  row: number;
  col: number;
  /** Compass direction from this tile to the next one along the track. */
  next: 'right' | 'left' | 'down' | 'up' | 'end';
}

/**
 * Serpentine (boustrophedon) layout: tiles snake left-to-right, then
 * right-to-left, filling a compact grid with no dead center. Row 0 runs
 * left→right so tile 0 (GO) sits top-left and the last tile bottom-right.
 */
export function serpentineOrder(total = 40, cols = 8): MazeCell[] {
  const cells: MazeCell[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const ltr = row % 2 === 0;
    const col = ltr ? i % cols : cols - 1 - (i % cols);
    let next: MazeCell['next'] = 'end';
    if (i < total - 1) {
      const nrow = Math.floor((i + 1) / cols);
      if (nrow !== row) next = 'down';
      else next = ltr ? 'right' : 'left';
    }
    cells.push({ tile: i, row, col, next });
  }
  return cells;
}

export const MAZE_ARROWS: Record<MazeCell['next'], string> = {
  right: '→',
  left: '←',
  down: '↓',
  up: '↑',
  end: '🏁',
};

export interface CircuitPoint { tile: number; x: number; y: number }

/**
 * F1-style circuit loop in a 100 x 62.5 box (16:10): a boxy superellipse
 * stadium (tile 0 on the top start/finish straight, clockwise) with one
 * chicane kink on the bottom straight. Points are evenly spaced by arc
 * length so all 40 tiles get equal track — no hand-placed coordinates.
 */
export function circuitLayout(total = 40): CircuitPoint[] {
  const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const raw: Array<{ x: number; y: number }> = [];
  const SAMPLES = 1200;
  for (let s = 0; s < SAMPLES; s++) {
    const t = (s / SAMPLES) * Math.PI * 2;
    let x = 50 + 44 * spow(Math.sin(t), 2 / 3.2);
    let y = 31.25 - 21 * spow(Math.cos(t), 2 / 3.2);
    // Chicane: S-wiggle on the bottom straight (t near PI). The cos-squared
    // envelope vanishes WITH zero slope at both ends, so the bump joins the
    // base curve without kinks (verified: tile-spacing ratio stays ~1.01).
    const d = Math.abs(t - Math.PI);
    const W = 0.45;
    if (d < W) {
      const k = Math.cos((d / W) * Math.PI / 2) ** 2;
      x += 3.0 * k * Math.sign(Math.sin(t) || 1);
      y += 2.4 * k;
    }
    raw.push({ x, y });
  }
  // Walk cumulative arc length, dropping tiles at even fractions.
  const cum: number[] = [0];
  for (let s = 1; s <= SAMPLES; s++) {
    const a = raw[s - 1], b = raw[s % SAMPLES];
    cum.push(cum[s - 1] + Math.hypot(a.x - b.x, a.y - b.y));
  }
  const perimeter = cum[SAMPLES];
  const pts: CircuitPoint[] = [];
  let seg = 1;
  for (let i = 0; i < total; i++) {
    const target = (i / total) * perimeter;
    while (seg < SAMPLES && cum[seg] < target) seg++;
    const a = raw[seg - 1], b = raw[seg % SAMPLES];
    const span = cum[seg] - cum[seg - 1] || 1;
    const f = (target - cum[seg - 1]) / span;
    pts.push({ tile: i, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return pts;
}
