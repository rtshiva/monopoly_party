import type { Server } from 'socket.io';
import type { RoomState } from '@monopoly/shared';

export interface SessionData { pid?: string; code?: string }

/** All live rooms. Rooms are plain mutable objects; the server is the single writer. */
export const rooms = new Map<string, RoomState>();

/** One pending auction timer per room code. */
export const auctionTimers = new Map<string, NodeJS.Timeout>();

/** One pending turn timer per room code. Guarded by turnCount token. */
export const turnTimers = new Map<string, NodeJS.Timeout>();

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
