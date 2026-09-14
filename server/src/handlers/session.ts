import type { Socket } from 'socket.io';
import { MAX_PLAYERS, START_CASH, DEFAULT_BOARD_STYLE } from '@monopoly/shared';
import { isKnownStyle } from '../themes.js';
import type { BoardStyle, Player, RoomState } from '@monopoly/shared';
import { dropControl, rooms, turnTimers, uid, type SessionData } from '../store.js';
import { emit, log } from '../core/broadcast.js';
import { dlog } from '../debug.js';
import { cleanToken, current, makeCode, uniqueName } from '../core/player.js';
import {
  clearControllerSocket,
  controllerSocketOf,
  evictPreviousController,
  genPin,
  issueControl,
  requireControl,
  setControllerSocket,
} from '../core/seat.js';
import { armTurnTimer } from '../core/timers.js';
import { clearRolling } from '../core/rolling.js';

function cleanLabel(v: unknown): string {
  const s = typeof v === 'string' && v.trim() ? v.trim() : 'Phone';
  return s.slice(0, 24);
}

/**
 * Session handlers: seats joining, watching, rejoining, claiming, leaving.
 * Registered alongside game.ts in index.ts.
 */
export function registerSessionHandlers(socket: Socket) {
  socket.on('createRoom', ({ playerName, token, deviceLabel, style }: {
    playerName: string; token: Player['token']; deviceLabel?: unknown; style?: unknown;
  }, cb) => {
    const code = makeCode();
    const label = cleanLabel(deviceLabel);
    const boardStyle = isKnownStyle(style) ? (style as BoardStyle) : DEFAULT_BOARD_STYLE;
    const player: Player = {
      id: uid('p'), name: (playerName || 'Host').slice(0, 16), token: cleanToken(token, 'car'),
      cash: START_CASH, position: 0, properties: [], mortgaged: [],
      inJail: false, jailTurns: 0, jailCards: 0, doubles: 0, bankrupt: false,
      connected: true, isHost: true, isBot: false, hasRolled: false,
      seatPin: genPin(), controllerLabel: label,
    };
    const room: RoomState = {
      code, status: 'lobby', players: [player], turnIndex: 0,
      dice: [1, 1], lastRoll: null, lastCard: null, pendingBuy: null, trades: [], auction: null, buildings: {}, turnDeadline: null, auctionQueue: [], lastActivity: Date.now(), pausedAt: null, boardStyle, log: [], winnerId: null, turnCount: 0, rollingId: null, rev: 0,
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
  });

  socket.on('joinRoom', ({ code, playerName, token, deviceLabel }: {
    code: string; playerName: string; token: Player['token']; deviceLabel?: unknown;
  }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    if (room.status === 'finished') return cb?.({ ok: false, error: 'GAME_OVER' });
    if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: 'ROOM_FULL' });
    // Duplicate display names get a numeric suffix (looped — "Anu 2" taken
    // yields "Anu 3", not a second "Anu 2").
    const name = uniqueName(room.players, (playerName || 'Player').slice(0, 16));
    const label = cleanLabel(deviceLabel);
    const player: Player = {
      id: uid('p'), name, token: cleanToken(token, 'dog'), cash: START_CASH,
      position: 0, properties: [], mortgaged: [], inJail: false, jailTurns: 0,
      jailCards: 0, doubles: 0, bankrupt: false, connected: true, isHost: false, isBot: false, hasRolled: false,
      seatPin: genPin(), controllerLabel: label,
    };
    const controlKey = issueControl(code, player.id);
    room.players.push(player);
    log(room, `${name} joined (${room.players.length}/${MAX_PLAYERS})`, 'good');
    socket.join(code);
    (socket.data as SessionData).pid = player.id;
    (socket.data as SessionData).code = code;
    setControllerSocket(code, player.id, socket.id); // same ghost-seat guard as create
    cb?.({ ok: true, code, playerId: player.id, controlKey, room });
    emit(room);
  });

  socket.on('watchRoom', ({ code }: { code: string }, cb) => {
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

  socket.on('rejoin', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ ok: false });
    const p = requireControl(room, playerId, key);
    if (!p) return cb?.({ ok: false, error: 'NO_CONTROL' });
    p.connected = true;
    setControllerSocket(room.code, p.id, socket.id);
    socket.join(room.code);
    (socket.data as SessionData).pid = p.id;
    (socket.data as SessionData).code = room.code;
    // Wake the clock when it has none: a frozen (all-gone) table restarts its
    // window on the first returning controller. Gated on "no timer pending"
    // so routine rejoins never extend a live player's window.
    if (room.status === 'playing' && !turnTimers.has(room.code)) armTurnTimer(room);
    cb?.({ ok: true, room });
    emit(room);
  });

  // Take over a seat from any device. The seat PIN is public to the room
  // (shown on TV), so presence in the room is the credential; the takeover
  // itself is announced on every screen.
  socket.on('claimSeat', ({ code, playerId, pin, deviceLabel }: {
    code: string; playerId: string; pin: unknown; deviceLabel?: unknown;
  }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    const seat = room.players.find((x) => x.id === playerId);
    if (!seat || seat.bankrupt || seat.isBot) return cb?.({ ok: false, error: 'BAD_SEAT' });
    if (typeof pin !== 'string' || seat.seatPin !== pin) return cb?.({ ok: false, error: 'BAD_PIN' });
    const label = cleanLabel(deviceLabel);
    evictPreviousController(room.code, seat.id, socket.id, label);
    const controlKey = issueControl(room.code, seat.id);
    seat.seatPin = genPin(); // rotation: the PIN you just used is already dead
    seat.controllerLabel = label;
    seat.connected = true;
    socket.join(room.code);
    (socket.data as SessionData).pid = seat.id;
    (socket.data as SessionData).code = room.code;
    // Same wake-up as rejoin (see above).
    if (room.status === 'playing' && !turnTimers.has(room.code)) armTurnTimer(room);
    log(room, `${label} now controls ${seat.name} (seat PIN rotated)`, 'info');
    dlog({ evt: 'seat.claim', code: room.code, turn: room.turnCount, seat: seat.id, msg: label });
    cb?.({ ok: true, playerId: seat.id, controlKey, room });
    emit(room);
  });

  socket.on('releaseSeat', ({ code, playerId, key }: { code: string; playerId: string; key: unknown }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    const me = requireControl(room, playerId, key);
    if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' });
    me.controllerLabel = null;
    me.connected = false;
    dropControl(room.code, me.id); // released seats need a fresh PIN claim
    log(room, `${me.name}'s seat was released -- claim it with the TV PIN`, 'info');
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('disconnect', () => {
    const { pid, code } = socket.data as SessionData;
    if (!pid || !code) return;
    // Only the live controller socket takes the seat offline; a stale tab
    // closing must not knock out the device actually playing. The mapping is
    // refreshed by every create/join/rejoin/claim, so dashboards and one-shot
    // watch calls (which never map) can never disturb seat presence.
    if (controllerSocketOf(code, pid) !== socket.id) return;
    const room = rooms.get(code);
    const p = room?.players.find((x) => x.id === pid);
    if (p && room) {
      p.connected = false;
      clearControllerSocket(code, pid); // key survives: this device can rejoin
      clearRolling(room, p.id); // a dead holder can't shake forever
      log(room, `${p.name} disconnected`, 'info');
      dlog({ evt: 'seat.offline', code, turn: room.turnCount, seat: pid });
      // A dead current seat gets a short fuse instead of stalling the table.
      if (room.status === 'playing' && current(room).id === p.id) armTurnTimer(room);
      emit(room);
    }
  });
}
