import type { Socket } from 'socket.io';
import { dropControl, rooms, turnTimers, type SessionData } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { dlog } from '../debug.js';
import { current } from '../core/player.js';
import {
  cleanLabel,
  clearControllerSocket,
  controllerSocketOf,
  evictPreviousController,
  genPin,
  issueControl,
  requireControl,
  setControllerSocket,
} from '../core/seat.js';
import { armTurnTimer } from '../core/timers.js';
import { clearRolling } from '../core/rolling.js';

/**
 * Session handlers: seats rejoining, claiming, leaving, and disconnecting.
 * Lobby handlers (create/join/watch/list) live in lobby.ts.
 * Registered alongside the other handlers in index.ts.
 */
export function registerSessionHandlers(socket: Socket) {
  socket.on('rejoin', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const p = requireControl(room, playerId, key);
    if (!p) return cb?.({ ok: false, error: 'NO_CONTROL' });
    p.connected = true;
    setControllerSocket(room.code, p.id, socket.id);
    socket.join(room.code);
    (socket.data as SessionData).pid = p.id;
    (socket.data as SessionData).code = room.code;
    // Wake the clock when it has none: a frozen (all-gone) table restarts its
    // window on the first returning controller. Gated on "no timer pending"
    // so routine rejoins never extend a live player's window.
    if (room.status === 'playing' && !turnTimers.has(room.code)) armTurnTimer(room);
    cb?.({ ok: true, room });
    emit(room);
  });

  // Take over a seat from any device. The seat PIN is public to the room
  // (shown on TV), so presence in the room is the credential; the takeover
  // itself is announced on every screen.
  socket.on(
    'claimSeat',
    (
      {
        code,
        playerId,
        pin,
        deviceLabel,
      }: {
        code: string;
        playerId: string;
        pin: unknown;
        deviceLabel?: unknown;
      },
      cb,
    ) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const seat = room.players.find((x) => x.id === playerId);
      if (!seat || seat.bankrupt || seat.isBot) return cb?.({ ok: false, error: 'BAD_SEAT' });
      if (typeof pin !== 'string' || seat.seatPin !== pin) return cb?.({ ok: false, error: 'BAD_PIN' });
      const label = cleanLabel(deviceLabel);
      evictPreviousController(room.code, seat.id, socket.id, label);
      const controlKey = issueControl(room.code, seat.id);
      seat.seatPin = genPin(); // rotation: the PIN you just used is already dead
      seat.controllerLabel = label;
      seat.connected = true;
      socket.join(room.code);
      (socket.data as SessionData).pid = seat.id;
      (socket.data as SessionData).code = room.code;
      // Same wake-up as rejoin (see above).
      if (room.status === 'playing' && !turnTimers.has(room.code)) armTurnTimer(room);
      log(room, `${label} now controls ${seat.name} (seat PIN rotated)`, 'info');
      dlog({ evt: 'seat.claim', code: room.code, turn: room.turnCount, seat: seat.id, msg: label });
      cb?.({ ok: true, playerId: seat.id, controlKey, room });
      emit(room);
    },
  );

  socket.on('releaseSeat', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    me.controllerLabel = null;
    me.connected = false;
    dropControl(room.code, me.id); // released seats need a fresh PIN claim
    log(room, `${me.name}'s seat was released -- claim it with the TV PIN`, 'info');
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('disconnect', () => {
    const { pid, code } = socket.data as SessionData;
    if (!pid || !code) return;
    // Only the live controller socket takes the seat offline; a stale tab
    // closing must not knock out the device actually playing. The mapping is
    // refreshed by every create/join/rejoin/claim, so dashboards and one-shot
    // watch calls (which never map) can never disturb seat presence.
    if (controllerSocketOf(code, pid) !== socket.id) return;
    const room = rooms.get(code);
    const p = room?.players.find((x) => x.id === pid);
    if (p && room) {
      p.connected = false;
      clearControllerSocket(code, pid); // key survives: this device can rejoin
      clearRolling(room, p.id); // a dead holder can't shake forever
      log(room, `${p.name} disconnected`, 'info');
      dlog({ evt: 'seat.offline', code, turn: room.turnCount, seat: pid });
      // A dead current seat gets a short fuse instead of stalling the table.
      if (room.status === 'playing' && current(room).id === p.id) armTurnTimer(room);
      emit(room);
    }
  });
}
