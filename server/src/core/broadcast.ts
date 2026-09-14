/**
 * broadcast.ts — Logging and room state emission.
 *
 * Kept in its own module so the broadcast boundary is a single, obvious
 * import. Every mutation that should push state to clients calls emit().
 * Every game event that should appear in the feed calls log().
 */
import { getIo, rooms, roomSnaps, uid } from '../store.js';
import { saveRooms } from '../persist.js';
import { flushHistory } from '../history.js';
import { dlog } from '../debug.js';
import { diffRoom } from '@monopoly/shared';
import type { LogCat, RoomDelta, RoomState } from '@monopoly/shared';
import { pruneTrades } from './trade.js';

export function log(
  room: RoomState,
  text: string,
  tone: RoomState['log'][number]['tone'] = 'info',
  cat: LogCat = 'info',
) {
  room.log.unshift({ id: uid('log'), text, at: Date.now(), tone, turn: room.turnCount, cat });
  room.log = room.log.slice(0, 80);
}

/**
 * Broadcast room state, then snapshot all rooms to disk.
 * Called after every state mutation.
 *
 * V2 deltas: every emit bumps `room.rev` and sends both the full `roomState`
 * (compat: old clients + regression suite) and a lightweight `roomDelta`
 * (changed top-level keys + rev envelope). New clients apply the delta when
 * its baseRev matches their cached rev and fall back to the full state
 * otherwise. Once all clients are delta-aware the full send can be dropped.
 */
export function emit(room: RoomState) {
  pruneTrades(room);
  room.lastActivity = Date.now();
  const prev = roomSnaps.get(room.code) ?? null;
  const baseRev = prev?.rev ?? room.rev ?? 0;
  room.rev = baseRev + 1;
  const { changed, patch } = diffRoom(prev, room);
  const delta: RoomDelta = { code: room.code, rev: room.rev, baseRev, changed, patch };
  const io = getIo();
  io.to(room.code).emit('roomState', room);
  if (changed.length > 0 || !prev) io.to(room.code).emit('roomDelta', delta);
  roomSnaps.set(room.code, JSON.parse(JSON.stringify(room)) as RoomState);
  // Snapshot every broadcast: rooms are tiny, and this makes restarts lossless.
  saveRooms(rooms);
  // Durable event log (no-op without DATABASE_URL). Fire-and-forget: history
  // must never delay or fail a broadcast.
  void flushHistory(room).catch(() => {});
  try {
    dlog({
      evt: 'emit', code: room.code, turn: room.turnCount, rev: room.rev,
      changed: changed.length, keys: changed.join(',') || '-',
      fullBytes: JSON.stringify(room).length, patchBytes: JSON.stringify(patch).length,
    });
  } catch { /* journal is best-effort */ }
}
