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
