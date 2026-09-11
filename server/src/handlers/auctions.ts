import type { Socket } from 'socket.io';
import { BOARD } from '@monopoly/shared';
import { MIN_BID } from '@monopoly/shared';
import { rooms } from '../store.js';
import { emit, log, resolveAuction } from '../helpers.js';

export function registerAuctionHandlers(socket: Socket) {
  socket.on('auctionBid', ({ code, playerId, amount }: { code: string; playerId: string; amount: unknown }, cb) => {
    const room = rooms.get(code);
    const me = room?.players.find((p) => p.id === playerId);
    if (!room || !me) return cb?.({ ok: false });
    const auction = room.auction;
    if (!auction || Date.now() >= auction.endsAt) {
      if (auction) resolveAuction(code, auction.id);
      return cb?.({ ok: false, error: 'NO_AUCTION' });
    }
    if (room.status !== 'playing' || me.bankrupt) return cb?.({ ok: false, error: 'NO_AUCTION' });
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < MIN_BID) return cb?.({ ok: false, error: 'BID_TOO_LOW' });
    const highest = auction.bids.reduce((m, b) => Math.max(m, b.amount), 0);
    if (amount <= highest) return cb?.({ ok: false, error: 'BID_TOO_LOW' });
    if (me.cash < amount) return cb?.({ ok: false, error: 'NO_CASH' });
    const mine = auction.bids.find((b) => b.playerId === me.id);
    if (mine) { mine.amount = amount; mine.at = Date.now(); }
    else auction.bids.push({ playerId: me.id, amount, at: Date.now() });
    log(room, `💰 ${me.name} bids $${amount} on ${BOARD[auction.tile].name}`, 'money');
    cb?.({ ok: true });
    emit(room);
  });
}
