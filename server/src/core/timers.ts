/**
 * timers.ts — Turn timer management.
 *
 * Each room has at most one live turn timer. The timer is guarded by a
 * turnCount token to prevent stale callbacks from firing after a turn has
 * already advanced naturally (e.g., player acts at the last second).
 */
import { OFFLINE_TURN_MS, TURN_MS } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { rooms, turnTimers } from '../store.js';
import { log, emit } from './broadcast.js';
import { current, advanceTurn } from './player.js';
import { doRoll } from './roll.js';
import { bankruptPlayer } from './bankruptcy.js';
import { queueOrOpenAuction } from './auction.js';
import { clearRolling } from './rolling.js';
import { pokeBot } from './bots.js';
import { dlog } from '../debug.js';
import { BOARD } from '@monopoly/shared';

export function clearTurnTimer(code: string) {
  const t = turnTimers.get(code);
  if (t) { clearTimeout(t); turnTimers.delete(code); }
}

/**
 * Nobody-home check: every seat offline (bots count as present — they are
 * always connected). A frozen table neither ticks nor self-plays; the next
 * rejoin/claim re-arms, and hygiene reaps it after 2h idle.
 */
export function allGone(room: RoomState): boolean {
  return room.players.length > 0 && room.players.every((p) => !p.connected);
}

/**
 * Late-tap guard: the resolve fires ~500ms after the deadline, so actions
 * landing beyond deadline + grace are stale (the turn should have moved).
 * Callers reject them with TIME_UP instead of acting on a dead turn.
 */
export const TURN_GRACE_MS = 2000;

export function turnExpired(room: RoomState): boolean {
  return room.status === 'playing' && room.turnDeadline != null && Date.now() > room.turnDeadline + TURN_GRACE_MS;
}

/**
 * (Re)arm the auto-resolve timer for whoever is current.
 * Online players get the full TURN_MS; offline seats get a short fuse.
 */
export function armTurnTimer(room: RoomState) {
  clearTurnTimer(room.code);
  if (room.status !== 'playing') { room.turnDeadline = null; pokeBot(room); return; }
  if (allGone(room)) {
    // Nobody home: freeze the clock instead of self-playing. Auto-resolving
    // with zero observers advances turns nobody takes AND bumps lastActivity
    // on every resolve, which made abandoned tables immortal (hygiene's idle
    // TTL could never trip). The next rejoin/claim re-arms.
    room.turnDeadline = null;
    dlog({ evt: 'timer.freeze', code: room.code, turn: room.turnCount, msg: 'all-gone' });
    return;
  }
  if (room.auction) {
    // Hammer down: turns wait for the gavel. No clock, no timeout — bidding
    // runs without roll pressure, and resolveAuction() re-arms afterwards.
    room.turnDeadline = null;
    dlog({ evt: 'timer.freeze', code: room.code, turn: room.turnCount, msg: 'auction-live' });
    return;
  }
  const ms = current(room).connected ? TURN_MS : OFFLINE_TURN_MS;
  room.turnDeadline = Date.now() + ms;
  const token = room.turnCount;
  turnTimers.set(
    room.code,
    setTimeout(() => {
      turnTimers.delete(room.code);
      resolveTurnTimeout(room.code, token);
    }, ms + 500),
  );
  // Nudge server-driven seats: no-op unless the current seat is a live bot.
  pokeBot(room);
}

/**
 * Called when a turn timer fires. The turnCount token guards against stale
 * callbacks: if the turn already advanced naturally, this is a no-op.
 */
export function resolveTurnTimeout(code: string, turnCount: number) {
  turnTimers.delete(code);
  const room = rooms.get(code);
  if (!room || room.status !== 'playing' || room.turnCount !== turnCount) return;
  if (allGone(room)) {
    // Armed before the last seat left: freeze instead of self-playing (see
    // armTurnTimer). No emit — nothing changed that anyone can see, and
    // bumping lastActivity here is what kept dead tables alive.
    room.turnDeadline = null;
    return;
  }
  if (room.auction) {
    // Armed before the hammer fell: stand down. The clock stays frozen until
    // resolveAuction() re-arms it — timing out a turn mid-bid would steal a
    // decision window nobody could see coming.
    room.turnDeadline = null;
    return;
  }
  const me = current(room);
  // A timed-out holder can't be shaking anymore — clear the presence flag so
  // the TV doesn't wobble for a turn that's already gone. Rides on the emit
  // below; every path out of here emits exactly once.
  if (room.rollingId) clearRolling(room, room.rollingId);
  const t0 = Date.now();
  if (me.bankrupt) { advanceTurn(room); emit(room); dlog({ evt: 'timeout.resolve', code, turn: turnCount, seat: me.id, msg: 'bankrupt-skip', ms: Date.now() - t0 }); return; }
  if (!me.hasRolled && me.doubles === 0) {
    log(room, `⏰ ${me.name} ran out of time — auto-rolling`, 'bad', 'move');
    if (doRoll(room, me) === 'advance') { advanceTurn(room); emit(room); dlog({ evt: 'timeout.resolve', code, turn: turnCount, seat: me.id, msg: 'auto-roll-advance', ms: Date.now() - t0 }); return; }
    dlog({ evt: 'timeout.resolve', code, turn: turnCount, seat: me.id, msg: 'auto-roll', ms: Date.now() - t0 });
  }
  if (room.pendingBuy != null && current(room).id === me.id) {
    const tile = room.pendingBuy;
    room.pendingBuy = null;
    // Queue behind a live auction rather than replacing it (see auction.ts).
    const fate = queueOrOpenAuction(room, tile, me.id);
    if (fate === 'open') {
      log(room, `⏰ ${me.name} didn't decide — ${BOARD[tile].name} goes to auction`, 'info', 'purchase');
    } else if (fate === 'queued') {
      log(room, `⏰ ${me.name} didn't decide — ${BOARD[tile].name} queued for auction`, 'info', 'purchase');
    }
  }
  if (me.cash < 0) {
    log(room, `⏰ ${me.name} out of time and broke — bankrupt`, 'bad');
    bankruptPlayer(room, me);
    emit(room);
    dlog({ evt: 'timeout.resolve', code, turn: turnCount, seat: me.id, msg: 'bankrupt', ms: Date.now() - t0 });
    return;
  }
  advanceTurn(room);
  emit(room);
  dlog({ evt: 'timeout.resolve', code, turn: turnCount, seat: me.id, msg: 'advanced', ms: Date.now() - t0 });
}
