import type { RoomDelta, RoomState } from './types.js';

// Top-level keys compared for deltas. `rev` is version metadata (always sent
// via the delta envelope) and `lastActivity` churns on every emit without
// gameplay meaning, so both are excluded from the patch body.
const DELTA_KEYS = [
  'status', 'players', 'turnIndex', 'dice', 'lastRoll', 'lastCard',
  'pendingBuy', 'trades', 'auction', 'buildings', 'turnDeadline',
  'auctionQueue', 'pausedAt', 'boardStyle', 'log', 'winnerId',
  'turnCount', 'rollingId',
] as const satisfies ReadonlyArray<keyof RoomState>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Pure: shallow top-level diff of two rooms (for broadcast deltas). */
export function diffRoom(prev: RoomState | null | undefined, next: RoomState): Pick<RoomDelta, 'changed' | 'patch'> {
  const changed: Array<keyof RoomState> = [];
  const patch: Partial<RoomState> = {};
  if (!prev) {
    for (const k of DELTA_KEYS) (patch as Record<string, unknown>)[k] = next[k];
    return { changed: [...DELTA_KEYS], patch };
  }
  for (const k of DELTA_KEYS) {
    if (!same(prev[k], next[k])) {
      changed.push(k);
      (patch as Record<string, unknown>)[k] = next[k];
    }
  }
  return { changed, patch };
}

/**
 * Pure: apply a delta onto a cached room. Returns the merged room, or null
 * when the delta's base doesn't match (caller must fall back to full sync).
 */
export function applyRoomDelta(cached: RoomState | null | undefined, delta: RoomDelta): RoomState | null {
  if (!cached || cached.code !== delta.code || (cached.rev ?? 0) !== delta.baseRev) return null;
  return { ...cached, ...delta.patch, rev: delta.rev, lastActivity: Date.now() };
}
