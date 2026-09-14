// Seeded full-game simulation: the PRODUCTION bot brain (core/botBrain.ts) plays
// complete games through the real core (doRoll / advanceTurn / auctions /
// swaps / bankruptcy), asserting global invariants after every turn. Every
// sim game is therefore also a full-game bot regression test. Catches
// state-corruption bugs that unit tests (single-function) and the scripted
// regression suite both miss.
//
// Run: npm run test:sim --workspace=@monopoly/server
// (wired into `npm test` after the unit suite; ~seconds, no sockets)
import fs from 'fs';
import os from 'os';
import path from 'path';

delete process.env.REDIS_URL;
delete process.env.DATABASE_URL;
process.env.ROOMS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-sim-')), 'rooms.json');
// Suite traffic stays out of the dev journal (see regression.mjs).
process.env.LOG_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-sim-log-')), 'debug.log');

const { rooms, setIo, forgetRoom } = await import('../dist/store.js');
setIo({ to: () => ({ emit: () => {} }) });
const { BOARD, ownerOf } = await import('@monopoly/shared');
const { current, checkWin } = await import('../dist/core/player.js');
const { log } = await import('../dist/core/broadcast.js');
const {
  resolveAuction, clearAuctionTimer, openNextQueuedAuction,
} = await import('../dist/core/auction.js');
const { bankruptPlayer } = await import('../dist/core/bankruptcy.js');
const {
  applyTradeSwap, pruneTrades, colorSetTiles, isBuyable,
} = await import('../dist/core/trade.js');
const { setHasBuildings } = await import('../dist/core/houses.js');
const { botTakeTurn } = await import('../dist/core/botBrain.js');

const GAMES = 21;
// Seat counts cycle 2→8 so the sim covers sparse tables AND full 8-bot
// tables (turn-index wrap, 7-bankrupt skip chains, 8-way auctions).
const SEAT_COUNTS = Array.from({ length: GAMES }, (_, g) => 2 + (g % 7));
const TURN_CAP = 800;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
const fail = (game, msg) => { failures++; console.log(`FAIL game#${game} ${msg}`); };

const BOT_TOKENS = ['car', 'hat', 'dog', 'ship', 'cat', 'balloon', 'robot', 'crown'];

function mkPlayer(i) {
  return {
    id: `s_p${i}`, name: `Sim${i}`, token: BOT_TOKENS[i % BOT_TOKENS.length], cash: 1500, position: 0,
    properties: [], mortgaged: [], inJail: false, jailTurns: 0, jailCards: 0,
    doubles: 0, bankrupt: false, connected: true, isHost: i === 0, isBot: true,
    hasRolled: false, seatPin: '0000', controllerLabel: 'sim',
  };
}

function mkRoom(n = 4) {
  const code = `SIM${Math.floor(Math.random() * 1e6)}`;
  const room = {
    code, status: 'playing', players: Array.from({ length: n }, (_, i) => mkPlayer(i)),
    turnIndex: 0, dice: [1, 1], lastRoll: null, lastCard: null, pendingBuy: null,
    trades: [], auction: null, buildings: {}, turnDeadline: null,
    auctionQueue: [], lastActivity: Date.now(), pausedAt: null, boardStyle: 'grandprix',
    log: [], winnerId: null, turnCount: 1, rollingId: null, rev: 0,
  };
  rooms.set(code, room);
  return room;
}

/** Resolve the live auction (plus any queued chain) with random bids. */
function settleAuctions(room, rnd, game) {
  // Each resolve consumes exactly one queue entry, so the chain is bounded by
  // the queue depth at entry — exceeding it means resolve stopped consuming.
  const cap = room.auctionQueue.length + 2;
  let guard = 0;
  while (room.auction && guard++ < cap) {
    const a = room.auction;
    const bidders = room.players.filter((p) => !p.bankrupt && p.cash >= 10);
    let top = 0;
    for (const b of bidders) {
      if (rnd() < 0.6) continue;
      const amount = Math.min(b.cash, top + 10 + Math.floor(rnd() * 120));
      if (amount > top && amount >= 10) {
        a.bids.push({ playerId: b.id, amount, at: Date.now() });
        top = amount;
      }
    }
    clearAuctionTimer(room.code); // we resolve now; drop the 30s timer
    resolveAuction(room.code, a.id);
  }
  if (room.auction) fail(game, 'auction chain did not drain');
}

/** One turn, driven by the production bot brain. Must always end the turn,
 *  bankrupt, or finish the game — anything else is a bot stall (real bug). */
function agentTurn(room, me, rnd, game) {
  if (me.bankrupt || room.status !== 'playing') return;
  const before = room.turnCount;
  const trace = [];
  botTakeTurn(room, me, trace);
  traceLog.push({ turn: before, who: me.name, trace });
  if (traceLog.length > 8) traceLog.shift();
  // Set-completing swap (real-player behavior: trade toward monopolies, which
  // is what actually ends games). Validated exactly like a live trade offer.
  if (room.status === 'playing' && rnd() < 0.6) {
    const peers = room.players.filter((p) => p.id !== me.id && !p.bankrupt && me.cash >= 0 && p.cash >= 0);
    let done = false;
    for (const peer of peers) {
      if (done) break;
      for (const t of me.properties) {
        const tile = BOARD[t];
        if (!tile || tile.kind !== 'property') continue;
        const set = colorSetTiles(t);
        const mine = set.filter((i) => me.properties.includes(i));
        const theirs = set.filter((i) => peer.properties.includes(i) && !peer.mortgaged.includes(i) && !setHasBuildings(room, i));
        if (mine.length !== set.length - 1 || theirs.length !== 1) continue;
        const give = me.properties.find((g) =>
          !set.includes(g) && isBuyable(g) && !me.mortgaged.includes(g) && !setHasBuildings(room, g));
        if (give === undefined) continue;
        applyTradeSwap(me, peer, {
          id: 'sim', fromId: me.id, toId: peer.id, giveTiles: [give], giveCash: 0,
          giveCards: 0, wantTiles: [theirs[0]], wantCash: 0, wantCards: 0,
          createdAt: Date.now(), expiresAt: Date.now() + 60000,
        });
        log(room, `✅ ${me.name} ↔ ${peer.name} traded (set complete)`, 'good');
        done = true;
        break;
      }
    }
  }
  // Rare peer trade (extra swap coverage; low rate so sets can form).
  if (room.status === 'playing' && rnd() < 0.03) {
    const peers = room.players.filter((p) => p.id !== me.id && !p.bankrupt);
    const peer = peers[Math.floor(rnd() * peers.length)];
    const deed = me.properties.find((t) => isBuyable(t) && !me.mortgaged.includes(t) && !setHasBuildings(room, t));
    const want = peer?.properties.find((t) => isBuyable(t) && !peer.mortgaged.includes(t) && !setHasBuildings(room, t));
    if (peer && deed !== undefined && want !== undefined && me.cash >= 0 && peer.cash >= 0) {
      applyTradeSwap(
        me, peer,
        {
          id: 'sim', fromId: me.id, toId: peer.id, giveTiles: [deed], giveCash: 0,
          giveCards: 0, wantTiles: [want], wantCash: 0, wantCards: 0,
          createdAt: Date.now(), expiresAt: Date.now() + 60000,
        },
      );
      log(room, `✅ ${me.name} ↔ ${peer.name} traded`, 'good');
    }
  }
  pruneTrades(room);
  if (room.status === 'playing' && room.turnCount === before && !me.bankrupt) {
    fail(game, 'turn stalled — bot did not advance');
    bankruptPlayer(room, me);
  }
}

function invariants(room, game, turn) {
  const ctx = `turn#${turn}`;
  const alive = room.players.filter((p) => !p.bankrupt);
  // Deed uniqueness across live seats, auction, and pendingBuy.
  const seen = new Map();
  for (const p of alive) {
    if (new Set(p.properties).size !== p.properties.length) fail(game, `${ctx} dup deeds ${p.name}`);
    if (new Set(p.mortgaged).size !== p.mortgaged.length) fail(game, `${ctx} dup mortgage ${p.name}`);
    for (const t of p.properties) {
      if (seen.has(t)) fail(game, `${ctx} deed ${t} on two seats`);
      seen.set(t, p.id);
      if (!Number.isInteger(t) || !BOARD[t] || !isBuyable(t)) fail(game, `${ctx} bad deed ${t}`);
    }
    for (const t of p.mortgaged) {
      if (!p.properties.includes(t)) fail(game, `${ctx} mortgaged unowned ${t}`);
    }
    if (!Number.isFinite(p.cash)) fail(game, `${ctx} non-finite cash ${p.name}`);
    if (p.position < 0 || p.position > 39) fail(game, `${ctx} bad position ${p.name}`);
    if (p.jailCards < 0) fail(game, `${ctx} negative cards ${p.name}`);
  }
  if (room.auction && seen.has(room.auction.tile)) fail(game, `${ctx} auction on owned deed`);
  if (room.pendingBuy != null && seen.has(room.pendingBuy)) fail(game, `${ctx} pendingBuy owned`);
  for (const [k, v] of Object.entries(room.buildings)) {
    const t = Number(k);
    if (!seen.has(t)) fail(game, `${ctx} building on bank deed ${t}`);
    if (!Number.isInteger(v) || v < 1 || v > 5) fail(game, `${ctx} bad level ${t}=${v}`);
  }
  if (room.log.length > 80) fail(game, `${ctx} log overflow ${room.log.length}`);
  if (room.turnIndex < 0 || room.turnIndex >= room.players.length) fail(game, `${ctx} bad turnIndex`);
  if (room.status === 'playing' && current(room).bankrupt) fail(game, `${ctx} current bankrupt`);
  for (const t of room.trades) {
    if (!room.players.some((p) => p.id === t.fromId) || !room.players.some((p) => p.id === t.toId)) {
      fail(game, `${ctx} trade with ghost seat`);
    }
  }
  if (room.auction) {
    if (!isBuyable(room.auction.tile) || ownerOf(room, room.auction.tile)) {
      fail(game, `${ctx} auction on invalid deed`);
    }
    for (const b of room.auction.bids) {
      if (b.amount < 10) fail(game, `${ctx} sub-min bid`);
      if (!room.players.some((p) => p.id === b.playerId && !p.bankrupt)) fail(game, `${ctx} ghost bid`);
    }
  }
}

const realRandom = Math.random;
let winners = {};
let totalTurns = 0;
let finished = 0;
/** Rolling flight-recorder window, dumped when a game fails. */
let traceLog = [];
for (let g = 1; g <= GAMES; g++) {
  Math.random = mulberry32(g * 100003);
  const room = mkRoom(SEAT_COUNTS[g - 1]);
  traceLog = [];
  const f0 = failures;
  let turns = 0;
  while (room.status === 'playing' && turns < TURN_CAP) {
    const me = current(room);
    agentTurn(room, me, Math.random, g);
    settleAuctions(room, Math.random, g);
    openNextQueuedAuction(room);
    settleAuctions(room, Math.random, g);
    clearAuctionTimer(room.code);
    checkWin(room);
    invariants(room, g, turns);
    turns++;
  }
  Math.random = realRandom;
  if (failures !== f0 || room.status !== 'finished') {
    console.log(`--- bot traces game#${g} (last ${traceLog.length} turns) ---`);
    for (const { turn, who, trace } of traceLog) {
      console.log(`  turn#${turn} ${who}: ${trace.map((e) => `${e.t}:${e.ok ? 'ok' : 'FAIL'}(${e.detail})`).join(' ')}`);
    }
  }
  if (room.status !== 'finished') {
    const snap = room.players.map((p) =>
      `${p.name}${p.bankrupt ? '💀' : ''}:$${p.cash}/${p.properties.length}d/${p.mortgaged.length}m`).join(' ');
    const built = Object.keys(room.buildings).length;
    fail(g, `no winner after ${TURN_CAP} turns [${snap} built=${built} q=${room.auctionQueue.length}]`);
  } else {
    const w = room.players.find((p) => p.id === room.winnerId);
    if (!w || w.bankrupt) fail(g, 'bogus winner');
    winners[w.name] = (winners[w.name] ?? 0) + 1;
    finished++;
    totalTurns += turns;
  }
  clearAuctionTimer(room.code);
  rooms.delete(room.code);
  forgetRoom(room.code);
}
Math.random = realRandom;

console.log(`SIM ${GAMES} games, seats=[${SEAT_COUNTS.join(',')}], finished=${finished}, avgTurns=${finished ? Math.round(totalTurns / finished) : '-'}, winners=${JSON.stringify(winners)}`);
console.log(failures === 0 ? 'PASS sim invariants hold' : `FAIL sim ${failures} violation(s)`);
if (failures > 0) process.exitCode = 1;
if (rooms.size !== 0) { console.log(`FAIL sim leaked ${rooms.size} room(s)`); process.exitCode = 1; }
