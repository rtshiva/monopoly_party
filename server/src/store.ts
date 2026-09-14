import type { Server } from 'socket.io';
import type { RoomState } from '@monopoly/shared';
import { forgetHistory } from './history.js';

export interface SessionData { pid?: string; code?: string }

/** All live rooms. Rooms are plain mutable objects; the server is the single writer. */
export const rooms = new Map<string, RoomState>();

/** One pending auction timer per room code. */
export const auctionTimers = new Map<string, NodeJS.Timeout>();

/** One pending turn timer per room code. Guarded by turnCount token. */
export const turnTimers = new Map<string, NodeJS.Timeout>();

/** One pending bot-think timer per room code. Guarded by turnCount token. */
export const botTimers = new Map<string, NodeJS.Timeout>();

/** Safety timer per room code that clears a stuck hold-to-roll presence flag. */
export const rollingTimers = new Map<string, NodeJS.Timeout>();

/**
 * Control secrets: room code -> seat (player) id -> secret key.
 * NEVER broadcast — keys travel only in acks to the controlling device.
 * Lost on restart by design; seats are reclaimed with the TV PIN (persisted).
 */
export const seatKeys = new Map<string, Map<string, string>>();

/** Live controller sockets: room code -> seat id -> socket id. */
export const seatSockets = new Map<string, Map<string, string>>();

/** Last emitted snapshot per room code (for delta computation). Memory-only. */
export const roomSnaps = new Map<string, RoomState>();

export function genKey(): string {
  return `${uid('k')}${Math.random().toString(36).slice(2, 10)}`;
}

export function genPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Issue (or rotate) the control key for a seat. Returns the new key. */
export function issueControl(code: string, playerId: string): string {
  const key = genKey();
  let m = seatKeys.get(code);
  if (!m) { m = new Map(); seatKeys.set(code, m); }
  m.set(playerId, key);
  return key;
}

export function dropControl(code: string, playerId: string) {
  seatKeys.get(code)?.delete(playerId);
  seatSockets.get(code)?.delete(playerId);
}

/** Forget which socket drives a seat, but keep its key so it can rejoin. */
export function clearControllerSocket(code: string, playerId: string) {
  seatSockets.get(code)?.delete(playerId);
}

/** Drop all transient control state for a room (expiry/teardown). Player ids
 *  are random per seat, so a future room reusing the code can never collide —
 *  this is purely memory hygiene. */
export function forgetRoom(code: string) {
  seatKeys.delete(code);
  seatSockets.delete(code);
  roomSnaps.delete(code);
  const bt = botTimers.get(code);
  if (bt) { clearTimeout(bt); botTimers.delete(code); }
  forgetHistory(code);
}

let idSeq = 1;
export const uid = (p: string) =>
  `${p}_${Date.now().toString(36)}_${(idSeq++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

// Helpers broadcast via this singleton; set once at boot in index.ts.
let ioRef: Server | null = null;
export function setIo(io: Server) { ioRef = io; }
export function getIo(): Server {
  if (!ioRef) throw new Error('socket.io not initialized');
  return ioRef;
}
