import type { Socket } from 'socket.io';
import { BOARD } from '@monopoly/shared';
import { ownerOf } from '@monopoly/shared';
import { JAIL_FINE } from '@monopoly/shared';
import { rooms } from '../store.js';
import { advanceTurn, current, doRoll, emit, isBuyable, log, openAuction, requireControl } from '../helpers.js';

export function registerTurnHandlers(socket: Socket) {
  socket.on('rollDice', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    const cp = current(room);
    if (!me || me.id !== cp.id || me.bankrupt) return cb?.({ ok: false, error: 'NOT_YOUR_TURN' });
    if (me.hasRolled && me.doubles === 0) return cb?.({ ok: false, error: 'ALREADY_ROLLED' });

    const r = doRoll(room, me);
    if (r === 'advance') {
      // 3rd double: turn passes after a beat so the board shows the jail walk.
      cb?.({ ok: true, dice: room.dice });
      setTimeout(() => { advanceTurn(room); emit(room); }, 600);
      emit(room);
      return;
    }
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
    if (ownerOf(room, idx)) return cb?.({ ok: false, error: 'ALREADY_OWNED' });
    const tile = BOARD[idx] as { price: number; name: string };
    if (me.cash < tile.price) return cb?.({ ok: false, error: 'NO_CASH' });
    me.cash -= tile.price;
    me.properties.push(idx);
    room.pendingBuy = null;
    log(room, `✅ ${me.name} bought ${tile.name} for $${tile.price}`, 'good');
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
    const tile = room.pendingBuy;
    room.pendingBuy = null;
    // Passing opens a 30s background auction instead of killing the deed.
    if (!openAuction(room, tile, me.id)) {
      log(room, `⏭️ ${me.name} passed on the property`, 'info');
    }
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
    if (room.pendingBuy != null) room.pendingBuy = null;
    if (me.cash < 0) return cb?.({ ok: false, error: 'NEGATIVE' });
    advanceTurn(room);
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('payJail', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me || !me.inJail) return cb?.({ ok: false });
    if (me.cash < JAIL_FINE) return cb?.({ ok: false, error: 'NO_CASH' });
    me.cash -= JAIL_FINE; me.inJail = false; me.jailTurns = 0;
    log(room, `🔓 ${me.name} paid $${JAIL_FINE} to leave jail`, 'good');
    cb?.({ ok: true });
    emit(room);
  });
}
