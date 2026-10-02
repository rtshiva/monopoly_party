import type { Socket } from 'socket.io';
import { MAX_PLAYERS } from '@monopoly/shared';
import { rooms } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { removeSeat } from '../core/bankruptcy.js';
import { makePlayer } from '../core/player.js';
import { requireControl } from '../core/seat.js';

/**
 * Roster handlers: host-only table composition (kicking seats, adding bots).
 * Game flow control (start/pause/resume/end, board style) lives in game.ts.
 * Registered alongside the other handlers in index.ts.
 */
export function registerRosterHandlers(socket: Socket) {
  socket.on(
    'kickPlayer',
    (
      {
        code,
        playerId,
        key,
        targetId,
      }: {
        code: string;
        playerId: string;
        key: unknown;
        targetId: string;
      },
      cb,
    ) => {
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      const me = requireControl(room, playerId, key);
      if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
      if (!me.isHost) return cb?.({ ok: false, error: 'NOT_HOST' });
      const target = room.players.find((p) => p.id === targetId);
      if (!target || target.id === me.id || target.bankrupt) return cb?.({ ok: false, error: 'BAD_SEAT' });
      removeSeat(room, target);
      log(room, `${me.name} (host) removed ${target.name} -- deeds go to bank auction`, 'bad');
      cb?.({ ok: true });
      emit(room);
    },
  );

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
    const base = botNames[room.players.filter((p) => p.isBot).length % botNames.length] ?? 'Beep';
    const bot = makePlayer(room.players, base, 'robot', { isBot: true, controllerLabel: '🤖' });
    room.players.push(bot);
    log(room, `🤖 ${bot.name} joined the table (${room.players.length}/${MAX_PLAYERS})`, 'good');
    // Bot acts only on its turn (pokeBot via timers), so no arm needed here —
    // but a mid-game add while it's somehow current is impossible (appended
    // last), so just broadcast.
    cb?.({ ok: true, playerId: bot.id, room });
    emit(room);
  });
}
