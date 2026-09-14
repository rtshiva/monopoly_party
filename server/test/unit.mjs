// Fast unit tests for the turn-timeout paths (timers.ts).
// No sockets, no waiting on real clocks: rooms are built in-memory with
// manipulated deadlines, and resolveTurnTimeout is invoked directly with a
// matching or stale turnCount token.
//
// Run: npm run test:unit --workspace=@monopoly/server
// (wired into `npm test` ahead of the live regression suite)
import fs from 'fs';
import os from 'os';
import path from 'path';

// Persistence + Redis must never engage here: isolated snapshot file, no URL.
delete process.env.REDIS_URL;
delete process.env.DATABASE_URL;
process.env.ROOMS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-unit-')), 'rooms.json');
process.env.LOG_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-unit-log-')), 'debug.log');

const { rooms, setIo, forgetRoom, turnTimers } = await import('../dist/store.js');
// Fake broadcast sink: emit() only needs io.to(code).emit().
setIo({ to: () => ({ emit: () => {} }) });
const { resolveTurnTimeout, turnExpired, armTurnTimer, clearTurnTimer, allGone } = await import('../dist/core/timers.js');
const { clearAuctionTimer } = await import('../dist/core/auction.js');
const { uniqueName } = await import('../dist/core/player.js');
const { flushHistory, readHistory, forgetHistory } = await import('../dist/history.js');
const {
  shouldBuy, pickBuildTile, pickMortgageTile, pickUnmortgageTile, botTakeTurn,
} = await import('../dist/core/botBrain.js');
const { botAct, pokeBot, clearBotTimer } = await import('../dist/core/bots.js');
const { botTimers } = await import('../dist/store.js');
const {
  openAuction, queueOrOpenAuction, resolveAuction, injectAuctionClock,
} = await import('../dist/core/auction.js');

const results = [];
const check = (n, c, x = '') => { results.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!c) process.exitCode = 1; };

let seq = 0;
function mkPlayer(i, patch = {}) {
  return {
    id: `u_p${i}`, name: ['A', 'B', 'C'][i] ?? `P${i}`, token: ['car', 'hat', 'dog'][i] ?? 'car',
    cash: 1500, position: 0, properties: [], mortgaged: [],
    inJail: false, jailTurns: 0, jailCards: 0, doubles: 0, bankrupt: false,
    connected: true, isHost: i === 0, isBot: false, hasRolled: false,
    seatPin: '0000', controllerLabel: null, ...patch,
  };
}

function mkRoom(patch = {}, n = 3) {
  const code = `UT${++seq}`;
  const room = {
    code, status: 'playing', players: Array.from({ length: n }, (_, i) => mkPlayer(i)),
    turnIndex: 0, dice: [1, 1], lastRoll: null, lastCard: null, pendingBuy: null,
    trades: [], auction: null, buildings: {}, turnDeadline: Date.now() + 60000,
    auctionQueue: [], lastActivity: Date.now(), pausedAt: null, boardStyle: 'grandprix',
    log: [], winnerId: null, turnCount: 5, rollingId: null, rev: 0, ...patch,
  };
  rooms.set(code, room);
  return room;
}

function cleanup(room) {
  clearTurnTimer(room.code);
  clearAuctionTimer(room.code);
  rooms.delete(room.code);
  forgetRoom(room.code);
}

// --- turnExpired ------------------------------------------------------------
{
  const r = mkRoom();
  check('expiry false on fresh deadline', turnExpired(r) === false);
  cleanup(r);
}
{
  const r = mkRoom({ turnDeadline: Date.now() - 3000 });
  check('expiry true 3s past deadline', turnExpired(r) === true);
  cleanup(r);
}
{
  const r = mkRoom({ turnDeadline: Date.now() - 500 });
  check('expiry false inside grace', turnExpired(r) === false);
  cleanup(r);
}
{
  const r = mkRoom({ turnDeadline: null });
  check('expiry false without deadline', turnExpired(r) === false);
  cleanup(r);
}
{
  const r = mkRoom({ status: 'paused', turnDeadline: Date.now() - 90000 });
  check('expiry false when paused', turnExpired(r) === false);
  cleanup(r);
}

// --- nobody-home freeze (anti-zombie) -------------------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { connected: false }), mkPlayer(1, { connected: false })] });
  check('allGone true when all offline', allGone(r) === true);
  armTurnTimer(r);
  const { turnTimers: tt } = await import('../dist/store.js');
  check('arm freezes when all gone', !tt.has(r.code) && r.turnDeadline === null);
  const logs = r.log.length;
  const tc = r.turnCount;
  resolveTurnTimeout(r.code, tc);
  check('resolve freezes when all gone', r.turnCount === tc && r.log.length === logs && r.turnDeadline === null);
  cleanup(r);
}
{
  // Bots count as present — their tables keep ticking.
  const r = mkRoom({ players: [mkPlayer(0, { connected: false }), mkPlayer(1, { isBot: true, connected: true })] });
  check('allGone false with live bot', allGone(r) === false);
  cleanup(r);
}

// --- stale token is a no-op ---------------------------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { hasRolled: true }), mkPlayer(1), mkPlayer(2)] });
  const logs = r.log.length;
  resolveTurnTimeout(r.code, r.turnCount + 99);
  check('stale token no-op', r.turnCount === 5 && r.turnIndex === 0 && r.log.length === logs);
  cleanup(r);
}

// --- timeout after roll advances the turn ------------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { hasRolled: true }), mkPlayer(1), mkPlayer(2)] });
  resolveTurnTimeout(r.code, r.turnCount);
  check('timeout after roll advances',
    r.turnIndex === 1 && r.turnCount === 6 && r.players[1].hasRolled === false && r.pendingBuy === null);
  cleanup(r);
}

// --- undecided purchase goes straight to auction ------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { hasRolled: true }), mkPlayer(1), mkPlayer(2)], pendingBuy: 1 });
  resolveTurnTimeout(r.code, r.turnCount);
  check('timeout auctions pendingBuy',
    r.pendingBuy === null && r.auction !== null && r.auction.tile === 1 && r.turnIndex === 1);
  cleanup(r);
}

// --- broke at timeout goes bankrupt (3 seats, game continues) -----------------
{
  const r = mkRoom({ players: [mkPlayer(0, { hasRolled: true, cash: -50, properties: [1] }), mkPlayer(1), mkPlayer(2)] });
  resolveTurnTimeout(r.code, r.turnCount);
  const me = r.players.find((p) => p.id === 'u_p0');
  check('timeout bankrupt when broke', me.bankrupt === true && r.status === 'playing' && r.turnIndex !== 0);
  cleanup(r);
}

// --- already-bankrupt current seat is skipped ----------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { bankrupt: true, hasRolled: true }), mkPlayer(1), mkPlayer(2)] });
  resolveTurnTimeout(r.code, r.turnCount);
  check('timeout skips bankrupt seat',
    r.turnIndex === 1 && r.players[1].bankrupt === false && r.players[2].bankrupt === false);
  cleanup(r);
}

// --- shaking presence is cleared ------------------------------------------------
{
  const r = mkRoom({
    players: [mkPlayer(0, { hasRolled: true }), mkPlayer(1), mkPlayer(2)],
    rollingId: 'u_p0',
  });
  resolveTurnTimeout(r.code, r.turnCount);
  check('timeout clears rollingId', r.rollingId === null);
  cleanup(r);
}

// --- idle pre-roll auto-rolls and moves on (outcome-agnostic) -------------------
{
  const r = mkRoom();
  const before = r.turnCount;
  resolveTurnTimeout(r.code, before);
  check('timeout auto-roll moves turn on', r.turnCount === before + 1 && r.status === 'playing');
  cleanup(r);
}

// --- arm/clear timer ------------------------------------------------------------
{
  const r = mkRoom();
  armTurnTimer(r);
  const onlineMs = r.turnDeadline - Date.now();
  const armed = turnTimers.has(r.code);
  clearTurnTimer(r.code);
  check('arm online ~60s + clear', armed && onlineMs > 55000 && onlineMs <= 61000 && !turnTimers.has(r.code));
  cleanup(r);
}
{
  const r = mkRoom({ players: [mkPlayer(0, { connected: false }), mkPlayer(1), mkPlayer(2)] });
  armTurnTimer(r);
  const ms = r.turnDeadline - Date.now();
  check('arm offline ~15s fuse', ms > 10000 && ms <= 16000);
  cleanup(r);
}

// --- unique display names ------------------------------------------------------
{
  const roster = [{ name: 'Anu' }, { name: 'Anu 2' }, { name: 'Siva' }];
  check('uniqueName free passes through', uniqueName(roster, 'Zed') === 'Zed');
  check('uniqueName taken → 2', uniqueName([{ name: 'Anu' }], 'Anu') === 'Anu 2');
  check('uniqueName taken twice → 3', uniqueName(roster, 'Anu') === 'Anu 3');
  check('uniqueName case-insensitive', uniqueName([{ name: 'anu' }], 'ANU') === 'ANU 2');
}

// --- rent tiers: level N charges the N-house price, hotel the top tier -----
{
  const { BOARD, rentFor } = await import('@monopoly/shared');  const roomFor = (level) => ({ players: [{ id: 'o', properties: [1, 3], mortgaged: [] }], buildings: level > 0 ? { 1: level } : {} });
  const expected = [BOARD[1].rent[1], BOARD[1].rent[2], BOARD[1].rent[3], BOARD[1].rent[4], BOARD[1].rent[5], BOARD[1].rent[6]];
  const got = [1, 2, 3, 4, 5].map((lv) => rentFor(roomFor(lv), 1, 7));
  check('rent level maps to tier', JSON.stringify(got) === JSON.stringify(expected.slice(1)));
  check('rent hotel premium', BOARD[1].rent[6] > BOARD[1].rent[5]);
  check('rent corrupt level clamps', rentFor(roomFor(99), 1, 7) === BOARD[1].rent[6]);
  check('rent fractional level floors', rentFor(roomFor(2.5), 1, 7) === BOARD[1].rent[3]);
}

// --- fullSetOf: color-set membership (shared with the phone UI) -----------------
{
  const { fullSetOf } = await import('@monopoly/shared');
  check('fullSetOf brown', JSON.stringify(fullSetOf(1)) === JSON.stringify([1, 3]));
  check('fullSetOf blue', JSON.stringify(fullSetOf(37)) === JSON.stringify([37, 39]));
  check('fullSetOf non-property', fullSetOf(0).length === 0 && fullSetOf(5).length === 0 && fullSetOf(99).length === 0);
}

// --- debug journal: structured, rotated, never throws -----------------------------
{
  const dbg = await import('../dist/debug.js');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-dbg-')), 'debug.log');
  process.env.LOG_FILE = tmp;
  process.env.DEBUG_LOG = '1';
  dbg.dlog({ evt: 'test.one', code: 'XX', turn: 3, msg: 'hi' });
  dbg.dlog({ evt: 'test.circ', bad: (() => { const o = {}; o.self = o; return o; })() });
  await new Promise((r) => setTimeout(r, 150)); // let the async append land
  const tail = dbg.tailLog(10);
  check('journal writes JSONL', tail.length >= 1 && JSON.parse(tail[0]).evt === 'test.one');
  check('journal survives circular', tail.some((l) => JSON.parse(l).evt === 'test.circ') || tail.length >= 1);
  delete process.env.LOG_FILE;
  process.env.DEBUG_LOG = '0';
  dbg.dlog({ evt: 'test.off' });
  await new Promise((r) => setTimeout(r, 100));
  check('journal disabled is silent', dbg.tailLog(10).length === 0);
  delete process.env.DEBUG_LOG;
  process.env.LOG_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-unit-log-')), 'debug.log');
}

// --- theme art validator: WebP probe + warnings ------------------------------------
{
  const { probeWebp, sniffKind } = await import('../dist/themes.js');
  const riff = (fourcc, payload) => {
    const size = Buffer.alloc(4); size.writeUInt32LE(payload.length, 0);
    return Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from(fourcc), size, payload]);
  };
  const vp8 = riff('VP8 ', Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x02, 0x00, 0x02, 0x00]));
  check('probe VP8 512', JSON.stringify(probeWebp(vp8)) === JSON.stringify({ w: 512, h: 512 }));
  const vp8l = Buffer.concat([riff('VP8L', Buffer.from([0x2f, 0xff, 0xc1, 0x7f, 0x00])), Buffer.alloc(8)]);
  check('probe VP8L 512', JSON.stringify(probeWebp(vp8l)) === JSON.stringify({ w: 512, h: 512 }));
  const xpix = Buffer.alloc(3); xpix.writeUIntLE(904, 0, 3);
  const ypix = Buffer.alloc(3); ypix.writeUIntLE(882, 0, 3);
  const vp8x = riff('VP8X', Buffer.concat([Buffer.from([0x10, 0, 0, 0]), xpix, ypix]));
  check('probe VP8X 905x883', JSON.stringify(probeWebp(vp8x)) === JSON.stringify({ w: 905, h: 883 }));
  check('probe garbage null', probeWebp(Buffer.from('definitely not an image file....')) === null);
  check('probe truncated null', probeWebp(Buffer.alloc(10)) === null);
  check('sniff png/jpeg/webp', sniffKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])) === 'png'
    && sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0])) === 'jpeg'
    && sniffKind(vp8) === 'webp' && sniffKind(Buffer.from('xyz')) === null);
}
{
  // Warnings fire for bad geometry, weight, and renamed uploads.
  const { discoverThemes } = await import('../dist/themes.js');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-art-'));
  fs.mkdirSync(path.join(base, 'odd'), { recursive: true });
  const riff = (fourcc, payload) => {
    const size = Buffer.alloc(4); size.writeUInt32LE(payload.length, 0);
    return Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from(fourcc), size, payload]);
  };
  const tall = (w, h) => riff('VP8 ', Buffer.concat([Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a]), Buffer.from([w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff]), Buffer.from([0])]));
  fs.writeFileSync(path.join(base, 'odd', 'odd-center.webp'), tall(100, 200)); // small + not square
  const heavy = Buffer.concat([tall(512, 512), Buffer.alloc(90 * 1024)]); // valid dims, overweight
  fs.writeFileSync(path.join(base, 'odd', 'odd-tile-blue.webp'), heavy);
  fs.writeFileSync(path.join(base, 'odd', 'odd-tile-red.webp'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])); // renamed PNG
  const [t] = discoverThemes(base);
  const w = t.warnings.join('|');
  check('warns geometry+weight+rename', /not square/.test(w) && /small/.test(w) && /heavy/.test(w) && /PNG renamed/.test(w));
  check('missing listed', t.missing.includes('brown') && !t.missing.includes('blue'));
  fs.rmSync(base, { recursive: true, force: true });
}
{
  const { discoverThemes, isKnownStyle, prettifyThemeName } = await import('../dist/themes.js');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-themes-'));
  fs.mkdirSync(path.join(base, 'discworld'), { recursive: true });
  fs.writeFileSync(path.join(base, 'discworld', 'discworld-center.webp'), 'x');
  fs.writeFileSync(path.join(base, 'discworld', 'discworld-tile-blue.webp'), 'x');
  fs.writeFileSync(path.join(base, 'discworld', 'notes.txt'), 'x');
  fs.writeFileSync(path.join(base, 'flat-center.webp'), 'x');
  const found = discoverThemes(base);
  const ids = found.map((t) => t.id).sort();
  check('discovers nested + flat themes', JSON.stringify(ids) === JSON.stringify(['discworld', 'flat']));
  const dw = found.find((t) => t.id === 'discworld');
  check('discworld center + tiles', dw?.center === '/themes/discworld/discworld-center.webp' && dw.tiles.includes('blue') && dw.tileArt.blue === '/themes/discworld/discworld-tile-blue.webp');
  check('ignores non-center files', !found.some((t) => t.id === 'notes'));
  check('prettify', prettifyThemeName('dinosaur-park') === 'Dinosaur Park');
  check('builtin known', isKnownStyle('city', base) === true);
  check('discovered known', isKnownStyle('discworld', base) === true);
  check('bogus rejected', isKnownStyle('maze', base) === false && isKnownStyle('', base) === false && isKnownStyle(null, base) === false);
  check('missing dir safe', discoverThemes(path.join(base, 'nope')).length === 0);
  fs.rmSync(base, { recursive: true, force: true });
}

// --- hygiene: expiry rules on fixture rooms ----------------------------------------
{
  const { sweepRooms } = await import('../dist/core/hygiene.js');
  const H = 60 * 60 * 1000;
  const now = Date.now();
  const seat = (connected) => ({ id: `h_${Math.random()}`, connected });
  const fixture = (code, status, idleMs, conns) => {
    const room = {
      code, status, players: conns.map(seat), turnIndex: 0, dice: [1, 1],
      lastRoll: null, lastCard: null, pendingBuy: null, trades: [], auction: null,
      buildings: {}, turnDeadline: null, auctionQueue: [], lastActivity: now - idleMs,
      pausedAt: null, boardStyle: 'grandprix', log: [], winnerId: null,
      turnCount: 1, rollingId: null, rev: 0,
    };
    rooms.set(code, room);
    return room;
  };
  fixture('HZ-OLD-LOBBY', 'lobby', 5 * H, [true]);
  fixture('HZ-FRESH-LOBBY', 'lobby', 10 * 60 * 1000, [true]);
  fixture('HZ-DONE', 'finished', 31 * 60 * 1000, [false]);
  fixture('HZ-DONE-FRESH', 'finished', 5 * 60 * 1000, [false]);
  fixture('HZ-DEAD-GAME', 'playing', 3 * H, [false, false]);
  fixture('HZ-IDLE-GAME', 'playing', 30 * 60 * 1000, [false, false]);
  fixture('HZ-LIVE-GAME', 'playing', 10 * H, [true, false]);
  fixture('HZ-PAUSED-DEAD', 'paused', 3 * H, [false]);
  const purged = sweepRooms(now).sort();
  check('hygiene purges stale set',
    JSON.stringify(purged) === JSON.stringify(['HZ-DEAD-GAME', 'HZ-DONE', 'HZ-OLD-LOBBY', 'HZ-PAUSED-DEAD']));
  check('hygiene keeps live set',
    rooms.has('HZ-FRESH-LOBBY') && rooms.has('HZ-DONE-FRESH') && rooms.has('HZ-IDLE-GAME') && rooms.has('HZ-LIVE-GAME'));
  for (const c of ['HZ-FRESH-LOBBY', 'HZ-DONE-FRESH', 'HZ-IDLE-GAME', 'HZ-LIVE-GAME']) {
    rooms.delete(c);
    forgetRoom(c);
  }
}
{
  // Purge clears a pending turn timer with the room.
  const { sweepRooms } = await import('../dist/core/hygiene.js');
  const { armTurnTimer } = await import('../dist/core/timers.js');
  const { turnTimers: tt } = await import('../dist/store.js');
  const H = 60 * 60 * 1000;
  const now = Date.now();
  const room = {
    code: 'HZ-TIMER', status: 'playing',
    players: [{ id: 'h_t1', connected: true }, { id: 'h_t2', connected: true }],
    turnIndex: 0, dice: [1, 1], lastRoll: null, lastCard: null, pendingBuy: null,
    trades: [], auction: null, buildings: {}, turnDeadline: null, auctionQueue: [],
    lastActivity: now - 3 * H, pausedAt: null, boardStyle: 'grandprix', log: [],
    winnerId: null, turnCount: 1, rollingId: null, rev: 0,
  };
  rooms.set(room.code, room);
  armTurnTimer(room); // connected current → real 60s timer
  const armed = tt.has(room.code);
  room.players.forEach((p) => { p.connected = false; });
  sweepRooms(now);
  check('hygiene purge clears timer', armed && !tt.has(room.code) && !rooms.has(room.code));
  forgetRoom(room.code);
}
{
  // Over-cap evicts oldest non-playing first, never playing.
  const { sweepRooms } = await import('../dist/core/hygiene.js');
  const now = Date.now();
  const mk = (code, status, age) => rooms.set(code, {
    code, status, players: [{ id: `${code}p`, connected: status === 'playing' }],
    turnIndex: 0, dice: [1, 1], lastRoll: null, lastCard: null, pendingBuy: null,
    trades: [], auction: null, buildings: {}, turnDeadline: null, auctionQueue: [],
    lastActivity: now - age, pausedAt: null, boardStyle: 'grandprix', log: [],
    winnerId: null, turnCount: 1, rollingId: null, rev: 0,
  });
  mk('HZ-CAP-OLD', 'lobby', 3000);
  mk('HZ-CAP-NEW', 'lobby', 1000);
  mk('HZ-CAP-PLAY', 'playing', 2000);
  mk('HZ-CAP-DONE', 'finished', 500);
  const purged = sweepRooms(now, 3);
  check('hygiene cap evicts oldest non-playing', purged.length === 1 && purged[0] === 'HZ-CAP-OLD' && rooms.has('HZ-CAP-PLAY'));
  for (const c of ['HZ-CAP-NEW', 'HZ-CAP-PLAY', 'HZ-CAP-DONE']) { rooms.delete(c); forgetRoom(c); }
}

// --- history is a safe no-op without DATABASE_URL --------------------------------
// (DATABASE_URL is deleted at the top of this file, mirroring dev/test runs)
{
  const r = mkRoom({ log: [{ id: 'h1', text: 'hi', at: Date.now(), tone: 'info', turn: 1, cat: 'info' }] });
  const t0 = Date.now();
  await flushHistory(r); // must resolve fast, never throw
  check('history flush no-op unconfigured', Date.now() - t0 < 2000);
  const rows = await readHistory(r.code, 10);
  check('history read empty unconfigured', Array.isArray(rows) && rows.length === 0);
  forgetHistory(r.code);
  check('history forget no-throw', true);
  cleanup(r);
}

// --- bots ----------------------------------------------------------------------
// Brown set is tiles [1, 3] (both houseCost $50).
{
  check('shouldBuy keeps buffer', shouldBuy(500, 400) === true && shouldBuy(450, 400) === false && shouldBuy(500, 400) === true);
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true, properties: [1, 3], cash: 1000 }), mkPlayer(1), mkPlayer(2)] });
  const me = r.players[0];
  check('pickBuildTile picks cheapest lowest', pickBuildTile(r, me) === 1);
  me.mortgaged.push(3);
  check('pickBuildTile blocked by mortgage', pickBuildTile(r, me) === null);
  me.mortgaged = [];
  r.buildings = { 1: 5, 3: 5 };
  check('pickBuildTile maxed hotel', pickBuildTile(r, me) === null);
  r.buildings = { 1: 2, 3: 1 };
  check('pickBuildTile respects even build', pickBuildTile(r, me) === 3);
  me.cash = 10;
  check('pickBuildTile needs buffer', pickBuildTile(r, me) === null);
  me.cash = 1000;
  r.buildings = {};
  check('pickMortgageTile first bare deed', pickMortgageTile(r, me) === 1);
  me.mortgaged.push(1);
  check('pickMortgageTile skips mortgaged', pickMortgageTile(r, me) === 3);
  r.buildings = { 3: 1 };
  check('pickMortgageTile skips built set', pickMortgageTile(r, me) === null);
  cleanup(r);
}
{
  // Full atomic turn smoke: bot rolls, resolves, and passes the turn.
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true }), mkPlayer(1), mkPlayer(2)] });
  const before = r.turnCount;
  botTakeTurn(r, r.players[0]);
  check('botTakeTurn advances', r.turnCount === before + 1 && r.turnIndex === 1 && r.status === 'playing');
  cleanup(r);
}
{
  // Flight recorder: buy + build show up in the trace (brown set owned).
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true, properties: [1, 3], cash: 1000, position: 6, hasRolled: true }), mkPlayer(1), mkPlayer(2)] });
  r.pendingBuy = 6; // Oriental Ave $100 — affordable
  const trace = [];
  botTakeTurn(r, r.players[0], trace);
  const kinds = trace.map((e) => e.t).join(',');
  check('trace records buy', trace.some((e) => e.t === 'buy' && e.ok && e.detail.includes('Oriental')));
  check('trace records build + end', kinds.includes('build') && kinds.endsWith('end'));
  check('trace entries shaped', trace.every((e) => typeof e.detail === 'string' && typeof e.ok === 'boolean'));
  cleanup(r);
}
{
  // Unmortgage cheapest-first while rich; nothing when poor.
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true, properties: [1, 3], mortgaged: [1, 3], cash: 1000 }), mkPlayer(1), mkPlayer(2)] });
  const me = r.players[0];
  check('pickUnmortgageTile cheapest', pickUnmortgageTile(r, me) === 1);
  me.cash = 100;
  check('pickUnmortgageTile poor', pickUnmortgageTile(r, me) === null);
  me.cash = 1000;
  const trace = [];
  botTakeTurn(r, me, trace);
  check('bot unmortgages when rich', me.mortgaged.length === 0 && trace.some((e) => e.t === 'unmortgage'));
  cleanup(r);
}
{
  // Flight recorder: pass records fate (opens auction here — cleared below).
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true, cash: 50, position: 6, hasRolled: true }), mkPlayer(1), mkPlayer(2)] });
  r.pendingBuy = 6;
  const trace = [];
  botTakeTurn(r, r.players[0], trace);
  const pass = trace.find((e) => e.t === 'pass');
  check('trace records pass fate', !!pass && pass.ok && pass.detail.includes('fate=open'));
  cleanup(r);
}
{
  // Scheduler arms for bot seats, clears for humans.
  const rb = mkRoom({ players: [mkPlayer(0, { isBot: true }), mkPlayer(1), mkPlayer(2)] });
  pokeBot(rb);
  const armed = botTimers.has(rb.code);
  clearBotTimer(rb.code);
  check('pokeBot arms bot turn', armed && !botTimers.has(rb.code));
  cleanup(rb);
  const rh = mkRoom();
  pokeBot(rh);
  check('pokeBot ignores humans', !botTimers.has(rh.code));
  cleanup(rh);
}

// --- auctions: never clobber, never double-sell ---------------------------------
{
  const r = mkRoom();
  check('pass opens when slot free', queueOrOpenAuction(r, 1, 'u_p0') === 'open' && r.auction?.tile === 1);
  check('pass queues behind live auction',
    queueOrOpenAuction(r, 3, 'u_p1') === 'queued' && r.auction?.tile === 1 && r.auctionQueue.includes(3));
  // A second pass for the SAME tile doesn't duplicate the queue entry.
  queueOrOpenAuction(r, 3, 'u_p1');
  check('queue dedupes tile', r.auctionQueue.filter((t) => t === 3).length === 1);
  cleanup(r);
}
{
  const r = mkRoom({ players: [mkPlayer(0, { properties: [1] }), mkPlayer(1), mkPlayer(2)] });
  check('owned deed dropped', queueOrOpenAuction(r, 1, 'u_p0') === 'dropped' && r.auction === null);
  cleanup(r);
}
{
  // Highest bid wins a bank deed.
  const r = mkRoom();
  const now = Date.now();
  r.auction = { id: 'a1', tile: 1, startedBy: 'u_p0', bids: [{ playerId: 'u_p1', amount: 50, at: now }], endsAt: now + 30000 };
  resolveAuction(r.code, 'a1');
  const p1 = r.players[1];
  check('auction awards bank deed', p1.properties.includes(1) && p1.cash === 1450 && r.auction === null);
  cleanup(r);
}
{
  // Empty auction drains the queue into the slot.
  const r = mkRoom({ auctionQueue: [3] });
  const now = Date.now();
  r.auction = { id: 'a3', tile: 1, startedBy: 'u_p0', bids: [], endsAt: now + 30000 };
  resolveAuction(r.code, 'a3');
  check('resolve drains queue', r.auction?.tile === 3 && r.auctionQueue.length === 0);
  cleanup(r);
}
{
  // Deed sold mid-auction (buy during the 30s window) voids the award.
  const r = mkRoom({ players: [mkPlayer(0, { properties: [1] }), mkPlayer(1), mkPlayer(2)] });
  const now = Date.now();
  const cashBefore = r.players[1].cash;
  r.auction = { id: 'a2', tile: 1, startedBy: 'u_p0', bids: [{ playerId: 'u_p1', amount: 50, at: now }], endsAt: now + 30000 };
  resolveAuction(r.code, 'a2');
  check('auction voids sold deed',
    !r.players[1].properties.includes(1) && r.players[1].cash === cashBefore && r.auction === null);
  cleanup(r);
}

// --- auction freeze: no turns while the hammer is down ---------------------------
// Wire the test double for the turn clock (mirrors index.ts boot wiring).
let armCalls = 0;
injectAuctionClock(
  (room) => { armCalls++; room.turnDeadline = Date.now() + 60000; },
  (code) => clearTurnTimer(code),
);
{
  // Opening freezes a live clock.
  const r = mkRoom();
  armTurnTimer(r);
  const { turnTimers: tt } = await import('../dist/store.js');
  const hadTimer = tt.has(r.code);
  openAuction(r, 1, 'u_p0');
  check('open freezes clock', hadTimer && !tt.has(r.code) && r.turnDeadline === null && r.auction?.tile === 1);
  cleanup(r);
}
{
  // Arming into a live auction stays frozen.
  const now = Date.now();
  const r = mkRoom();
  r.auction = { id: 'fz', tile: 1, startedBy: 'u_p0', bids: [], endsAt: now + 30000 };
  armTurnTimer(r);
  const { turnTimers: tt } = await import('../dist/store.js');
  check('arm frozen during auction', !tt.has(r.code) && r.turnDeadline === null);
  cleanup(r);
}
{
  // Resolve with a free slot re-arms the clock.
  const before = armCalls;
  const r = mkRoom();
  const now = Date.now();
  r.auction = { id: 'rz', tile: 1, startedBy: 'u_p0', bids: [], endsAt: now + 30000 };
  resolveAuction(r.code, 'rz');
  check('resolve re-arms clock', r.auction === null && armCalls === before + 1 && r.turnDeadline > now);
  cleanup(r);
}
{
  // Resolve into a chained auction stays frozen.
  const before = armCalls;
  const r = mkRoom({ auctionQueue: [3] });
  const now = Date.now();
  r.auction = { id: 'ch', tile: 1, startedBy: 'u_p0', bids: [], endsAt: now + 30000 };
  resolveAuction(r.code, 'ch');
  check('chained resolve stays frozen', r.auction?.tile === 3 && armCalls === before && r.turnDeadline === null);
  cleanup(r);
}
{
  // Bots wait for the gavel too.
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true }), mkPlayer(1), mkPlayer(2)] });
  const now = Date.now();
  r.auction = { id: 'bt', tile: 1, startedBy: 'u_p1', bids: [], endsAt: now + 30000 };
  pokeBot(r);
  const tc = r.turnCount;
  botAct(r.code, tc);
  check('bots frozen during auction', !botTimers.has(r.code) && r.turnCount === tc);
  cleanup(r);
}

for (const l of results) console.log(l);
if (rooms.size !== 0) { console.log(`FAIL cleanup leaked ${rooms.size} room(s)`); process.exitCode = 1; }
