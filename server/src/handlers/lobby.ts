import type { Socket } from 'socket.io';
import { MAX_PLAYERS, START_CASH } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { rooms, uid, type SessionData } from '../store.js';
import { armTurnTimer, clearAuctionTimer, cleanToken, current, emit, log, makeCode } from '../helpers.js';

export function registerLobbyHandlers(socket: Socket) {
  socket.on('createRoom', ({ playerName, token }: { playerName: string; token: Player['token'] }, cb) => {
    const code = makeCode();
    const player: Player = {
      id: uid('p'), name: (playerName || 'Host').slice(0, 16), token: cleanToken(token, 'car'),
      cash: START_CASH, position: 0, properties: [], mortgaged: [],
      inJail: false, jailTurns: 0, doubles: 0, bankrupt: false,
      connected: true, isHost: true, hasRolled: false,
    };
    const room: RoomState = {
      code, status: 'lobby', players: [player], turnIndex: 0,
      dice: [1, 1], lastRoll: null, pendingBuy: null, trades: [], auction: null, buildings: {}, turnDeadline: null, auctionQueue: [], lastActivity: Date.now(), log: [], winnerId: null, turnCount: 0,
    };
    log(room, `🎉 Room ${code} created by ${player.name}`);
    rooms.set(code, room);
    socket.join(code);
    (socket.data as SessionData).pid = player.id;
    (socket.data as SessionData).code = code;
    cb?.({ ok: true, code, playerId: player.id, room });
    emit(room);
  });

  socket.on('joinRoom', ({ code, playerName, token }: { code: string; playerName: string; token: Player['token'] }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    if (room.status === 'finished') return cb?.({ ok: false, error: 'GAME_OVER' });
    if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: 'ROOM_FULL' });
    let name = (playerName || 'Player').slice(0, 16);
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${name} 2`;
    const player: Player = {
      id: uid('p'), name, token: cleanToken(token, 'dog'), cash: START_CASH,
      position: 0, properties: [], mortgaged: [], inJail: false, jailTurns: 0,
      doubles: 0, bankrupt: false, connected: true, isHost: false, hasRolled: false,
    };
    room.players.push(player);
    log(room, `📱 ${name} joined (${room.players.length}/${MAX_PLAYERS})`, 'good');
    socket.join(code);
    (socket.data as SessionData).pid = player.id;
    (socket.data as SessionData).code = code;
    cb?.({ ok: true, code, playerId: player.id, room });
    emit(room);
  });

  socket.on('watchRoom', ({ code }: { code: string }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'NO_ROOM' });
    socket.join(code);
    cb?.({ ok: true, room });
  });

  socket.on('rejoin', ({ code, playerId }: { code: string; playerId: string }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    const p = room?.players.find((x) => x.id === playerId);
    if (!room || !p) return cb?.({ ok: false });
    p.connected = true;
    socket.join(room.code);
    (socket.data as SessionData).pid = p.id;
    (socket.data as SessionData).code = room.code;
    cb?.({ ok: true, room });
    emit(room);
  });

  socket.on('startGame', ({ code }: { code: string }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false });
    if (room.players.length < 2) return cb?.({ ok: false, error: 'NEED_2' });
    // shuffle turn order
    room.players.sort(() => Math.random() - 0.5);
    room.players.forEach((p) => {
      p.cash = START_CASH; p.position = 0; p.properties = []; p.mortgaged = [];
      p.inJail = false; p.jailTurns = 0; p.bankrupt = false; p.hasRolled = false;
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
    const room = rooms.get(code);
    const p = room?.players.find((x) => x.id === pid);
    if (p && room) {
      p.connected = false;
      log(room, `📴 ${p.name} disconnected`, 'info');
      // A dead current seat gets a short fuse instead of stalling the table.
      if (room.status === 'playing' && current(room).id === p.id) armTurnTimer(room);
      emit(room);
    }
  });
}
