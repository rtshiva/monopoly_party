/**
 * seat.ts — Device identity and seat-control primitives.
 *
 * A "seat" is a player slot. A "controller" is the device (socket) currently
 * driving that seat. These are separate: a seat persists across refreshes;
 * the controller can change via rejoin or PIN claim.
 *
 * The secret key for each seat is stored only in seatKeys (server memory) and
 * in the controller's localStorage — it is NEVER broadcast in roomState.
 */
import type { Player, RoomState } from '@monopoly/shared';
import {
  clearControllerSocket,
  dropControl,
  genPin,
  getIo,
  issueControl,
  seatKeys,
  seatSockets,
} from '../store.js';

export { clearControllerSocket, dropControl, genPin, issueControl };

/** Verify that a socket is the authorised controller for a seat. Returns the Player or null. */
export function requireControl(
  room: RoomState,
  playerId: unknown,
  key: unknown,
): Player | null {
  if (typeof playerId !== 'string' || typeof key !== 'string' || !key) return null;
  const me = room.players.find((p) => p.id === playerId);
  if (!me || me.bankrupt) return null;
  return seatKeys.get(room.code)?.get(me.id) === key ? me : null;
}

export function controllerSocketOf(code: string, playerId: string): string | undefined {
  return seatSockets.get(code)?.get(playerId);
}

export function setControllerSocket(code: string, playerId: string, socketId: string) {
  let m = seatSockets.get(code);
  if (!m) { m = new Map(); seatSockets.set(code, m); }
  m.set(playerId, socketId);
}

/**
 * If a different socket was driving this seat, send it an 'evicted' event,
 * then register the new socket as the controller.
 */
export function evictPreviousController(
  code: string,
  playerId: string,
  socketId: string,
  byLabel: string,
) {
  const prev = controllerSocketOf(code, playerId);
  if (prev && prev !== socketId) {
    getIo().to(prev).emit('evicted', { seatId: playerId, by: byLabel });
  }
  setControllerSocket(code, playerId, socketId);
}
