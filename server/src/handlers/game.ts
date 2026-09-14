import type { Socket } from 'socket.io';
import { MAX_PLAYERS, START_CASH } from '@monopoly/shared';
import { isKnownStyle } from '../themes.js';
import type { BoardStyle, Player } from '@monopoly/shared';
import { rooms, uid } from '../store.js';
import { clearAuctionTimer, scheduleAuctionResolve } from '../core/auction.js';
import { emit, log } from '../core/broadcast.js';
import { removeSeat } from '../core/bankruptcy.js';
import { current, uniqueName } from '../core/player.js';
import { genPin, requireControl } from '../core/seat.js';
import { armTurnTimer, clearTurnTimer } from '../core/timers.js';

/**
 * Game-control handlers: starting, pausing, kicking, bots, board style.
 * Host-only throughout. Registered alongside session.ts in index.ts.
 */
export function registerGameHandlers(socket: Socket) {
  socket.on('startGame', ({ code, playerId, key }: { code: string; playerId?: string; key?: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    // Only the host's controller can start/restart (previously anyone with
    // the room code could). Exception: a finished game may be dealt again
    // by any live seat, so a bankrupt host can never deadlock rematch.
    const me = playerId !== undefined ? requireControl(room, playerId, key) : null;
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (room.status !== 'finished' && !me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.players.length < 2) return cb?.({ ok: false, error: 'NEED_2' });
    // shuffle turn order
    room.players.sort(() => Math.random() - 0.5);
    room.players.forEach((p) => {
      p.cash = START_CASH; p.position = 0; p.properties = []; p.mortgaged = [];
      p.inJail = false; p.jailTurns = 0; p.jailCards = 0; p.bankrupt = false; p.hasRolled = false;
      // Stale doubles would carry into the new game: a player who ended last
      // game on doubles could be jailed for "3 doubles" after a single double.
      p.doubles = 0;
    });
    room.status = 'playing'; room.turnIndex = 0; room.turnCount = 1;
    room.dice = [1, 1]; room.lastRoll = null; room.lastCard = null; room.pendingBuy = null; room.winnerId = null;
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
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.status !== 'playing') return cb?.({ ok: false });
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
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.status !== 'paused') return cb?.({ ok: false });
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

  socket.on('kickPlayer', ({ code, playerId, key, targetId }: {
    code: string; playerId: string; key: unknown; targetId: string;
  }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    const target = room.players.find((p) => p.id === targetId);
    if (!target || target.id === me.id || target.bankrupt) return cb?.({ ok: false, error: 'BAD_SEAT' });
    removeSeat(room, target);
    log(room, `${me.name} (host) removed ${target.name} -- deeds go to bank auction`, 'bad');
    cb?.({ ok: true });
    emit(room);
  });

  // Host adds a server-driven seat. Allowed in lobby and mid-game (like a
  // late joiner); removal reuses kickPlayer. Bots hold no key, so they can
  // never be controlled or claimed — only kicked.
  socket.on('addBot', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (room.status === 'finished') return cb?.({ ok: false, error: 'GAME_OVER' });
    if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: 'ROOM_FULL' });
    const botNames = ['Beep', 'Boop', 'Chip', 'Byte', 'Pixel', 'Dot', 'Gizmo', 'Volt'];
    const base = botNames[room.players.filter((p) => p.isBot).length % botNames.length];
    const bot: Player = {
      id: uid('p'), name: uniqueName(room.players, base), token: 'robot',
      cash: START_CASH, position: 0, properties: [], mortgaged: [],
      inJail: false, jailTurns: 0, jailCards: 0, doubles: 0, bankrupt: false,
      connected: true, isHost: false, isBot: true, hasRolled: false,
      seatPin: genPin(), controllerLabel: '🤖',
    };
    room.players.push(bot);
    log(room, `🤖 ${bot.name} joined the table (${room.players.length}/${MAX_PLAYERS})`, 'good');
    // Bot acts only on its turn (pokeBot via timers), so no arm needed here —
    // but a mid-game add while it's somehow current is impossible (appended
    // last), so just broadcast.
    cb?.({ ok: true, playerId: bot.id, room });
    emit(room);
  });

  socket.on('setBoardStyle', ({ code, playerId, key, style }: {
    code: string; playerId: string; key: unknown; style: unknown;
  }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
    if (typeof style !== 'string' || !isKnownStyle(style)) return cb?.({ ok: false, error: 'BAD_STYLE' });
    room.boardStyle = style as BoardStyle;
    log(room, `${me.name} (host) switched the board to ${style}`, 'info');
    cb?.({ ok: true });
    emit(room);
  });
}
