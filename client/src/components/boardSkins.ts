import type { BoardStyle } from '@monopoly/shared';

/**
 * Where the 11x11 tile grid sits inside a generated board image, as fractions
 * of image size. Full-bleed (the default) means the image IS an 11x11 board.
 * If a generator drifts, tune these four numbers per theme (see
 * client/public/themes/README.md) — no art re-export needed.
 */
export interface BoardGridCal { x: number; y: number; w: number; h: number }

export interface BoardSkin {
  /** e.g. '/themes/coastal.webp'. Unset = classic light tiles + SVG center. */
  image?: string;
  grid: BoardGridCal;
}

const FULL_BLEED: BoardGridCal = { x: 0, y: 0, w: 1, h: 1 };

export const BOARD_SKINS: Record<BoardStyle, BoardSkin> = {
  grandprix: { grid: { ...FULL_BLEED } },
  city: { grid: { ...FULL_BLEED } },
  coastal: { grid: { ...FULL_BLEED } },
  mountain: { grid: { ...FULL_BLEED } },
};

/** Classic perimeter cell: index 0 (GO) bottom-right, clockwise. */
export function tileCell(i: number): { col: number; row: number } {
  if (i <= 10) return { col: 10 - i, row: 10 };
  if (i <= 19) return { col: 0, row: 10 - (i - 10) };
  if (i <= 30) return { col: i - 20, row: 0 };
  return { col: 10, row: i - 30 };
}

/** Overlay rect for a tile as CSS % strings (floats are fine). */
export function tileRect(i: number, grid: BoardGridCal) {
  const { col, row } = tileCell(i);
  return {
    left: `${(grid.x + (col / 11) * grid.w) * 100}%`,
    top: `${(grid.y + (row / 11) * grid.h) * 100}%`,
    width: `${(grid.w / 11) * 100}%`,
    height: `${(grid.h / 11) * 100}%`,
  };
}
