import type { Socket } from 'socket.io';
import { BOARD } from '@monopoly/shared';
import { rooms } from '../store.js';
import { bankruptPlayer, colorSetTiles, emit, isBuyable, isTileLocked, log, requireControl } from '../helpers.js';

export function registerEconomyHandlers(socket: Socket) {
  socket.on('mortgage', ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!Number.isInteger(tile) || !isBuyable(tile)) return cb?.({ ok: false, error: 'BAD_TILE' });
    if (!me.properties.includes(tile)) return cb?.({ ok: false });
    if ((room.buildings[tile] ?? 0) > 0) return cb?.({ ok: false, error: 'HAS_HOUSES' });
    if (isTileLocked(room, tile)) return cb?.({ ok: false, error: 'TILE_LOCKED' });
    const t = BOARD[tile] as { price: number; name: string };
    if (!t || typeof t.price !== 'number') return cb?.({ ok: false, error: 'BAD_TILE' });
    if (me.mortgaged.includes(tile)) {
      const fee = Math.round(t.price * 0.6);
      if (me.cash < fee) return cb?.({ ok: false, error: 'NO_CASH' });
      me.cash -= fee;
      me.mortgaged = me.mortgaged.filter((x) => x !== tile);
      log(room, `🏦 ${me.name} unmortgaged ${t.name} (−$${fee})`, 'info');
    } else {
      me.cash += Math.round(t.price / 2);
      me.mortgaged.push(tile);
      log(room, `🏦 ${me.name} mortgaged ${t.name} (+$${Math.round(t.price / 2)})`, 'money');
    }
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('bankrupt', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    bankruptPlayer(room, me);
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('useJailCard', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.status !== 'playing' || me.bankrupt) return cb?.({ ok: false });
    if (!me.inJail || me.jailCards <= 0) return cb?.({ ok: false, error: 'NO_CARD' });
    me.jailCards--;
    me.inJail = false;
    me.jailTurns = 0;
    log(room, `🃏 ${me.name} played a Get-Out-of-Jail-Free card`, 'good');
    cb?.({ ok: true, cards: me.jailCards });
    emit(room);
  });

  socket.on('buyHouse', ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.status !== 'playing' || me.bankrupt) return cb?.({ ok: false });
    const t = BOARD[tile];
    if (!t || t.kind !== 'property') return cb?.({ ok: false, error: 'BAD_TILE' });
    if (!me.properties.includes(tile) || me.mortgaged.includes(tile)) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
    const set = colorSetTiles(tile);
    if (!set.every((i) => me.properties.includes(i))) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
    if (set.some((i) => me.mortgaged.includes(i))) return cb?.({ ok: false, error: 'MORTGAGED' });
    const level = room.buildings[tile] ?? 0;
    if (level >= 5) return cb?.({ ok: false, error: 'MAX_HOUSES' });
    // Even build: only build on a tile tied for the lowest level in its set.
    const min = Math.min(...set.map((i) => room.buildings[i] ?? 0));
    if (level > min) return cb?.({ ok: false, error: 'EVEN_BUILD' });
    if (me.cash < t.houseCost) return cb?.({ ok: false, error: 'NO_CASH' });
    me.cash -= t.houseCost;
    room.buildings[tile] = level + 1;
    log(room, `🏠 ${me.name} built ${level + 1 === 5 ? 'a HOTEL' : `house #${level + 1}`} on ${t.name} ($${t.houseCost})`, 'good');
    cb?.({ ok: true, level: level + 1 });
    emit(room);
  });

  socket.on('sellHouse', ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.status !== 'playing' || me.bankrupt) return cb?.({ ok: false });
    const t = BOARD[tile];
    if (!t || t.kind !== 'property') return cb?.({ ok: false, error: 'BAD_TILE' });
    if (!me.properties.includes(tile)) return cb?.({ ok: false });
    const level = room.buildings[tile] ?? 0;
    if (level <= 0) return cb?.({ ok: false, error: 'BAD_TILE' });
    // Even sell: only sell from a tile tied for the highest level in its set.
    const set = colorSetTiles(tile);
    const max = Math.max(...set.map((i) => room.buildings[i] ?? 0));
    if (level < max) return cb?.({ ok: false, error: 'EVEN_BUILD' });
    const refund = Math.floor(t.houseCost / 2);
    if (level === 1) delete room.buildings[tile];
    else room.buildings[tile] = level - 1;
    me.cash += refund;
    log(room, `🏠 ${me.name} sold a house on ${t.name} (+$${refund})`, 'money');
    cb?.({ ok: true, level: level - 1 });
    emit(room);
  });
}
