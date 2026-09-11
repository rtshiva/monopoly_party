import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from 'socket.io';
import { rooms, setIo } from './store.js';
import { armTurnTimer, clearAuctionTimer, clearTurnTimer, openNextQueuedAuction } from './helpers.js';
import { loadRooms, saveRooms } from './persist.js';
import { registerLobbyHandlers } from './handlers/lobby.js';
import { registerTurnHandlers } from './handlers/turns.js';
import { registerAuctionHandlers } from './handlers/auctions.js';
import { registerEconomyHandlers } from './handlers/economy.js';
import { registerTradeHandlers } from './handlers/trades.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// Serve built client if present (production single-port deploy)
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^\/(host|play)(\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built. Run npm run build.');
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
setIo(io);

io.on('connection', (socket) => {
  registerLobbyHandlers(socket);
  registerTurnHandlers(socket);
  registerAuctionHandlers(socket);
  registerEconomyHandlers(socket);
  registerTradeHandlers(socket);
});

// Recover snapshots from the last run: seats come back offline, the
// interrupted auction (if any) rejoins the bank queue, turns re-arm.
let recovered = 0;
for (const room of loadRooms()) {
  room.trades ??= [];
  room.buildings ??= {};
  room.auctionQueue ??= [];
  room.lastActivity ??= Date.now();
  room.boardStyle ??= 'maze';
  // Normalize pre-card-era offers so old snapshots can't NaN the swap math.
  for (const t of room.trades) {
    t.giveCards ??= 0;
    t.wantCards ??= 0;
  }
  room.players.forEach((p) => { p.connected = false; });
  if (room.auction) {
    room.auctionQueue.unshift(room.auction.tile);
    room.auction = null;
  }
  rooms.set(room.code, room);
  if (room.status === 'playing') {
    armTurnTimer(room);
    openNextQueuedAuction(room);
  } else {
    room.turnDeadline = null;
  }
  recovered++;
}
if (recovered > 0) console.log(`[server] recovered ${recovered} room(s) from snapshot`);

// Hygiene: expire dead rooms hourly-ish and cap memory. Runs unref'd so it
// never keeps the process (or a test runner) alive on its own.
const FINISHED_TTL_MS = 30 * 60 * 1000;
const LOBBY_TTL_MS = 4 * 60 * 60 * 1000;
const DEAD_PLAYING_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ROOMS = 200;

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - (room.lastActivity ?? now);
    const allGone = room.players.length > 0 && room.players.every((p) => !p.connected);
    const stale =
      (room.status === 'finished' && idle > FINISHED_TTL_MS) ||
      (room.status === 'lobby' && idle > LOBBY_TTL_MS) ||
      (allGone && idle > DEAD_PLAYING_TTL_MS);
    if (stale) {
      clearAuctionTimer(code);
      clearTurnTimer(code);
      rooms.delete(code);
    }
  }
  if (rooms.size > MAX_ROOMS) {
    const victims = [...rooms.values()]
      .filter((r) => r.status !== 'playing')
      .sort((a, b) => (a.lastActivity ?? 0) - (b.lastActivity ?? 0));
    for (const v of victims.slice(0, rooms.size - MAX_ROOMS)) {
      clearAuctionTimer(v.code);
      clearTurnTimer(v.code);
      rooms.delete(v.code);
    }
  }
  saveRooms(rooms);
}, 60_000).unref?.();

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
