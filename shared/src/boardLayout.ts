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
export function tileCell(i: number): { col: number; row: number } {
  if (i <= 10) return { col: i, row: 0 };
  if (i <= 19) return { col: 10, row: i - 10 };
  if (i <= 30) return { col: 30 - i, row: 10 };
  return { col: 0, row: 40 - i };
}
