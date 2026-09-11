/**
 * Board geometry: the 40-tile perimeter on an 11x11 grid.
 *
 * Index 0 (GO) sits TOP-LEFT and play proceeds clockwise: top row
 * left-to-right (0-10), right column down (11-20), bottom row right-to-left
 * (21-30), left column up (31-39). This matches generated art where the
 * start/finish (checkered) corner is top-left.
 *
 * Generated boards are never perfectly uniform (wide corners, AI wobble),
 * so tiles map through explicit boundary arrays (12 grid lines each, as
 * fractions of image size) instead of assuming equal cells. Boundaries come
 * from pixel-measuring the art; overlay chips are small and centered, so
 * ~10px residuals are invisible.
 */
export interface BoardBounds { cols: number[]; rows: number[] }

const EVEN: number[] = Array.from({ length: 12 }, (_, k) => k / 11);

/** Uniform full-bleed fallback for art without measured boundaries. */
export const DEFAULT_BOUNDS: BoardBounds = { cols: [...EVEN], rows: [...EVEN] };

/**
 * Measured (pixel line detection, 1254px Grand Prix art) boundary arrays:
 * wide corners (~175px), ~100px middles, averaged across opposite sides to
 * cancel slant. Residuals <= ~20px; overlay chips are small and centered.
 */
export const GRANDPRIX_BOUNDS: BoardBounds = {
  cols: [0.0016, 0.1391, 0.2281, 0.305, 0.3896, 0.4625, 0.5359, 0.6108, 0.687, 0.7599, 0.862, 0.9944],
  rows: [0.004, 0.1268, 0.2081, 0.2839, 0.3644, 0.4418, 0.5179, 0.5973, 0.6738, 0.7504, 0.8561, 0.9916],
};

export function tileCell(i: number): { col: number; row: number } {
  if (i <= 10) return { col: i, row: 0 };
  if (i <= 19) return { col: 10, row: i - 10 };
  if (i <= 30) return { col: 30 - i, row: 10 };
  return { col: 0, row: 40 - i };
}

/** Overlay rect for a tile as CSS % strings (floats are fine). */
export function tileRect(i: number, bounds: BoardBounds) {
  const { col, row } = tileCell(i);
  const left = bounds.cols[col] * 100;
  const top = bounds.rows[row] * 100;
  const width = (bounds.cols[col + 1] - bounds.cols[col]) * 100;
  const height = (bounds.rows[row + 1] - bounds.rows[row]) * 100;
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}
