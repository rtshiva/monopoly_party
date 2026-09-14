import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from 'socket.io';
import { rooms, setIo } from './store.js';
import type { RoomState } from '@monopoly/shared';
import { DEFAULT_BOARD_STYLE } from '@monopoly/shared';
import { openNextQueuedAuction } from './core/auction.js';
import { injectAuctionClock } from './core/auction.js';
import { clearTurnTimer, armTurnTimer } from './core/timers.js';
import { injectArmTurnTimer } from './core/player.js';
import { loadRoomsAsync } from './persist.js';
import { startHygiene } from './core/hygiene.js';
import { readHistory } from './history.js';
import { dlog } from './debug.js';
import { discoverThemes, isKnownStyle } from './themes.js';
import { registerSessionHandlers } from './handlers/session.js';
import { registerGameHandlers } from './handlers/game.js';
import { registerTurnHandlers } from './handlers/turns.js';
import { registerAuctionHandlers } from './handlers/auctions.js';
import { registerEconomyHandlers } from './handlers/economy.js';
import { registerTradeHandlers } from './handlers/trades.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Break the player ↔ timers circular dependency at boot time.
// player.ts needs armTurnTimer but cannot import timers.ts without a cycle;
// timers.ts imports advanceTurn from player.ts. The injection resolves this.
injectArmTurnTimer(armTurnTimer);
// Same cycle one layer over: auction.ts drives the turn clock (freeze on
// open, re-arm on resolve) but timers.ts opens auctions on timeout.
injectAuctionClock(armTurnTimer, clearTurnTimer);

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// Board skins: built-ins plus drop-in theme folders (see themes.ts). Scanned
// live per request so newly added art is selectable without a restart.
app.get('/api/themes', (_req, res) => {
  try {
    res.json({ ok: true, themes: discoverThemes() });
  } catch {
    res.json({ ok: true, themes: [] });
  }
});

// Durable event log for a room, newest first. Empty array when Postgres is
// unconfigured or unreachable — the live feed in roomState covers that case.
app.get('/api/history/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) return res.status(400).json({ ok: false, error: 'BAD_CODE' });
  const limit = Number(req.query.limit ?? 100);
  res.json({ ok: true, code, events: await readHistory(code, limit) });
});

// Live diagnostics snapshot: room roster (no secrets), pending timers, and
// the journal tail. The companion to ?debug=1 on the client — grab this plus
// a phone's debug buffer when reporting a bug.
app.get('/api/debug/summary', async (_req, res) => {
  const { tailLog } = await import('./debug.js');
  const now = Date.now();
  res.json({
    ok: true,
    time: now,
    uptimeSec: Math.round(process.uptime()),
    rooms: [...rooms.values()].map((r) => ({
      code: r.code, status: r.status, turn: r.turnCount, rev: r.rev ?? 0,
      seats: r.players.length, online: r.players.filter((p) => p.connected).length,
      auction: r.auction?.tile ?? null, idleSec: Math.round((now - (r.lastActivity ?? now)) / 1000),
    })),
    journal: tailLog(30),
  });
});

// Serve built client if present (production single-port deploy).
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^\/(host|play)(\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built. Run npm run build.');
  });
});

const server = http.createServer(app);

// ALLOWED_ORIGIN: restrict in internet deploys (e.g. ALLOWED_ORIGIN=https://yourdomain.com).
// Defaults to '*' for LAN/dev use where any origin must reach the server.
const allowedOrigin: string | string[] = process.env.ALLOWED_ORIGIN ?? '*';
const io = new Server(server, { cors: { origin: allowedOrigin } });
setIo(io);

io.on('connection', (socket) => {
  // Normalize room codes once for every event: only some handlers trim/case
  // the code, so a lowercase code would otherwise miss its room silently.
  // Runs before the handlers below for all current and future events.
  socket.use((packet, next) => {
    const payload = (packet as unknown[])[1] as Record<string, unknown> | undefined;
    if (payload && typeof payload === 'object' && typeof payload.code === 'string') {
      payload.code = payload.code.toUpperCase().trim();
    }
    next();
  });
  registerSessionHandlers(socket);
  registerGameHandlers(socket);
  registerTurnHandlers(socket);
  registerAuctionHandlers(socket);
  registerEconomyHandlers(socket);
  registerTradeHandlers(socket);
});

// ---------------------------------------------------------------------------
// Snapshot migration — applied to rooms loaded from disk on startup.
// Each field added in a later milestone is normalised here so old snapshots
// remain compatible. Extract this function if the list grows beyond ~15 fields.
// ---------------------------------------------------------------------------
function migrateRoom(room: RoomState) {
  room.trades ??= [];
  room.buildings ??= {};
  room.auctionQueue ??= [];
  room.lastActivity ??= Date.now();
  room.rev ??= 0;
  // Ephemeral hold-to-roll presence: never restore a mid-shake flag.
  room.rollingId = null;
  // Nullable game fields added across milestones.
  room.lastRoll ??= null;
  room.lastCard ??= null;
  room.pendingBuy ??= null;
  room.turnDeadline ??= null;
  room.pausedAt ??= null;
  room.winnerId ??= null;
  // Player fields added across milestones (pre-card / pre-timer snapshots).
  for (const p of room.players) {
    p.mortgaged ??= [];
    p.jailTurns ??= 0;
    p.jailCards ??= 0;
    p.doubles ??= 0;
    p.hasRolled ??= false;
    p.connected ??= false;
    p.seatPin ??= '0000';
    p.controllerLabel ??= null;
    p.isBot ??= false;
  }
  // Retired skins (maze/circuit) migrate forward; drop-in theme folders are
  // honoured so a reboot never resets a custom board. Unknown values reset.
  if (!isKnownStyle(room.boardStyle)) room.boardStyle = DEFAULT_BOARD_STYLE;
  // Normalize pre-card-era trade offers so old snapshots can't NaN the swap math.
  for (const t of room.trades) {
    t.giveCards ??= 0;
    t.wantCards ??= 0;
  }
}

// Recover snapshots from the last run: seats come back offline, the
// interrupted auction (if any) rejoins the bank queue, turns re-arm.
// Redis first (shared state across instances), file fallback.
async function boot() {
  let recovered = 0;
  for (const room of await loadRoomsAsync()) {
    migrateRoom(room);
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
  dlog({ evt: 'boot', msg: `recovered=${recovered}` });
  const PORT = Number(process.env.PORT || 3001);
  server.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

void boot();

// ---------------------------------------------------------------------------
// Room hygiene — expire dead rooms and cap memory. Owned by core/hygiene.ts
// (unit-tested); this just starts the 60s unref'd sweep.
// ---------------------------------------------------------------------------
startHygiene();
