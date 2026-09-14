/**
 * hygiene.ts — Dead-room expiry and memory capping.
 *
 * Moved verbatim out of index.ts so the rules are unit-testable:
 * sweepRooms() takes the clock as a parameter (no Date.now() inside, no
 * sleeping in tests). Same TTLs, same order (clear timers → forget → delete),
 * same snapshot write after each sweep.
 */
import type { RoomState } from '@monopoly/shared';
import { forgetRoom, rooms } from '../store.js';
import { clearAuctionTimer } from './auction.js';
import { clearTurnTimer } from './timers.js';
import { saveRooms } from '../persist.js';
import { dlog } from '../debug.js';

export const FINISHED_TTL_MS = 30 * 60 * 1000;
export const LOBBY_TTL_MS = 4 * 60 * 60 * 1000;
export const DEAD_PLAYING_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_ROOMS = 200;

/**
 * Purge stale rooms + enforce the cap. Returns purged codes (for tests/logs).
 * Operates on the live room map, like the index.ts loop it replaces.
 */
export function sweepRooms(nowMs: number, maxRooms: number = MAX_ROOMS): string[] {
  const purged: string[] = [];
  for (const [code, room] of rooms) {
    const idle = nowMs - (room.lastActivity ?? nowMs);
    const allGone = room.players.length > 0 && room.players.every((p) => !p.connected);
    const stale =
      (room.status === 'finished' && idle > FINISHED_TTL_MS) ||
      (room.status === 'lobby' && idle > LOBBY_TTL_MS) ||
      (allGone && idle > DEAD_PLAYING_TTL_MS);
    if (stale) {
      clearAuctionTimer(code);
      clearTurnTimer(code);
      forgetRoom(code);
      rooms.delete(code);
      purged.push(code);
      dlog({ evt: 'hygiene.purge', code, msg: `${room.status} idle=${Math.round(idle / 1000)}s` });
    }
  }
  if (rooms.size > maxRooms) {
    const victims = [...rooms.values()]
      .filter((r) => r.status !== 'playing')
      .sort((a, b) => (a.lastActivity ?? 0) - (b.lastActivity ?? 0));
    for (const v of victims.slice(0, rooms.size - maxRooms)) {
      clearAuctionTimer(v.code);
      clearTurnTimer(v.code);
      forgetRoom(v.code);
      rooms.delete(v.code);
      purged.push(v.code);
      dlog({ evt: 'hygiene.cap-evict', code: v.code, msg: `${v.status}` });
    }
  }
  saveRooms(rooms);
  return purged;
}

/** 60s unref'd sweep. Runs the process lifetime; never keeps it alive alone. */
export function startHygiene() {
  setInterval(() => {
    sweepRooms(Date.now());
  }, 60_000).unref?.();
}
