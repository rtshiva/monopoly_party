import type { Socket } from 'socket.io';
import { BOARD, MAX_BID, MIN_BID } from '@monopoly/shared';
import { rooms } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { requireControl } from '../core/seat.js';
import { resolveAuction } from '../core/auction.js';

export function registerAuctionHandlers(socket: Socket) {
  socket.on(
    'auctionBid',
    ({ code, playerId, key, amount }: { code: string; playerId: string; key: unknown; amount: unknown }, cb) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!Number.isFinite(me.cash)) return cb?.({ ok: false, error: 'NO_CASH' });
      const auction = room.auction;
      if (!auction || Date.now() >= auction.endsAt) {
        if (auction) resolveAuction(code, auction.id);
        return cb?.({ ok: false, error: 'NO_AUCTION' });
      }
      if (room.status !== 'playing') return cb?.({ ok: false, error: 'NO_AUCTION' });
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < MIN_BID)
        return cb?.({ ok: false, error: 'BID_TOO_LOW' });
      if (amount > MAX_BID) return cb?.({ ok: false, error: 'BID_TOO_HIGH' });
      const highest = auction.bids.reduce((m, b) => Math.max(m, b.amount), 0);
      if (amount <= highest) return cb?.({ ok: false, error: 'BID_TOO_LOW' });
      if (me.cash < amount) return cb?.({ ok: false, error: 'NO_CASH' });
      const mine = auction.bids.find((b) => b.playerId === me.id);
      if (mine) {
        mine.amount = amount;
        mine.at = Date.now();
      } else auction.bids.push({ playerId: me.id, amount, at: Date.now() });
      log(room, `💰 ${me.name} bids $${amount} on ${BOARD[auction.tile]?.name ?? `Tile ${auction.tile}`}`, 'money');
      cb?.({ ok: true });
      emit(room);
    },
  );
}
