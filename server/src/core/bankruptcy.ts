/**
 * bankruptcy.ts — Seat removal and bankruptcy resolution.
 *
 * Two entry points:
 *   bankruptPlayer() — voluntary or forced (turn timer, negative cash).
 *   removeSeat()     — host kick before/during game.
 *
 * Both transfer deeds to the bank auction queue. No I/O — callers emit().
 */
import type { Player, RoomState } from '@monopoly/shared';
import { dropControl } from '../store.js';
import { log } from './broadcast.js';
import { advanceTurn, checkWin, current } from './player.js';
import { openNextQueuedAuction } from './auction.js';
import { removePlayerTrades } from './trade.js';
import { armTurnTimer } from './timers.js';

export function bankruptPlayer(room: RoomState, me: Player) {
  me.bankrupt = true;
  const deeds = [...me.properties];
  for (const t of deeds) delete room.buildings[t];
  me.properties = [];
  me.mortgaged = [];
  me.jailCards = 0;
  me.controllerLabel = null;
  dropControl(room.code, me.id);
  removePlayerTrades(room, me.id);
  if (deeds.length > 0) {
    room.auctionQueue.push(...deeds);
    log(
      room,
      `🏦 ${me.name}'s ${deeds.length} deed${deeds.length === 1 ? '' : 's'} go${deeds.length === 1 ? 'es' : ''} to bank auction`,
      'info',
    );
  }
  log(room, `💀 ${me.name} went bankrupt!`, 'bad');
  if (current(room).id === me.id) advanceTurn(room);
  checkWin(room);
  if (room.status === 'playing' && !room.auction) openNextQueuedAuction(room);
}

export function removeSeat(room: RoomState, target: Player) {
  const deeds = [...target.properties];
  for (const t of deeds) delete room.buildings[t];
  removePlayerTrades(room, target.id);
  dropControl(room.code, target.id);
  if (deeds.length > 0) room.auctionQueue.push(...deeds);
  const idx = room.players.findIndex((p) => p.id === target.id);
  if (idx === -1) return;
  room.players.splice(idx, 1);
  if (room.players.length === 0) return;
  if (idx < room.turnIndex) room.turnIndex--;
  room.turnIndex = room.turnIndex % room.players.length;
  const cp = current(room);
  cp.hasRolled = false;
  cp.doubles = 0;
  room.pendingBuy = null;
  // Win check first: arming the clock on a game that just ended leaves an
  // orphan timer + deadline behind (harmless today, but wrong).
  checkWin(room);
  if (room.status === 'playing') armTurnTimer(room);
  if (room.status === 'playing' && !room.auction) openNextQueuedAuction(room);
}
