import type { Socket } from 'socket.io';
import { MAX_TRADES, TRADE_EXPIRY_MS } from '@monopoly/shared';
import type { TradeOffer } from '@monopoly/shared';
import { rooms, uid } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { requireControl } from '../core/seat.js';
import {
  applyTradeSwap,
  describeTrade,
  isTileLocked,
  normCards,
  normCash,
  normTiles,
  pruneTrades,
} from '../core/trade.js';
import { setHasBuildings } from '../core/houses.js';

export function registerTradeHandlers(socket: Socket) {
  socket.on(
    'tradeOffer',
    (
      {
        code,
        playerId,
        key,
        to,
        giveTiles,
        giveCash,
        giveCards,
        wantTiles,
        wantCash,
        wantCards,
      }: {
        code: string;
        playerId: string;
        key: unknown;
        to: string;
        giveTiles: unknown;
        giveCash: unknown;
        giveCards: unknown;
        wantTiles: unknown;
        wantCash: unknown;
        wantCards: unknown;
      },
      cb,
    ) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!Number.isFinite(me.cash)) return cb?.({ ok: false, error: 'NO_CASH' });
      if (room.status !== 'playing') return cb?.({ ok: false, error: 'BAD_TRADE' });
      pruneTrades(room);
      const target = room.players.find((p) => p.id === to);
      if (!target || target.id === me.id || target.bankrupt || me.bankrupt)
        return cb?.({ ok: false, error: 'BAD_TRADE' });
      if (target.isBot) return cb?.({ ok: false, error: 'BAD_TRADE' }); // bots don't negotiate
      const gT = normTiles(giveTiles);
      const wT = normTiles(wantTiles);
      const gC = normCash(giveCash);
      const wC = normCash(wantCash);
      const gK = normCards(giveCards);
      const wK = normCards(wantCards);
      if (gT === null || wT === null || gC === null || wC === null || gK === null || wK === null)
        return cb?.({ ok: false, error: 'BAD_TRADE' });
      if (gT.length === 0 && wT.length === 0 && gC === 0 && wC === 0 && gK === 0 && wK === 0)
        return cb?.({ ok: false, error: 'BAD_TRADE' });
      if (new Set([...gT, ...wT]).size !== gT.length + wT.length) return cb?.({ ok: false, error: 'BAD_TRADE' });
      for (const t of gT) {
        // Strict official rule: any building anywhere in the color set locks
        // every deed in that set — sell the whole set off evenly first.
        if (setHasBuildings(room, t)) return cb?.({ ok: false, error: 'HAS_HOUSES' });
        if (!me.properties.includes(t) || me.mortgaged.includes(t) || isTileLocked(room, t))
          return cb?.({ ok: false, error: 'TILE_LOCKED' });
      }
      for (const t of wT) {
        if (setHasBuildings(room, t)) return cb?.({ ok: false, error: 'HAS_HOUSES' });
        if (!target.properties.includes(t) || target.mortgaged.includes(t) || isTileLocked(room, t))
          return cb?.({ ok: false, error: 'TILE_LOCKED' });
      }
      if (me.cash < gC || target.cash < wC) return cb?.({ ok: false, error: 'NO_CASH' });
      if (me.jailCards < gK || target.jailCards < wK) return cb?.({ ok: false, error: 'NO_CARDS' });
      if (room.trades.length >= MAX_TRADES) return cb?.({ ok: false, error: 'BAD_TRADE' });
      const offer: TradeOffer = {
        id: uid('t'),
        fromId: me.id,
        toId: target.id,
        giveTiles: gT,
        giveCash: gC,
        giveCards: gK,
        wantTiles: wT,
        wantCash: wC,
        wantCards: wK,
        createdAt: Date.now(),
        expiresAt: Date.now() + TRADE_EXPIRY_MS,
      };
      room.trades.push(offer);
      log(room, `🤝 ${me.name} offered ${describeTrade(offer)} to ${target.name} (60s)`, 'info', 'trade');
      cb?.({ ok: true, tradeId: offer.id });
      emit(room);
    },
  );

  socket.on(
    'tradeRespond',
    (
      {
        code,
        playerId,
        key,
        tradeId,
        accept,
      }: {
        code: string;
        playerId: string;
        key: unknown;
        tradeId: string;
        accept: boolean;
      },
      cb,
    ) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      pruneTrades(room);
      const idx = room.trades.findIndex((t) => t.id === tradeId);
      if (idx === -1) return cb?.({ ok: false, error: 'NO_OFFER' });
      const offer = room.trades[idx];
      if (!offer) return cb?.({ ok: false, error: 'NO_OFFER' });
      if (offer.toId !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_OFFER' });
      const from = room.players.find((p) => p.id === offer.fromId);
      // Small-refactor: single reject path replaces 6x splice+cb+emit blocks.
      const reject = (error: 'NO_OFFER' | 'HAS_HOUSES' | 'TILE_LOCKED' | 'NO_CASH' | 'NO_CARDS', msg?: string) => {
        room.trades.splice(idx, 1);
        if (msg) log(room, msg, 'bad', 'trade');
        cb?.({ ok: false, error });
        emit(room);
      };
      if (!from || from.bankrupt || from.isBot || me.isBot || room.status !== 'playing') {
        reject('NO_OFFER');
        return;
      }
      if (!Number.isFinite(from.cash) || !Number.isFinite(me.cash)) {
        reject('NO_OFFER', `⌛ Trade ${from.name} ↔ ${me.name} fell through (corrupt cash)`);
        return;
      }
      if (!accept) {
        room.trades.splice(idx, 1);
        log(room, `🚫 ${me.name} declined ${from.name}'s trade`, 'info', 'trade');
        cb?.({ ok: true });
        emit(room);
        return;
      }
      // Re-validate everything at accept time (cash/ownership may have changed).
      for (const t of offer.giveTiles) {
        if (setHasBuildings(room, t)) {
          reject('HAS_HOUSES');
          return;
        }
        if (!from.properties.includes(t) || from.mortgaged.includes(t) || isTileLocked(room, t, offer.id)) {
          reject('TILE_LOCKED', `⌛ Trade ${from.name} ↔ ${me.name} fell through (property moved)`);
          return;
        }
      }
      for (const t of offer.wantTiles) {
        if (setHasBuildings(room, t)) {
          reject('HAS_HOUSES');
          return;
        }
        if (!me.properties.includes(t) || me.mortgaged.includes(t) || isTileLocked(room, t, offer.id)) {
          reject('TILE_LOCKED', `⌛ Trade ${from.name} ↔ ${me.name} fell through (property moved)`);
          return;
        }
      }
      if (from.cash < offer.giveCash || me.cash < offer.wantCash) {
        reject('NO_CASH', `⌛ Trade ${from.name} ↔ ${me.name} fell through (insufficient funds)`);
        return;
      }
      if (from.jailCards < (offer.giveCards ?? 0) || me.jailCards < (offer.wantCards ?? 0)) {
        reject('NO_CARDS', `⌛ Trade ${from.name} ↔ ${me.name} fell through (card spent elsewhere)`);
        return;
      }
      // Atomic swap.
      applyTradeSwap(from, me, offer);
      room.trades.splice(idx, 1);
      log(room, `✅ ${from.name} ↔ ${me.name} traded: ${describeTrade(offer)}`, 'good', 'trade');
      cb?.({ ok: true });
      emit(room);
    },
  );

  socket.on(
    'tradeCancel',
    (
      {
        code,
        playerId,
        key,
        tradeId,
      }: {
        code: string;
        playerId: string;
        key: unknown;
        tradeId: string;
      },
      cb,
    ) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      const idx = room.trades.findIndex((t) => t.id === tradeId);
      if (idx === -1) return cb?.({ ok: false, error: 'NO_OFFER' });
      const target = room.trades[idx];
      if (!target || target.fromId !== me.id) return cb?.({ ok: false, error: 'NOT_YOUR_OFFER' });
      room.trades.splice(idx, 1);
      log(room, `🚫 ${me.name} cancelled their trade offer`, 'info', 'trade');
      cb?.({ ok: true });
      emit(room);
    },
  );
}
