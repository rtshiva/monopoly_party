/**
 * botPicks.ts — Pure bot decision scans (no mutation, no timers, no I/O).
 *
 * Extracted from botBrain.ts (one concern per file): the turn state machine
 * stays in botBrain.ts, the buy/build/unmortgage/mortgage picks live here.
 * Leaf module — imports only shared/trade/houses, so no import cycle.
 */
import { BOARD, unmortgageFee } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { colorSetTiles } from './trade.js';
import { setHasBuildings } from './houses.js';

/** Bots keep this cash buffer after a purchase (never go broke buying). */
export const BOT_BUY_BUFFER = 100;
/** Bots build only when left with more than this after the house cost. */
export const BOT_BUILD_BUFFER = 200;
/** Bots unmortgage while keeping at least this cash on hand. */
export const BOT_UNMORTGAGE_BUFFER = 500;

/** Pure decision: buy when the price leaves the safety buffer. */
export function shouldBuy(cash: number, price: number): boolean {
  return cash >= price + BOT_BUY_BUFFER;
}

/**
 * Cheapest legal house build for a bot: a tile tied for the lowest level in
 * a fully-owned, unmortgaged set the bot can afford (with buffer). Pure scan,
 * no mutation. Mirrors the server's even-build rule.
 */
export function pickBuildTile(room: RoomState, me: Player): number | null {
  let best: number | null = null;
  let bestCost = Infinity;
  for (const tile of me.properties) {
    const t = BOARD[tile];
    if (!t || t.kind !== 'property') continue;
    const set = colorSetTiles(tile);
    if (set.length === 0 || !set.every((i) => me.properties.includes(i))) continue;
    if (set.some((i) => me.mortgaged.includes(i))) continue;
    const level = room.buildings[tile] ?? 0;
    if (level >= 5) continue;
    const min = Math.min(...set.map((i) => room.buildings[i] ?? 0));
    if (level > min) continue; // even build: only lowest tiles
    if (me.cash < t.houseCost + BOT_BUILD_BUFFER) continue;
    if (t.houseCost < bestCost) {
      bestCost = t.houseCost;
      best = tile;
    }
  }
  return best;
}

/**
 * Unmortgage pick: cheapest fee first (shared unmortgageFee: 60% of price).
 * Pure scan, no mutation. Without this, bots mortgage-spiral into eternal
 * rent-free endgames that never conclude.
 */
export function pickUnmortgageTile(room: RoomState, me: Player): number | null {
  void room;
  let best: number | null = null;
  let bestFee = Infinity;
  for (const tile of me.mortgaged) {
    const t = BOARD[tile] as { price: number } | undefined;
    if (!t || typeof t.price !== 'number') continue;
    const fee = unmortgageFee(t.price);
    if (me.cash < fee + BOT_UNMORTGAGE_BUFFER) continue;
    if (fee < bestFee) {
      bestFee = fee;
      best = tile;
    }
  }
  return best;
}

/**
 * Mortgage rescue: prioritize deeds that don't break complete color sets
 * (railroads, utilities, and lone properties first; full-set properties last).
 * Pure scan, no mutation. Returns null when nothing can be mortgaged.
 */
export function pickMortgageTile(room: RoomState, me: Player): number | null {
  const eligible = me.properties.filter((tile) => !me.mortgaged.includes(tile) && !setHasBuildings(room, tile));
  if (eligible.length === 0) return null;

  // Rank deeds: non-property (railroad/utility) = 0, incomplete color set = 1, complete set = 2
  function rank(tile: number): number {
    const t = BOARD[tile];
    if (!t || t.kind !== 'property') return 0;
    const set = colorSetTiles(tile);
    const hasFull = set.length > 0 && set.every((i) => me.properties.includes(i));
    return hasFull ? 2 : 1;
  }

  // Stable sort: lowest rank first (preserves deed order among ties)
  let best = eligible[0];
  if (best === undefined) return null;
  let bestRank = rank(best);
  for (let i = 1; i < eligible.length; i++) {
    const cand = eligible[i];
    if (cand === undefined) continue;
    const r = rank(cand);
    if (r < bestRank) {
      bestRank = r;
      best = cand;
    }
  }
  return best ?? null;
}
