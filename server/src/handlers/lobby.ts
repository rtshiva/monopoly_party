import type { Socket } from 'socket.io';
import { MAX_PLAYERS, START_CASH } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { dropControl, rooms, uid, type SessionData } from '../store.js';
import { armTurnTimer, clearAuctionTimer, clearControllerSocket, cleanToken, controllerSocketOf, current, emit, evictPreviousController, genPin, issueControl, log, makeCode, requireControl, setControllerSocket } from '../helpers.js';

function cleanLabel(v: unknown): string {
  const s = typeof v === 'string' && v.trim() ? v.trim() : 'Phone';
  return s.slice(0, 24);
}

export function registerLobbyHandlers(socket: Socket) {
  socket.on('createRoom', ({ playerName, token, deviceLabel }: {
    playerName: string; token: Player['token']; deviceLabel?: unknown;
  }, cb) => {
    const code = makeCode();
    const label = cleanLabel(deviceLabel);
    const player: Player = {
      id: uid('p'), name: (playerName || 'Host').slice(0, 16), token: cleanToken(token, 'car'),
      cash: START_CASH, position: 0, properties: [], mortgaged: [],
      inJail: false, jailTurns: 0, doubles: 0, bankrupt: false,
      connected: true, isHost: true, hasRolled: false,
      seatPin: genPin(), controllerLabel: label,
    };
    const room: RoomState = {
      code, status: 'lobby', players: [player], turnIndex: 0,
      dice: [1, 1], lastRoll: null, pendingBuy: null, trades: [], auction: null, buildings: {}, turnDeadline: null, auctionQueue: [], lastActivity: Date.now(), log: [], winnerId: null, turnCount: 0,
    };
    const controlKey = issueControl(code, player.id);
    setControllerSocket(code, player.id, socket.id);
    log(room, `🎉 Room ${code} created by ${player.name}`);
    rooms.set(code, room);
    socket.join(code);
    (socket.data as SessionData).pid = player.id;
    (socket.data as SessionData).code = code;
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
    let name = (playerName || 'Player').slice(0, 16);
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${name} 2`;
    const label = cleanLabel(deviceLabel);
    const player: Player = {
      id: uid('p'), name, token: cleanToken(token, 'dog'), cash: START_CASH,
      position: 0, properties: [], mortgaged: [], inJail: false, jailTurns: 0,
      doubles: 0, bankrupt: false, connected: true, isHost: false, hasRolled: false,
      seatPin: genPin(), controllerLabel: label,
    };
    const controlKey = issueControl(code, player.id);
    setControllerSocket(code, player.id, socket.id);
    room.players.push(player);
    log(room, `📱 ${name} joined (${room.players.length}/${MAX_PLAYERS})`, 'good');
    socket.join(code);
    (socket.data as SessionData).pid = player.id;
    (socket.data as SessionData).code = code;
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
    if (!seat || seat.bankrupt) return cb?.({ ok: false, error: 'BAD_SEAT' });
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
    log(room, `🔀 ${label} now controls ${seat.name} (seat PIN rotated)`, 'info');
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
    log(room, `📴 ${me.name}'s seat was released — claim it with the TV PIN`, 'info');
    cb?.({ ok: true });
    emit(room);
  });

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
      p.inJail = false; p.jailTurns = 0; p.bankrupt = false; p.hasRolled = false;
      p.seatPin = genPin(); // fresh PINs every game; controllers keep their keys
    });
    room.status = 'playing'; room.turnIndex = 0; room.turnCount = 1;
    room.dice = [1, 1]; room.lastRoll = null; room.pendingBuy = null; room.winnerId = null;
    room.trades = [];
    clearAuctionTimer(code);
    room.auction = null;
    room.auctionQueue = [];
    room.buildings = {};
    log(room, `🎲 Game started! ${current(room).name} goes first.`, 'good');
    armTurnTimer(room);
    cb?.({ ok: true });
    emit(room);
  });

  socket.on('disconnect', () => {
    const { pid, code } = socket.data as SessionData;
    if (!pid || !code) return;
    // Only the live controller socket takes the seat offline; a stale tab
    // closing must not knock out the device actually playing.
    if (controllerSocketOf(code, pid) !== socket.id) return;
    const room = rooms.get(code);
    const p = room?.players.find((x) => x.id === pid);
    if (p && room) {
      p.connected = false;
      clearControllerSocket(code, pid); // key survives: this device can rejoin
      log(room, `📴 ${p.name} disconnected`, 'info');
      // A dead current seat gets a short fuse instead of stalling the table.
      if (room.status === 'playing' && current(room).id === p.id) armTurnTimer(room);
      emit(room);
    }
  });
}
