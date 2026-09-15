import type { Socket } from 'socket.io';
import { BOARD, JAIL_FINE, ownerOf } from '@monopoly/shared';
import { rooms } from '../store.js';
import { queueOrOpenAuction } from '../core/auction.js';
import { emit, log } from '../core/broadcast.js';
import { advanceTurn, current } from '../core/player.js';
import { clearRolling, setRolling } from '../core/rolling.js';
import { requireControl } from '../core/seat.js';
import { armTurnTimer, turnExpired } from '../core/timers.js';
import { isBuyable } from '../core/trade.js';
import { doRoll } from '../core/roll.js';

export function registerTurnHandlers(socket: Socket) {
  // Hold-to-roll presence: phone starts shaking → TV + other phones wobble.
  // Fire-and-forget from the client (debounced); validated like a real roll.
  socket.on('rollStart', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (current(room).id !== me.id || me.bankrupt) return cb?.({ ok: false, error: 'NOT_YOUR_TURN' });
    if (me.hasRolled && me.doubles === 0) return cb?.({ ok: false, error: 'ALREADY_ROLLED' });
    setRolling(room, me.id);
    cb?.({ ok: true });
  });

  socket.on('rollStop', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (clearRolling(room, me.id)) emit(room);
    cb?.({ ok: true });
  });

  socket.on('rollDice', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    const cp = current(room);
    if (me.id !== cp.id || me.bankrupt) return cb?.({ ok: false, error: 'NOT_YOUR_TURN' });
    // Hammer down: turns resume when the auction resolves (fresh clock then).
    if (room.auction) return cb?.({ ok: false, error: 'AUCTION_LIVE' });
    if (me.hasRolled && me.doubles === 0) return cb?.({ ok: false, error: 'ALREADY_ROLLED' });
    if (turnExpired(room)) return cb?.({ ok: false, error: 'TIME_UP' });

    const r = doRoll(room, me);
    // A committed roll ends any shaking presence from this seat.
    clearRolling(room, me.id);
    if (r === 'advance') {
      // 3rd double: turn passes after a beat so the board shows the jail walk.
      // Guarded by the turnCount token: if the turn timer already moved the
      // game on within those 600ms, this callback is a no-op instead of
      // advancing a second time (which would skip a player's turn).
      const tok = room.turnCount;
      cb?.({ ok: true, dice: room.dice });
      setTimeout(() => {
        if (rooms.get(code) !== room || room.status !== 'playing' || room.turnCount !== tok) return;
        advanceTurn(room); emit(room);
      }, 600);
      emit(room);
      return;
    }
    // A fresh 60s action window starts with every roll: without this, a roll
    // placed in the last seconds of the turn clock leaves no time for the
    // buy/pass decision (or an earned doubles bonus roll) before the timer
    // steals the turn.
    armTurnTimer(room);
    if (r === 'jailed') cb?.({ ok: true, jailed: true });
    else cb?.({ ok: true, dice: room.dice });
    emit(room);
  });

  socket.on('buyProperty', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.pendingBuy == null) return cb?.({ ok: false });
    if (room.status !== 'playing') return cb?.({ ok: false });
    if (current(room).id !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_TURN' });
    const idx = room.pendingBuy;
    if (!isBuyable(idx) || me.position !== idx) return cb?.({ ok: false, error: 'STALE_OFFER' });
    // A live auction for this deed (opened by an earlier pass) owns it until
    // resolve — buying underneath would double-sell on award.
    if (room.auction?.tile === idx) return cb?.({ ok: false, error: 'STALE_OFFER' });
    if (turnExpired(room)) return cb?.({ ok: false, error: 'TIME_UP' });
    if (ownerOf(room, idx)) return cb?.({ ok: false, error: 'ALREADY_OWNED' });
    const tile = BOARD[idx] as { price: number; name: string };
    if (me.cash < tile.price) return cb?.({ ok: false, error: 'NO_CASH' });
    me.cash -= tile.price;
    me.properties.push(idx);
    room.pendingBuy = null;
    if (me.doubles > 0 && !me.inJail) {
      me.hasRolled = false;
      log(room, `✨ Doubles! ${me.name} rolls again`, 'good', 'info');
    }
    log(room, `✅ ${me.name} bought ${tile.name} for $${tile.price}`, 'good', 'purchase');
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('passProperty', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.status !== 'playing') return cb?.({ ok: false });
    if (current(room).id !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_TURN' });
    if (room.pendingBuy == null) return cb?.({ ok: false, error: 'NOTHING_TO_PASS' });
    if (turnExpired(room)) return cb?.({ ok: false, error: 'TIME_UP' });
    const tile = room.pendingBuy;
    room.pendingBuy = null;
    if (me.doubles > 0 && !me.inJail) {
      me.hasRolled = false;
      log(room, `✨ Doubles! ${me.name} rolls again`, 'good', 'info');
    }
    // Passing queues behind a live auction instead of replacing it (which
    // used to destroy running bids and statisticians' deeds alike).
    const fate = queueOrOpenAuction(room, tile, me.id);
    if (fate === 'queued') {
      log(room, `⏳ ${me.name} passed — ${BOARD[tile].name} queued behind the live auction`, 'info');
    } else if (fate === 'dropped') {
      log(room, `⏭️ ${me.name} passed on the property`, 'info');
    }
    // 'open' already logged inside openAuction.
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('endTurn', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me || current(room).id !== me.id) return cb?.({ ok: false });
    if (room.status !== 'playing') return cb?.({ ok: false });
    if (!me.hasRolled) return cb?.({ ok: false, error: 'ROLL_FIRST' });
    // An undecided purchase must go through Buy or Pass (which auctions it) —
    // ending the turn must not silently return the deed to the bank.
    if (room.pendingBuy != null) return cb?.({ ok: false, error: 'PENDING_BUY' });
    if (me.cash < 0) return cb?.({ ok: false, error: 'NEGATIVE' });
    if (room.auction) return cb?.({ ok: false, error: 'AUCTION_LIVE' });
    if (turnExpired(room)) return cb?.({ ok: false, error: 'TIME_UP' });
    advanceTurn(room);
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('payJail', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me || !me.inJail) return cb?.({ ok: false });
    // Pause freezes the whole table — same guard as every sibling action.
    if (room.status !== 'playing') return cb?.({ ok: false });
    if (me.cash < JAIL_FINE) return cb?.({ ok: false, error: 'NO_CASH' });
    me.cash -= JAIL_FINE;
    me.inJail = false;
    me.jailTurns = 0;
    log(room, `🔓 ${me.name} paid $${JAIL_FINE} to leave jail`, 'good', 'money');
    cb?.({ ok: true });
    emit(room);
  });
}
