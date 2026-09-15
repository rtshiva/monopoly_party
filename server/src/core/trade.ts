/**
 * trade.ts — Trade offer utilities: validation helpers, asset swap, pruning.
 *
 * All functions are pure state mutations or pure predicates — no I/O.
 * Handlers call emit() from broadcast.ts after applying these.
 */
import { BOARD, MAX_TRADE_CASH } from '@monopoly/shared';
import type { Player, RoomState, TradeOffer } from '@monopoly/shared';

// ---------- tile / buyability helpers ----------

export function isBuyable(tile: number): boolean {
  const t = BOARD[tile];
  return !!t && (t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility');
}

export function colorSetTiles(tile: number): number[] {
  const t = BOARD[tile];
  if (!t || t.kind !== 'property') return [];
  return BOARD.map((x, i) => ({ x, i }))
    .filter(({ x }) => x.kind === 'property' && x.color === t.color)
    .map(({ i }) => i);
}

// ---------- trade state helpers ----------

/** Atomic asset swap for an accepted offer. Pure mutation, no I/O. */
export function applyTradeSwap(from: Player, me: Player, offer: TradeOffer) {
  from.properties = from.properties.filter((t) => !offer.giveTiles.includes(t));
  me.properties = me.properties.filter((t) => !offer.wantTiles.includes(t));
  from.properties.push(...offer.wantTiles);
  me.properties.push(...offer.giveTiles);
  from.cash += (offer.wantCash ?? 0) - (offer.giveCash ?? 0);
  me.cash += (offer.giveCash ?? 0) - (offer.wantCash ?? 0);
  from.jailCards += (offer.wantCards ?? 0) - (offer.giveCards ?? 0);
  me.jailCards += (offer.giveCards ?? 0) - (offer.wantCards ?? 0);
}

export function pruneTrades(room: RoomState) {
  const now = Date.now();
  const expired = room.trades.filter((t) => t.expiresAt <= now);
  if (expired.length > 0) {
    room.trades = room.trades.filter((t) => t.expiresAt > now);
    for (const t of expired) {
      const from = room.players.find((p) => p.id === t.fromId)?.name ?? 'Player';
      const to = room.players.find((p) => p.id === t.toId)?.name ?? 'Player';
      room.log.unshift({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: `⌛ Trade offer from ${from} to ${to} expired`,
        at: Date.now(),
        tone: 'info',
        turn: room.turnCount,
        cat: 'trade',
      });
    }
    room.log = room.log.slice(0, 80);
  }
}

export function removePlayerTrades(room: RoomState, pid: string) {
  room.trades = room.trades.filter((t) => t.fromId !== pid && t.toId !== pid);
}

/** Returns true if a tile is currently locked inside a pending trade offer. */
export function isTileLocked(room: RoomState, tile: number, excludeId?: string): boolean {
  return room.trades.some(
    (t) => t.id !== excludeId && (t.giveTiles.includes(tile) || t.wantTiles.includes(tile)),
  );
}

// ---------- input normalisation ----------

export function normTiles(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > 8) return null;
  const out: number[] = [];
  for (const x of v) {
    if (!Number.isInteger(x) || !isBuyable(x as number)) return null;
    if (out.includes(x as number)) return null; // no dupes
    out.push(x as number);
  }
  return out;
}

export function normCash(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_TRADE_CASH) return null;
  return v;
}

export function normCards(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 20) return null;
  return v;
}

export function describeTrade(offer: TradeOffer): string {
  const bits: string[] = [];
  if (offer.giveTiles.length) bits.push(offer.giveTiles.map((t) => BOARD[t].name).join(', '));
  if (offer.giveCash) bits.push(`$${offer.giveCash}`);
  if (offer.giveCards) bits.push(`🃏×${offer.giveCards}`);
  const want: string[] = [];
  if (offer.wantTiles.length) want.push(offer.wantTiles.map((t) => BOARD[t].name).join(', '));
  if (offer.wantCash) want.push(`$${offer.wantCash}`);
  if (offer.wantCards) want.push(`🃏×${offer.wantCards}`);
  return `${bits.join(' + ') || 'nothing'} for ${want.join(' + ') || 'nothing'}`;
}
