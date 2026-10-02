import type { Socket } from 'socket.io';
import { BOARD, unmortgageFee } from '@monopoly/shared';
import { rooms } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { bankruptPlayer } from '../core/bankruptcy.js';
import { current } from '../core/player.js';
import { requireControl } from '../core/seat.js';
import { colorSetTiles, isBuyable, isTileLocked } from '../core/trade.js';
import { applyBuildHouse, applyMortgage, applySellHouse, applyUnmortgage } from '../core/deeds.js';
import { sellSetEvenly, setBuildingsTotal, setHasBuildings } from '../core/houses.js';

export function registerEconomyHandlers(socket: Socket) {
  socket.on(
    'mortgage',
    ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!Number.isFinite(me.cash)) return cb?.({ ok: false, error: 'NO_CASH' });
      // Pause freezes the whole table — same guard as buyHouse/sellHouse.
      if (!Number.isInteger(tile) || !isBuyable(tile)) return cb?.({ ok: false, error: 'BAD_TILE' });
      if (!me.properties.includes(tile)) return cb?.({ ok: false, error: 'BAD_TILE' });
      // Strict: any building anywhere in the set blocks mortgaging any deed
      // in that set — sell the set off evenly first.
      if (setHasBuildings(room, tile)) return cb?.({ ok: false, error: 'HAS_HOUSES' });
      if (isTileLocked(room, tile)) return cb?.({ ok: false, error: 'TILE_LOCKED' });
      const t = BOARD[tile] as { price: number; name: string };
      if (!t || typeof t.price !== 'number') return cb?.({ ok: false, error: 'BAD_TILE' });
      if (me.mortgaged.includes(tile)) {
        const fee = unmortgageFee(t.price);
        if (me.cash < fee) return cb?.({ ok: false, error: 'NO_CASH' });
        applyUnmortgage(room, me, tile);
        log(room, `🏦 ${me.name} unmortgaged ${t.name} (−$${fee})`, 'info', 'money');
      } else {
        const payout = applyMortgage(room, me, tile);
        log(room, `🏦 ${me.name} mortgaged ${t.name} (+$${payout})`, 'money', 'money');
      }
      cb?.({ ok: true });
      emit(room);
    },
  );

  socket.on('bankrupt', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    // Pause freezes the whole table: a mid-pause bankruptcy would strand
    // deeds in the auction queue (it only drains on playing-paths).
    bankruptPlayer(room, me);
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('useJailCard', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.inJail || me.jailCards <= 0) return cb?.({ ok: false, error: 'NO_CARD' });
    // Cards are played on your own turn: freeing yourself mid-round would
    // skip the jail-roll risk everyone else takes. Checked after NO_CARD so
    // cardless off-turn taps keep their existing error.
    if (current(room).id !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_TURN' });
    me.jailCards--;
    me.inJail = false;
    me.jailTurns = 0;
    log(room, `🃏 ${me.name} played a Get-Out-of-Jail-Free card`, 'good');
    cb?.({ ok: true, cards: me.jailCards });
    emit(room);
  });

  socket.on(
    'buyHouse',
    ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!Number.isFinite(me.cash)) return cb?.({ ok: false, error: 'NO_CASH' });
      const t = BOARD[tile];
      if (!Number.isInteger(tile) || !t || t.kind !== 'property') return cb?.({ ok: false, error: 'BAD_TILE' });
      if (!me.properties.includes(tile)) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
      if (me.mortgaged.includes(tile)) return cb?.({ ok: false, error: 'MORTGAGED' });
      const set = colorSetTiles(tile);
      if (!set.every((i) => me.properties.includes(i))) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
      if (set.some((i) => me.mortgaged.includes(i))) return cb?.({ ok: false, error: 'MORTGAGED' });
      const level = room.buildings[tile] ?? 0;
      if (level >= 5) return cb?.({ ok: false, error: 'MAX_HOUSES' });
      // Even build: only build on a tile tied for the lowest level in its set.
      const min = Math.min(...set.map((i) => room.buildings[i] ?? 0));
      if (level > min) return cb?.({ ok: false, error: 'EVEN_BUILD' });
      if (me.cash < t.houseCost) return cb?.({ ok: false, error: 'NO_CASH' });
      const built = applyBuildHouse(room, me, tile);
      log(
        room,
        `🏠 ${me.name} built ${built.level === 5 ? 'a HOTEL' : `house #${built.level}`} on ${t.name} ($${built.cost})`,
        'good',
        'build',
      );
      cb?.({ ok: true, level: built.level });
      emit(room);
    },
  );

  socket.on(
    'sellHouse',
    ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!Number.isFinite(me.cash)) return cb?.({ ok: false, error: 'NO_CASH' });
      const t = BOARD[tile];
      if (!Number.isInteger(tile) || !t || t.kind !== 'property') return cb?.({ ok: false, error: 'BAD_TILE' });
      if (!me.properties.includes(tile)) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
      const set = colorSetTiles(tile);
      if (!set.every((i) => me.properties.includes(i))) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
      const level = room.buildings[tile] ?? 0;
      if (!Number.isInteger(level) || level <= 0) return cb?.({ ok: false, error: 'BAD_TILE' });
      // Even sell: only sell from a tile tied for the highest level in its set.
      const max = Math.max(...set.map((i) => room.buildings[i] ?? 0));
      if (level < max) return cb?.({ ok: false, error: 'EVEN_BUILD' });
      const sold = applySellHouse(room, me, tile);
      log(room, `🏠 ${me.name} sold a house on ${t.name} (+$${sold.refund})`, 'money', 'build');
      cb?.({ ok: true, level: sold.level });
      emit(room);
    },
  );

  socket.on(
    'sellAllHouses',
    ({ code, playerId, key, tile }: { code: string; playerId: string; key: unknown; tile: number }, cb) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!Number.isFinite(me.cash)) return cb?.({ ok: false, error: 'NO_CASH' });
      const t = BOARD[tile];
      if (!Number.isInteger(tile) || !t || t.kind !== 'property') return cb?.({ ok: false, error: 'BAD_TILE' });
      if (!me.properties.includes(tile)) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
      const total = setBuildingsTotal(room, tile);
      if (total <= 0) return cb?.({ ok: false, error: 'BAD_TILE' });
      const set = colorSetTiles(tile);
      if (!set.every((i) => me.properties.includes(i))) return cb?.({ ok: false, error: 'NOT_FULL_SET' });
      const { sold, refund } = sellSetEvenly(room, me, tile);
      if (sold <= 0) return cb?.({ ok: false, error: 'BAD_TILE' });
      log(
        room,
        `🏠 ${me.name} sold ${sold} house${sold === 1 ? '' : 's'} across the set (+$${refund})`,
        'money',
        'build',
      );
      cb?.({ ok: true, sold, refund });
      emit(room);
    },
  );
}
