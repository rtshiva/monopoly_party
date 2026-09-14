/**
 * player.ts — Room and player utility functions.
 *
 * Covers: room code generation, token validation, current-player accessor,
 * turn advancement, and win detection. No I/O — callers handle emit().
 */
import type { Player, RoomState } from '@monopoly/shared';
import { rooms } from '../store.js';
import { log } from './broadcast.js';

// ---------- room code ----------

/**
 * Generate a unique 6-character room code (A-Z 2-9, no confusable chars).
 * Uses an iterative loop — avoids unbounded recursion on collisions.
 */
export function makeCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = '';
  do {
    c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(c));
  return c;
}

// ---------- token ----------

const VALID_TOKENS: Player['token'][] = ['car', 'hat', 'dog', 'ship', 'cat', 'balloon', 'robot', 'crown'];
export function cleanToken(t: unknown, fallback: Player['token']): Player['token'] {
  return VALID_TOKENS.includes(t as Player['token']) ? (t as Player['token']) : fallback;
}

/** Suffix a taken display name until it's unique ("Anu" → "Anu 2" → "Anu 3"). Pure. */
export function uniqueName(players: Player[], name: string): string {
  const taken = new Set(players.map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`.toLowerCase())) n++;
  return `${name} ${n}`;
}

// ---------- player accessors ----------

/** Return the player whose turn it currently is. */
export function current(room: RoomState): Player {
  return room.players[room.turnIndex % Math.max(1, room.players.length)];
}

/** Return all non-bankrupt players. */
export function activePlayers(room: RoomState): Player[] {
  return room.players.filter((p) => !p.bankrupt);
}

// ---------- win detection ----------

export function checkWin(room: RoomState) {
  const alive = activePlayers(room);
  // Solo survivor wins — including kick-down-to-one (players.length drops to
  // 1 via removeSeat). Only called from in-game paths, never the lobby.
  if (room.status === 'playing' && alive.length === 1) {
    room.status = 'finished';
    room.winnerId = alive[0].id;
    log(room, `🏆 ${alive[0].name} wins the game!`, 'good');
  }
}

// ---------- turn advancement ----------

/**
 * Advance the turn index to the next non-bankrupt player, reset their roll
 * state, increment the turn counter, and re-arm the turn timer.
 *
 * Import armTurnTimer from timers.ts to avoid a circular dep chain:
 *   player → timers → player (advanceTurn calls armTurnTimer)
 * We break the cycle by importing lazily through a setter injected at boot.
 */
let _armTurnTimer: ((room: RoomState) => void) | null = null;
export function injectArmTurnTimer(fn: (room: RoomState) => void) { _armTurnTimer = fn; }

export function advanceTurn(room: RoomState) {
  if (room.status !== 'playing') return;
  room.pendingBuy = null;
  let guard = 0;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    guard++;
  } while (current(room).bankrupt && guard < 20);
  const cp = current(room);
  cp.hasRolled = false;
  cp.doubles = 0;
  room.turnCount++;
  log(room, `➡️ ${cp.name}'s turn — roll on your phone`, 'info', 'info');
  checkWin(room);
  _armTurnTimer?.(room);
}
