import type { Socket } from 'socket.io';
import { MAX_PLAYERS, DEFAULT_BOARD_STYLE } from '@monopoly/shared';
import { isKnownStyle } from '../themes.js';
import type { BoardStyle, Player, RoomState } from '@monopoly/shared';
import { rooms, issueControl as issueControlStore, type SessionData } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { makeCode, makePlayer } from '../core/player.js';
import { cleanLabel, issueControl, setControllerSocket } from '../core/seat.js';

/**
 * Lobby handlers: room creation, joining, watching, and the public browser.
 * Seat control (rejoin/claim/release/disconnect) lives in session.ts.
 * Registered alongside the other handlers in index.ts.
 */
export function registerLobbyHandlers(socket: Socket) {
  socket.on(
    'createRoom',
    (
      {
        playerName,
        token,
        deviceLabel,
        style,
      }: {
        playerName: string;
        token: Player['token'];
        deviceLabel?: unknown;
        style?: unknown;
      },
      cb,
    ) => {
      const code = makeCode();
      const label = cleanLabel(deviceLabel);
      const boardStyle = isKnownStyle(style) ? (style as BoardStyle) : DEFAULT_BOARD_STYLE;
      const player = makePlayer([], playerName || 'Host', token, { isHost: true, controllerLabel: label });
      const room: RoomState = {
        code,
        status: 'lobby',
        players: [player],
        turnIndex: 0,
        dice: [1, 1],
        lastRoll: null,
        lastCard: null,
        pendingBuy: null,
        trades: [],
        auction: null,
        buildings: {},
        turnDeadline: null,
        auctionQueue: [],
        lastActivity: Date.now(),
        pausedAt: null,
        boardStyle,
        log: [],
        winnerId: null,
        turnCount: 0,
        rollingId: null,
        rev: 0,
      };
      const controlKey = issueControl(code, player.id);
      log(room, `Room ${code} created by ${player.name}`);
      rooms.set(code, room);
      socket.join(code);
      (socket.data as SessionData).pid = player.id;
      (socket.data as SessionData).code = code;
      // Map the birth socket: if this tab closes before the PlayScreen rejoin
      // lands, the seat must still go offline (otherwise `connected` sticks true
      // forever and the seat — and its table — can never expire).
      setControllerSocket(code, player.id, socket.id);
      cb?.({ ok: true, code, playerId: player.id, controlKey, room });
      emit(room);
    },
  );

  socket.on(
    'joinRoom',
    (
      {
        code,
        playerName,
        token,
        deviceLabel,
      }: {
        code: string;
        playerName: string;
        token: Player['token'];
        deviceLabel?: unknown;
      },
      cb,
    ) => {
      if (typeof code !== 'string') return cb?.({ ok: false, error: 'NO_ROOM' });
      code = (code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
      if (room.status === 'finished') return cb?.({ ok: false, error: 'GAME_OVER' });
      if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: 'ROOM_FULL' });
      // Duplicate display names get a numeric suffix via makePlayer/uniqueName.
      const label = cleanLabel(deviceLabel);
      const player = makePlayer(room.players, playerName || 'Player', token, { controllerLabel: label });
      const controlKey = issueControlStore(code, player.id);
      room.players.push(player);
      log(room, `${player.name} joined (${room.players.length}/${MAX_PLAYERS})`, 'good');
      socket.join(code);
      (socket.data as SessionData).pid = player.id;
      (socket.data as SessionData).code = code;
      setControllerSocket(code, player.id, socket.id); // same ghost-seat guard as create
      cb?.({ ok: true, code, playerId: player.id, controlKey, room });
      emit(room);
    },
  );

  socket.on('watchRoom', ({ code }: { code: string }, cb) => {
    if (typeof code !== 'string') return cb?.({ ok: false, error: 'NO_ROOM' });
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    socket.join(code);
    cb?.({ ok: true, room });
  });

  // Public lobby browser: waiting + live rooms, newest activity first so the
  // latest table tops the list. No secrets here by design
  // (codes are already shareable; keys/PINs/labels never leave roomState).
  socket.on('listRooms', (_payload: unknown, cb) => {
    const list = [...rooms.values()]
      .filter((r) => r.status === 'lobby' || r.status === 'playing')
      .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
      .slice(0, 20)
      .map((r) => ({
        code: r.code,
        status: r.status,
        players: r.players.filter((p) => !p.bankrupt).length,
        max: MAX_PLAYERS,
        hostName: r.players.find((p) => p.isHost)?.name ?? r.players[0]?.name ?? '?',
      }));
    cb?.({ ok: true, rooms: list });
  });
}
