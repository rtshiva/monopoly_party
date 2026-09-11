import { DEFAULT_BOUNDS, GRANDPRIX_BOUNDS, type BoardBounds } from '@monopoly/shared';
import type { BoardStyle } from '@monopoly/shared';

export interface BoardSkin {
  /** e.g. '/themes/coastal.webp'. Unset = classic light tiles + SVG center. */
  image?: string;
  /** Explicit grid lines (fractions). Measured per art; defaults uniform. */
  bounds: BoardBounds;
}

/**
 * Measured (pixel line detection, 1254px art) boundaries live in shared so
 * the suite guards them; see GRANDPRIX_BOUNDS there.
 */
export const BOARD_SKINS: Record<BoardStyle, BoardSkin> = {
  grandprix: { image: '/themes/grandprix.png', bounds: GRANDPRIX_BOUNDS },
  city: { bounds: { cols: [...DEFAULT_BOUNDS.cols], rows: [...DEFAULT_BOUNDS.rows] } },
  coastal: { bounds: { cols: [...DEFAULT_BOUNDS.cols], rows: [...DEFAULT_BOUNDS.rows] } },
  mountain: { bounds: { cols: [...DEFAULT_BOUNDS.cols], rows: [...DEFAULT_BOUNDS.rows] } },
};
