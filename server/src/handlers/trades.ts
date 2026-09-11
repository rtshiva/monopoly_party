import type { Socket } from 'socket.io';
import type { TradeOffer } from '@monopoly/shared';
import { rooms, uid } from '../store.js';
import { describeTrade, emit, isTileLocked, log, normCash, normTiles, pruneTrades } from '../helpers.js';

export function registerTradeHandlers(socket: Socket) {
  socket.on('tradeOffer', ({ code, playerId, to, giveTiles, giveCash, wantTiles, wantCash }: {
    code: string; playerId: string; to: string; giveTiles: unknown; giveCash: unknown; wantTiles: unknown; wantCash: unknown;
  }, cb) => {
    const room = rooms.get(code);
    const me = room?.players.find((p) => p.id === playerId);
    if (!room || !me) return cb?.({ ok: false });
    if (room.status !== 'playing') return cb?.({ ok: false, error: 'BAD_TRADE' });
    pruneTrades(room);
    const target = room.players.find((p) => p.id === to);
    if (!target || target.id === me.id || target.bankrupt || me.bankrupt) return cb?.({ ok: false, error: 'BAD_TRADE' });
    const gT = normTiles(giveTiles);
    const wT = normTiles(wantTiles);
    const gC = normCash(giveCash);
    const wC = normCash(wantCash);
    if (gT === null || wT === null || gC === null || wC === null) return cb?.({ ok: false, error: 'BAD_TRADE' });
    if (gT.length === 0 && wT.length === 0 && gC === 0 && wC === 0) return cb?.({ ok: false, error: 'BAD_TRADE' });
    if (new Set([...gT, ...wT]).size !== gT.length + wT.length) return cb?.({ ok: false, error: 'BAD_TRADE' });
    for (const t of gT) {
      if ((room.buildings[t] ?? 0) > 0) return cb?.({ ok: false, error: 'HAS_HOUSES' });
      if (!me.properties.includes(t) || me.mortgaged.includes(t) || isTileLocked(room, t)) return cb?.({ ok: false, error: 'TILE_LOCKED' });
    }
    for (const t of wT) {
      if ((room.buildings[t] ?? 0) > 0) return cb?.({ ok: false, error: 'HAS_HOUSES' });
      if (!target.properties.includes(t) || target.mortgaged.includes(t) || isTileLocked(room, t)) return cb?.({ ok: false, error: 'TILE_LOCKED' });
    }
    if (me.cash < gC || target.cash < wC) return cb?.({ ok: false, error: 'NO_CASH' });
    if (room.trades.length >= 10) return cb?.({ ok: false, error: 'BAD_TRADE' });
    const offer: TradeOffer = {
      id: uid('t'), fromId: me.id, toId: target.id,
      giveTiles: gT, giveCash: gC, wantTiles: wT, wantCash: wC,
      createdAt: Date.now(), expiresAt: Date.now() + 60000,
    };
    room.trades.push(offer);
    log(room, `🤝 ${me.name} offered ${describeTrade(offer)} to ${target.name} (60s)`, 'info');
    cb?.({ ok: true, tradeId: offer.id });
    emit(room);
  });

  socket.on('tradeRespond', ({ code, playerId, tradeId, accept }: {
    code: string; playerId: string; tradeId: string; accept: boolean;
  }, cb) => {
    const room = rooms.get(code);
    const me = room?.players.find((p) => p.id === playerId);
    if (!room || !me) return cb?.({ ok: false });
    pruneTrades(room);
    const idx = room.trades.findIndex((t) => t.id === tradeId);
    if (idx === -1) return cb?.({ ok: false, error: 'NO_OFFER' });
    const offer = room.trades[idx];
    if (offer.toId !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_OFFER' });
    const from = room.players.find((p) => p.id === offer.fromId);
    if (!from || from.bankrupt || me.bankrupt || room.status !== 'playing') {
      room.trades.splice(idx, 1);
      cb?.({ ok: false, error: 'NO_OFFER' });
      emit(room);
      return;
    }
    if (!accept) {
      room.trades.splice(idx, 1);
      log(room, `🚫 ${me.name} declined ${from.name}'s trade`, 'info');
      cb?.({ ok: true });
      emit(room);
      return;
    }
    // Re-validate everything at accept time (cash/ownership may have changed).
    for (const t of offer.giveTiles) {
      if ((room.buildings[t] ?? 0) > 0) {
        room.trades.splice(idx, 1);
        cb?.({ ok: false, error: 'HAS_HOUSES' });
        emit(room);
        return;
      }
      if (!from.properties.includes(t) || from.mortgaged.includes(t) || isTileLocked(room, t, offer.id)) {
        room.trades.splice(idx, 1);
        log(room, `⌛ Trade ${from.name} ↔ ${me.name} fell through (property moved)`, 'bad');
        cb?.({ ok: false, error: 'TILE_LOCKED' });
        emit(room);
        return;
      }
    }
    for (const t of offer.wantTiles) {
      if ((room.buildings[t] ?? 0) > 0) {
        room.trades.splice(idx, 1);
        cb?.({ ok: false, error: 'HAS_HOUSES' });
        emit(room);
        return;
      }
      if (!me.properties.includes(t) || me.mortgaged.includes(t) || isTileLocked(room, t, offer.id)) {
        room.trades.splice(idx, 1);
        log(room, `⌛ Trade ${from.name} ↔ ${me.name} fell through (property moved)`, 'bad');
        cb?.({ ok: false, error: 'TILE_LOCKED' });
        emit(room);
        return;
      }
    }
    if (from.cash < offer.giveCash || me.cash < offer.wantCash) {
      room.trades.splice(idx, 1);
      log(room, `⌛ Trade ${from.name} ↔ ${me.name} fell through (insufficient funds)`, 'bad');
      cb?.({ ok: false, error: 'NO_CASH' });
      emit(room);
      return;
    }
    // Atomic swap.
    from.properties = from.properties.filter((t) => !offer.giveTiles.includes(t));
    me.properties = me.properties.filter((t) => !offer.wantTiles.includes(t));
    from.properties.push(...offer.wantTiles);
    me.properties.push(...offer.giveTiles);
    from.cash += offer.wantCash - offer.giveCash;
    me.cash += offer.giveCash - offer.wantCash;
    room.trades.splice(idx, 1);
    log(room, `✅ ${from.name} ↔ ${me.name} traded: ${describeTrade(offer)}`, 'good');
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('tradeCancel', ({ code, playerId, tradeId }: {
    code: string; playerId: string; tradeId: string;
  }, cb) => {
    const room = rooms.get(code);
    const me = room?.players.find((p) => p.id === playerId);
    if (!room || !me) return cb?.({ ok: false });
    const idx = room.trades.findIndex((t) => t.id === tradeId);
    if (idx === -1) return cb?.({ ok: false, error: 'NO_OFFER' });
    if (room.trades[idx].fromId !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_OFFER' });
    room.trades.splice(idx, 1);
    log(room, `🚫 ${me.name} cancelled their trade offer`, 'info');
    cb?.({ ok: true });
    emit(room);
  });
}
