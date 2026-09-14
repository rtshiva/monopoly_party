/**
 * houses.ts — Even-build set helpers for strict house trading.
 *
 * Official rule: a deed in a color set with any buildings anywhere in the
 * set cannot be traded or mortgaged. Houses must be sold off evenly first.
 * All functions are pure state mutations / predicates — no I/O.
 */
import { BOARD } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { colorSetTiles } from './trade.js';

/** True if any tile in the tile's color set carries buildings. */
export function setHasBuildings(room: RoomState, tile: number): boolean {
  const set = colorSetTiles(tile);
  if (set.length === 0) return (room.buildings[tile] ?? 0) > 0;
  return set.some((i) => (room.buildings[i] ?? 0) > 0);
}

/** Total house/hotel levels across a color set (for UX + refunds). */
export function setBuildingsTotal(room: RoomState, tile: number): number {
  const set = colorSetTiles(tile);
  if (set.length === 0) return room.buildings[tile] ?? 0;
  return set.reduce((s, i) => s + (room.buildings[i] ?? 0), 0);
}

/**
 * Evenly unwind every building in the tile's color set, highest-first
 * (mirrors the sellHouse EVEN_BUILD rule). Credits half houseCost per level.
 * Returns { sold, refund }. Pure mutation, no I/O.
 */
export function sellSetEvenly(room: RoomState, me: Player, tile: number): { sold: number; refund: number } {
  const t0 = BOARD[tile];
  if (!t0 || t0.kind !== 'property') return { sold: 0, refund: 0 };
  const set = colorSetTiles(tile);
  if (set.length === 0) return { sold: 0, refund: 0 };
  if (!set.every((i) => me.properties.includes(i))) return { sold: 0, refund: 0 };
  let sold = 0;
  let refund = 0;
  for (;;) {
    let top = -1;
    let topLevel = 0;
    for (const i of set) {
      const lv = room.buildings[i] ?? 0;
      if (lv > topLevel) {
        topLevel = lv;
        top = i;
      }
    }
    if (top === -1 || topLevel <= 0) break;
    const t = BOARD[top];
    if (!t || t.kind !== 'property') break;
    const half = Math.floor(t.houseCost / 2);
    if (topLevel === 1) delete room.buildings[top];
    else room.buildings[top] = topLevel - 1;
    me.cash += half;
    refund += half;
    sold++;
  }
  return { sold, refund };
}
