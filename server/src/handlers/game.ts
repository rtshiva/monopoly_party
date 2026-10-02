import type { Socket } from 'socket.io';
import { netWorth } from '@monopoly/shared';
import { isKnownStyle } from '../themes.js';
import type { BoardStyle } from '@monopoly/shared';
import { rooms } from '../store.js';
import { clearAuctionTimer, scheduleAuctionResolve } from '../core/auction.js';
import { emit, log } from '../core/broadcast.js';
import { current, resetPlayer } from '../core/player.js';
import { requireControl } from '../core/seat.js';
import { armTurnTimer, clearTurnTimer } from '../core/timers.js';

/**
 * Game-control handlers: starting, pausing, resuming, ending, board style.
 * Host-only throughout. Table composition (kick/addBot) lives in roster.ts.
 * Registered alongside session.ts in index.ts.
 */
export function registerGameHandlers(socket: Socket) {
  socket.on('startGame', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    // Only the host's controller can start/restart (previously anyone with
    // the room code could). Exception: a finished game may be dealt again
    // by any live seat, so a bankrupt host can never deadlock rematch.
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.status !== 'finished' && !me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.players.length < 2) return cb?.({ ok: false, error: 'NEED_2' });
    // shuffle turn order
    room.players.sort(() => Math.random() - 0.5);
    room.players.forEach((p) => resetPlayer(p));
    room.status = 'playing';
    room.turnIndex = 0;
    room.turnCount = 1;
    room.dice = [1, 1];
    room.lastRoll = null;
    room.lastCard = null;
    room.pendingBuy = null;
    room.winnerId = null;
    room.trades = [];
    clearAuctionTimer(code);
    room.auction = null;
    room.auctionQueue = [];
    room.buildings = {};
    room.pausedAt = null;
    log(room, `Game started! ${current(room).name} goes first.`, 'good');
    armTurnTimer(room);
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('pauseGame', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.status !== 'playing') return cb?.({ ok: false, error: 'GAME_OVER' });
    room.status = 'paused';
    room.pausedAt = Date.now();
    room.turnDeadline = null;
    clearTurnTimer(room.code);
    clearAuctionTimer(room.code);
    log(room, `${me.name} (host) paused the game`, 'info');
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('resumeGame', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.status !== 'paused') return cb?.({ ok: false, error: 'GAME_OVER' });
    const pausedFor = Date.now() - (room.pausedAt ?? Date.now());
    room.pausedAt = null;
    room.status = 'playing';
    if (room.auction) {
      room.auction.endsAt += pausedFor; // the auction clock freezes during pause
      scheduleAuctionResolve(room.code, room.auction.id);
    }
    armTurnTimer(room);
    log(room, `${me.name} (host) resumed the game`, 'good');
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('endGame', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.status !== 'playing' && room.status !== 'paused') return cb?.({ ok: false, error: 'GAME_OVER' });

    // Determine winner based on total net worth among non-bankrupt players
    const active = room.players.filter((p) => !p.bankrupt);
    if (active.length === 0) return cb?.({ ok: false, error: 'GAME_OVER' });

    active.sort((a, b) => netWorth(b, room) - netWorth(a, room));
    const winner = active[0];
    if (!winner) return cb?.({ ok: false, error: 'GAME_OVER' });

    clearTurnTimer(room.code);
    clearAuctionTimer(room.code);
    room.turnDeadline = null;
    room.auction = null;
    room.trades = [];
    room.status = 'finished';
    room.winnerId = winner.id;

    log(
      room,
      `🏁 Game ended early by host! 🏆 ${winner.name} wins with $${netWorth(winner, room)} total assets!`,
      'good',
    );
    cb?.({ ok: true });
    emit(room);
  });

  socket.on(
    'setBoardStyle',
    (
      {
        code,
        playerId,
        key,
        style,
      }: {
        code: string;
        playerId: string;
        key: unknown;
        style: unknown;
      },
      cb,
    ) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
      if (typeof style !== 'string' || !isKnownStyle(style)) return cb?.({ ok: false, error: 'BAD_STYLE' });
      room.boardStyle = style as BoardStyle;
      log(room, `${me.name} (host) switched the board to ${style}`, 'info');
      cb?.({ ok: true });
      emit(room);
    },
  );
}
