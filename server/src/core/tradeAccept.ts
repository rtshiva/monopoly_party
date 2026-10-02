/**
 * tradeAccept.ts — Per-tile trade-asset validation shared by the offer and
 * accept paths (handlers/trades.ts).
 *
 * Extracted so the handler stays thin (arch: no game logic in handlers).
 * Pure predicate, no I/O. Leaf module — imports only the trade/houses
 * leaves, so no import cycle.
 */
import type { Player, RoomState } from '@monopoly/shared';
import { setHasBuildings } from './houses.js';
import { isTileLocked, normCards, normCash, normTiles } from './trade.js';

export type TradeAssetError = 'HAS_HOUSES' | 'TILE_LOCKED';
/**
 * Check every tile is tradable by its owner: no buildings anywhere in the
 * color set, currently owned, unmortgaged, and not locked in another offer.
 * Returns the rejection code or null when clean.
 */
export function validateTradeAssets(
  room: RoomState,
  tiles: number[],
  owner: Player,
  excludeId?: string,
): TradeAssetError | null {
  for (const t of tiles) {
    // Strict official rule: any building anywhere in the color set locks
    // every deed in that set — sell the whole set off evenly first.
    if (setHasBuildings(room, t)) return 'HAS_HOUSES';
    if (!owner.properties.includes(t) || owner.mortgaged.includes(t) || isTileLocked(room, t, excludeId)) {
      return 'TILE_LOCKED';
    }
  }
  return null;
}

export interface ParsedTradeAssets {
  giveTiles: number[];
  wantTiles: number[];
  giveCash: number;
  wantCash: number;
  giveCards: number;
  wantCards: number;
}

/**
 * Normalize + shape-check a raw offer payload. Null on any defect (every
 * defect is BAD_TRADE at the handler). Pure, no I/O.
 */
export function parseTradeAssets(raw: {
  giveTiles: unknown;
  wantTiles: unknown;
  giveCash: unknown;
  wantCash: unknown;
  giveCards: unknown;
  wantCards: unknown;
}): ParsedTradeAssets | null {
  const giveTiles = normTiles(raw.giveTiles);
  const wantTiles = normTiles(raw.wantTiles);
  const giveCash = normCash(raw.giveCash);
  const wantCash = normCash(raw.wantCash);
  const giveCards = normCards(raw.giveCards);
  const wantCards = normCards(raw.wantCards);
  if (
    giveTiles === null ||
    wantTiles === null ||
    giveCash === null ||
    wantCash === null ||
    giveCards === null ||
    wantCards === null
  ) {
    return null;
  }
  if (
    giveTiles.length === 0 &&
    wantTiles.length === 0 &&
    giveCash === 0 &&
    wantCash === 0 &&
    giveCards === 0 &&
    wantCards === 0
  ) {
    return null;
  }
  if (new Set([...giveTiles, ...wantTiles]).size !== giveTiles.length + wantTiles.length) return null;
  return { giveTiles, wantTiles, giveCash, wantCash, giveCards, wantCards };
}
