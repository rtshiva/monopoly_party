/**
 * auction.ts — Auction lifecycle: open, schedule resolution, resolve, queue.
 *
 * The auction timer (one per room) is managed here. Callers must call emit()
 * after any function that mutates room state.
 */
import { AUCTION_DURATION_MS } from '@monopoly/shared';
import { BOARD } from '@monopoly/shared';
import type { Auction, RoomState } from '@monopoly/shared';
import { auctionTimers, rooms, uid } from '../store.js';
import { log, emit } from './broadcast.js';
import { dlog } from '../debug.js';
import { isBuyable } from './trade.js';
import { ownerOf } from '@monopoly/shared';

/**
 * Turn-clock hooks, injected at boot (see index.ts). Kept behind a setter —
 * importing timers.ts directly would cycle back into this module
 * (timers → auction → timers). Same pattern as player.ts.
 */
let _armTurnTimer: ((room: RoomState) => void) | null = null;
let _clearTurnTimer: ((code: string) => void) | null = null;
export function injectAuctionClock(
  arm: (room: RoomState) => void,
  clear: (code: string) => void,
) {
  _armTurnTimer = arm;
  _clearTurnTimer = clear;
}

export function clearAuctionTimer(code: string) {
  const t = auctionTimers.get(code);
  if (t) { clearTimeout(t); auctionTimers.delete(code); }
}

export function scheduleAuctionResolve(code: string, auctionId: string) {
  clearAuctionTimer(code);
  auctionTimers.set(
    code,
    setTimeout(() => {
      auctionTimers.delete(code);
      resolveAuction(code, auctionId);
    }, AUCTION_DURATION_MS + 500),
  );
}

export function openAuction(room: RoomState, tile: number, startedById: string): boolean {
  if (!isBuyable(tile) || ownerOf(room, tile)) return false;
  clearAuctionTimer(room.code);
  // Freeze the turn clock while the hammer is down: nobody rolls, ends, or
  // times out mid-auction. resolveAuction() re-arms when the slot frees up.
  _clearTurnTimer?.(room.code);
  room.turnDeadline = null;
  room.auction = {
    id: uid('a'),
    tile,
    startedBy: startedById,
    bids: [],
    endsAt: Date.now() + AUCTION_DURATION_MS,
  };
  log(room, `🔨 Auction opened for ${BOARD[tile].name}! Bid from your phone (30s)`, 'money', 'purchase');
  scheduleAuctionResolve(room.code, room.auction.id);
  dlog({ evt: 'auction.open', code: room.code, turn: room.turnCount, seat: startedById, msg: BOARD[tile].name, tile });
  return true;
}

export function resolveAuction(code: string, auctionId: string) {
  const room = rooms.get(code);
  if (!room || !room.auction || room.auction.id !== auctionId) return;
  // The timer can outlive the game (e.g. bankruptcy ends it mid-auction):
  // never award deeds after the trophy — just clear the stale panel.
  if (room.status !== 'playing') { room.auction = null; emit(room); return; }
  const auction: Auction = room.auction;
  room.auction = null;
  const valid = auction.bids.filter((b) => {
    const p = room.players.find((x) => x.id === b.playerId);
    return p && !p.bankrupt && p.cash >= b.amount;
  });
  valid.sort((a, b) => b.amount - a.amount || a.at - b.at);
  if (valid.length === 0) {
    log(room, `🔨 Auction for ${BOARD[auction.tile].name} ended with no bids`, 'info');
    dlog({ evt: 'auction.resolve', code, turn: room.turnCount, msg: `${BOARD[auction.tile].name} no-bids`, tile: auction.tile });
  } else {
    const winner = room.players.find((x) => x.id === valid[0].playerId)!;
    // Re-check ownership: the deed may have sold (buy) while the auction ran.
    // Awarding it again would duplicate the deed onto two seats.
    if (ownerOf(room, auction.tile)) {
      log(room, `🔨 Auction for ${BOARD[auction.tile].name} void — already sold`, 'info');
      dlog({ evt: 'auction.resolve', code, turn: room.turnCount, msg: `${BOARD[auction.tile].name} void-sold`, tile: auction.tile });
    } else {
      winner.cash -= valid[0].amount;
      winner.properties.push(auction.tile);
      log(room, `🔨 ${winner.name} won ${BOARD[auction.tile].name} for $${valid[0].amount}!`, 'good', 'purchase');
      dlog({ evt: 'auction.resolve', code, turn: room.turnCount, seat: winner.id, msg: `${BOARD[auction.tile].name} won $${valid[0].amount}`, tile: auction.tile, amount: valid[0].amount });
    }
  }
  openNextQueuedAuction(room);
  // Hammer down and slot free: hand the table a fresh turn window. Skipped
  // when a chained auction opened above (turns stay frozen through the chain)
  // and when the game just ended (arm is a no-op off 'playing' anyway).
  if (room.status === 'playing' && !room.auction) _armTurnTimer?.(room);
  emit(room);
}

/** Opens the next bank-stock auction if the slot is free. No broadcast inside — callers emit. */
export function openNextQueuedAuction(room: RoomState) {
  if (room.auction || room.auctionQueue.length === 0) return;
  const tile = room.auctionQueue.shift()!;
  if (openAuction(room, tile, 'bank')) {
    log(room, `🏦 Bank auctions ${BOARD[tile].name} (bankrupt stock)`, 'money', 'purchase');
  }
}

/**
 * Pass a deed to auction without ever clobbering a live one: when the slot
 * is occupied the tile waits in the bank queue (drained on resolve). Without
 * this, a second pass inside the 30s window silently destroyed the running
 * auction — bids lost and the first deed vanished from the game.
 * Returns 'open' | 'queued' | 'dropped'. No broadcast inside — callers emit.
 */
export function queueOrOpenAuction(room: RoomState, tile: number, startedById: string): 'open' | 'queued' | 'dropped' {
  if (!isBuyable(tile) || ownerOf(room, tile)) return 'dropped';
  if (room.auction) {
    if (!room.auctionQueue.includes(tile)) room.auctionQueue.push(tile);
    return 'queued';
  }
  return openAuction(room, tile, startedById) ? 'open' : 'dropped';
}
