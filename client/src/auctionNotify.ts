import type { AuctionBid, RoomState } from '@monopoly/shared';

type Auction = NonNullable<RoomState['auction']>;

/** Highest bid (earliest wins ties — mirrors the server resolve). Pure. */
export function topBid(a: Auction): AuctionBid | null {
  return [...a.bids].sort((x, y) => y.amount - x.amount || x.at - y.at)[0] ?? null;
}

/** Minimum acceptable next bid. Pure. */
export function minNextBid(a: Auction): number {
  const top = topBid(a);
  return Math.max(10, top ? top.amount + 1 : 10);
}

/**
 * Outbid notice for a bidder who is no longer top: the name to beat, or
 * null when leading / not bidding. Pure — no render state needed.
 */
export function outbidBy(a: Auction, myId: string): string | null {
  const top = topBid(a);
  if (!top || top.playerId === myId) return null;
  const mine = a.bids.some((b) => b.playerId === myId);
  return mine ? top.playerId : null;
}

/** Player name lookup with '?' fallback. Pure. */
export function nameOf(room: RoomState, pid: string): string {
  return room.players.find((p) => p.id === pid)?.name ?? '?';
}
