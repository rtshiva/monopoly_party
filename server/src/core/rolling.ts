/**
 * rolling.ts — Hold-to-roll presence ("X is shaking the dice").
 *
 * The phone rattles dice locally while held; this flag mirrors that state to
 * the room so the TV and other phones show the roll-in-progress wobble.
 * Ephemeral by design: cleared on commit (rollDice), explicit stop, holder
 * disconnect, safety timeout, and never restored from snapshots.
 */
import type { RoomState } from '@monopoly/shared';
import { rooms, rollingTimers } from '../store.js';
import { emit } from './broadcast.js';

export const ROLLING_TIMEOUT_MS = 8000;

/** Set (or refresh) the shaking flag and broadcast. Auto-clears on timeout. */
export function setRolling(room: RoomState, pid: string) {
  const prev = rollingTimers.get(room.code);
  if (prev) { clearTimeout(prev); rollingTimers.delete(room.code); }
  room.rollingId = pid;
  rollingTimers.set(
    room.code,
    setTimeout(() => {
      rollingTimers.delete(room.code);
      const live = rooms.get(room.code);
      if (live === room && live.rollingId === pid) {
        live.rollingId = null;
        emit(live);
      }
    }, ROLLING_TIMEOUT_MS),
  );
  emit(room);
}

/** Clear the flag if it belongs to `pid`. Returns true when it changed. */
export function clearRolling(room: RoomState, pid: string): boolean {
  if (room.rollingId !== pid) return false;
  const t = rollingTimers.get(room.code);
  if (t) { clearTimeout(t); rollingTimers.delete(room.code); }
  room.rollingId = null;
  return true;
}
