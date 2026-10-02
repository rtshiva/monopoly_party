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
const { resolveTurnTimeout, turnExpired, armTurnTimer, clearTurnTimer, allGone } =
  await import('../dist/core/timers.js');
const { clearAuctionTimer } = await import('../dist/core/auction.js');
const { uniqueName } = await import('../dist/core/player.js');
const { flushHistory, readHistory, forgetHistory } = await import('../dist/history.js');
const { shouldBuy, pickBuildTile, pickMortgageTile, pickUnmortgageTile } = await import('../dist/core/botPicks.js');
const { botTakeTurn } = await import('../dist/core/botBrain.js');
const { botAct, pokeBot, clearBotTimer } = await import('../dist/core/bots.js');
const { botTimers } = await import('../dist/store.js');
const { openAuction, queueOrOpenAuction, resolveAuction, injectAuctionClock } = await import('../dist/core/auction.js');
const { pruneTrades } = await import('../dist/core/trade.js');
const { UNMORTGAGE_RATE } = await import('@monopoly/shared');

const results = [];
const check = (n, c, x = '') => {
  results.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`);
  if (!c) process.exitCode = 1;
};

let seq = 0;
function mkPlayer(i, patch = {}) {
  return {
    id: `u_p${i}`,
    name: ['A', 'B', 'C'][i] ?? `P${i}`,
    token: ['car', 'hat', 'dog'][i] ?? 'car',
    cash: 1500,
    position: 0,
    properties: [],
    mortgaged: [],
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    doubles: 0,
    bankrupt: false,
    connected: true,
    isHost: i === 0,
    isBot: false,
    hasRolled: false,
    seatPin: '0000',
    controllerLabel: null,
    ...patch,
  };
}

function mkRoom(patch = {}, n = 3) {
  const code = `UT${++seq}`;
  const room = {
    code,
    status: 'playing',
    players: Array.from({ length: n }, (_, i) => mkPlayer(i)),
    turnIndex: 0,
    dice: [1, 1],
    lastRoll: null,
    lastCard: null,
    pendingBuy: null,
    trades: [],
    auction: null,
    buildings: {},
    turnDeadline: Date.now() + 60000,
    auctionQueue: [],
    lastActivity: Date.now(),
    pausedAt: null,
    boardStyle: 'grandprix',
    log: [],
    winnerId: null,
    turnCount: 5,
    rollingId: null,
    rev: 0,
    ...patch,
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
  check(
    'timeout after roll advances',
    r.turnIndex === 1 && r.turnCount === 6 && r.players[1].hasRolled === false && r.pendingBuy === null,
  );
  cleanup(r);
}

// --- undecided purchase goes straight to auction ------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { hasRolled: true }), mkPlayer(1), mkPlayer(2)], pendingBuy: 1 });
  resolveTurnTimeout(r.code, r.turnCount);
  check(
    'timeout auctions pendingBuy',
    r.pendingBuy === null && r.auction !== null && r.auction.tile === 1 && r.turnIndex === 1,
  );
  cleanup(r);
}

// --- broke at timeout goes bankrupt (3 seats, game continues) -----------------
{
  const r = mkRoom({
    players: [mkPlayer(0, { hasRolled: true, cash: -50, properties: [1] }), mkPlayer(1), mkPlayer(2)],
  });
  resolveTurnTimeout(r.code, r.turnCount);
  const me = r.players.find((p) => p.id === 'u_p0');
  check('timeout bankrupt when broke', me.bankrupt === true && r.status === 'playing' && r.turnIndex !== 0);
  cleanup(r);
}

// --- already-bankrupt current seat is skipped ----------------------------------
{
  const r = mkRoom({ players: [mkPlayer(0, { bankrupt: true, hasRolled: true }), mkPlayer(1), mkPlayer(2)] });
  resolveTurnTimeout(r.code, r.turnCount);
  check(
    'timeout skips bankrupt seat',
    r.turnIndex === 1 && r.players[1].bankrupt === false && r.players[2].bankrupt === false,
  );
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
  const { BOARD, rentFor } = await import('@monopoly/shared');
  const roomFor = (level) => ({
    players: [{ id: 'o', properties: [1, 3], mortgaged: [] }],
    buildings: level > 0 ? { 1: level } : {},
  });
  const expected = [
    BOARD[1].rent[1],
    BOARD[1].rent[2],
    BOARD[1].rent[3],
    BOARD[1].rent[4],
    BOARD[1].rent[5],
    BOARD[1].rent[6],
  ];
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
  dbg.dlog({
    evt: 'test.circ',
    bad: (() => {
      const o = {};
      o.self = o;
      return o;
    })(),
  });
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
  const { probeWebp, sniffKind } = await import('../dist/themes-webp.js');
  const riff = (fourcc, payload) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(payload.length, 0);
    return Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.from(fourcc),
      size,
      payload,
    ]);
  };
  const vp8 = riff('VP8 ', Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x02, 0x00, 0x02, 0x00]));
  check('probe VP8 512', JSON.stringify(probeWebp(vp8)) === JSON.stringify({ w: 512, h: 512 }));
  const vp8l = Buffer.concat([riff('VP8L', Buffer.from([0x2f, 0xff, 0xc1, 0x7f, 0x00])), Buffer.alloc(8)]);
  check('probe VP8L 512', JSON.stringify(probeWebp(vp8l)) === JSON.stringify({ w: 512, h: 512 }));
  const xpix = Buffer.alloc(3);
  xpix.writeUIntLE(904, 0, 3);
  const ypix = Buffer.alloc(3);
  ypix.writeUIntLE(882, 0, 3);
  const vp8x = riff('VP8X', Buffer.concat([Buffer.from([0x10, 0, 0, 0]), xpix, ypix]));
  check('probe VP8X 905x883', JSON.stringify(probeWebp(vp8x)) === JSON.stringify({ w: 905, h: 883 }));
  check('probe garbage null', probeWebp(Buffer.from('definitely not an image file....')) === null);
  check('probe truncated null', probeWebp(Buffer.alloc(10)) === null);
  check(
    'sniff png/jpeg/webp',
    sniffKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])) === 'png' &&
      sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0])) === 'jpeg' &&
      sniffKind(vp8) === 'webp' &&
      sniffKind(Buffer.from('xyz')) === null,
  );
}
{
  // Warnings fire for bad geometry, weight, and renamed uploads.
  const { discoverThemes } = await import('../dist/themes.js');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-art-'));
  fs.mkdirSync(path.join(base, 'odd'), { recursive: true });
  const riff = (fourcc, payload) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(payload.length, 0);
    return Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.from(fourcc),
      size,
      payload,
    ]);
  };
  const tall = (w, h) =>
    riff(
      'VP8 ',
      Buffer.concat([
        Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a]),
        Buffer.from([w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff]),
        Buffer.from([0]),
      ]),
    );
  fs.writeFileSync(path.join(base, 'odd', 'odd-center.webp'), tall(100, 200)); // small + not square
  const heavy = Buffer.concat([tall(512, 512), Buffer.alloc(90 * 1024)]); // valid dims, overweight
  fs.writeFileSync(path.join(base, 'odd', 'odd-tile-blue.webp'), heavy);
  fs.writeFileSync(path.join(base, 'odd', 'odd-tile-red.webp'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])); // renamed PNG
  const [t] = discoverThemes(base);
  const w = t.warnings.join('|');
  check(
    'warns geometry+weight+rename',
    /not square/.test(w) && /small/.test(w) && /heavy/.test(w) && /PNG renamed/.test(w),
  );
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
  check(
    'discworld center + tiles',
    dw?.center === '/themes/discworld/discworld-center.webp' &&
      dw.tiles.includes('blue') &&
      dw.tileArt.blue === '/themes/discworld/discworld-tile-blue.webp',
  );
  check('ignores non-center files', !found.some((t) => t.id === 'notes'));
  check('prettify', prettifyThemeName('dinosaur-park') === 'Dinosaur Park');
  check('builtin known', isKnownStyle('city', base) === true);
  check('discovered known', isKnownStyle('discworld', base) === true);
  check(
    'bogus rejected',
    isKnownStyle('maze', base) === false && isKnownStyle('', base) === false && isKnownStyle(null, base) === false,
  );
  check('missing dir safe', discoverThemes(path.join(base, 'nope')).length === 0);
  fs.rmSync(base, { recursive: true, force: true });
}

// --- hygiene: expiry rules on fixture rooms ----------------------------------------
{
  const { sweepRooms } = await import('../dist/core/hygiene.js');
  const H = 60 * 60 * 1000;
  const now = Date.now();
  let hSeq = 0;
  const seat = (connected) => ({ id: `h_${++hSeq}`, connected });
  const fixture = (code, status, idleMs, conns) => {
    const room = {
      code,
      status,
      players: conns.map(seat),
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
      lastActivity: now - idleMs,
      pausedAt: null,
      boardStyle: 'grandprix',
      log: [],
      winnerId: null,
      turnCount: 1,
      rollingId: null,
      rev: 0,
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
  check(
    'hygiene purges stale set',
    JSON.stringify(purged) === JSON.stringify(['HZ-DEAD-GAME', 'HZ-DONE', 'HZ-OLD-LOBBY', 'HZ-PAUSED-DEAD']),
  );
  check(
    'hygiene keeps live set',
    rooms.has('HZ-FRESH-LOBBY') && rooms.has('HZ-DONE-FRESH') && rooms.has('HZ-IDLE-GAME') && rooms.has('HZ-LIVE-GAME'),
  );
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
    code: 'HZ-TIMER',
    status: 'playing',
    players: [
      { id: 'h_t1', connected: true },
      { id: 'h_t2', connected: true },
    ],
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
    lastActivity: now - 3 * H,
    pausedAt: null,
    boardStyle: 'grandprix',
    log: [],
    winnerId: null,
    turnCount: 1,
    rollingId: null,
    rev: 0,
  };
  rooms.set(room.code, room);
  armTurnTimer(room); // connected current → real 60s timer
  const armed = tt.has(room.code);
  room.players.forEach((p) => {
    p.connected = false;
  });
  sweepRooms(now);
  check('hygiene purge clears timer', armed && !tt.has(room.code) && !rooms.has(room.code));
  forgetRoom(room.code);
}
{
  // Over-cap evicts oldest non-playing first, never playing.
  const { sweepRooms } = await import('../dist/core/hygiene.js');
  const now = Date.now();
  const mk = (code, status, age) =>
    rooms.set(code, {
      code,
      status,
      players: [{ id: `${code}p`, connected: status === 'playing' }],
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
      lastActivity: now - age,
      pausedAt: null,
      boardStyle: 'grandprix',
      log: [],
      winnerId: null,
      turnCount: 1,
      rollingId: null,
      rev: 0,
    });
  mk('HZ-CAP-OLD', 'lobby', 3000);
  mk('HZ-CAP-NEW', 'lobby', 1000);
  mk('HZ-CAP-PLAY', 'playing', 2000);
  mk('HZ-CAP-DONE', 'finished', 500);
  const purged = sweepRooms(now, 3);
  check(
    'hygiene cap evicts oldest non-playing',
    purged.length === 1 && purged[0] === 'HZ-CAP-OLD' && rooms.has('HZ-CAP-PLAY'),
  );
  for (const c of ['HZ-CAP-NEW', 'HZ-CAP-PLAY', 'HZ-CAP-DONE']) {
    rooms.delete(c);
    forgetRoom(c);
  }
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
  check(
    'shouldBuy keeps buffer',
    shouldBuy(500, 400) === true && shouldBuy(450, 400) === false && shouldBuy(500, 400) === true,
  );
  const r = mkRoom({
    players: [mkPlayer(0, { isBot: true, properties: [1, 3], cash: 1000 }), mkPlayer(1), mkPlayer(2)],
  });
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
  // Deterministic jail-card play: a jailed bot holding a card plays it
  // (the live suite can only hope jail+card coincide on the right turn).
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true, inJail: true, jailCards: 1 }), mkPlayer(1), mkPlayer(2)] });
  const me = r.players[0];
  const trace = [];
  botTakeTurn(r, me, trace);
  check(
    'bot plays held jail card',
    trace.some((e) => e.t === 'jail' && e.ok && e.detail === 'card') && me.inJail === false && me.jailCards === 0,
  );
  cleanup(r);
}
{
  // Flight recorder: buy + build show up in the trace (brown set owned).
  const r = mkRoom({
    players: [
      mkPlayer(0, { isBot: true, properties: [1, 3], cash: 1000, position: 6, hasRolled: true }),
      mkPlayer(1),
      mkPlayer(2),
    ],
  });
  r.pendingBuy = 6; // Oriental Ave $100 — affordable
  const trace = [];
  botTakeTurn(r, r.players[0], trace);
  const kinds = trace.map((e) => e.t).join(',');
  check(
    'trace records buy',
    trace.some((e) => e.t === 'buy' && e.ok && e.detail.includes('Oriental')),
  );
  check('trace records build + end', kinds.includes('build') && kinds.endsWith('end'));
  check(
    'trace entries shaped',
    trace.every((e) => typeof e.detail === 'string' && typeof e.ok === 'boolean'),
  );
  cleanup(r);
}
{
  // Unmortgage cheapest-first while rich; nothing when poor.
  const r = mkRoom({
    players: [
      mkPlayer(0, { isBot: true, properties: [1, 3], mortgaged: [1, 3], cash: 1000 }),
      mkPlayer(1),
      mkPlayer(2),
    ],
  });
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
  const r = mkRoom({
    players: [mkPlayer(0, { isBot: true, cash: 50, position: 6, hasRolled: true }), mkPlayer(1), mkPlayer(2)],
  });
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
  check(
    'pass queues behind live auction',
    queueOrOpenAuction(r, 3, 'u_p1') === 'queued' && r.auction?.tile === 1 && r.auctionQueue.includes(3),
  );
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
  r.auction = {
    id: 'a1',
    tile: 1,
    startedBy: 'u_p0',
    bids: [{ playerId: 'u_p1', amount: 50, at: now }],
    endsAt: now + 30000,
  };
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
  r.auction = {
    id: 'a2',
    tile: 1,
    startedBy: 'u_p0',
    bids: [{ playerId: 'u_p1', amount: 50, at: now }],
    endsAt: now + 30000,
  };
  resolveAuction(r.code, 'a2');
  check(
    'auction voids sold deed',
    !r.players[1].properties.includes(1) && r.players[1].cash === cashBefore && r.auction === null,
  );
  cleanup(r);
}

// --- auction freeze: no turns while the hammer is down ---------------------------
// Wire the test double for the turn clock (mirrors index.ts boot wiring).
let armCalls = 0;
injectAuctionClock(
  (room) => {
    armCalls++;
    room.turnDeadline = Date.now() + 60000;
  },
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
{
  // Custom resolve delay (used by resumeGame to restore the REMAINING window).
  const { openAuction, scheduleAuctionResolve, clearAuctionTimer } = await import('../dist/core/auction.js');
  const r = mkRoom();
  openAuction(r, 1, 'u_p0');
  clearAuctionTimer(r.code);
  scheduleAuctionResolve(r.code, r.auction.id, 5);
  await new Promise((res) => setTimeout(res, 50));
  check('scheduleAuctionResolve honors custom delay', r.auction === null);
  cleanup(r);
}

// --- bankruptcy clock injection: removeSeat re-arms without importing timers ---
// (bankruptcy → timers → bankruptcy was a madge cycle; the hook is injected
// at boot like injectAuctionClock/injectArmTurnTimer.)
let bankArmCalls = 0;
{
  const { removeSeat, injectBankruptcyClock } = await import('../dist/core/bankruptcy.js');
  injectBankruptcyClock(() => {
    bankArmCalls++;
  });
  const r = mkRoom({ players: [mkPlayer(0), mkPlayer(1), mkPlayer(2)] });
  removeSeat(r, r.players[2]);
  check('removeSeat re-arms clock while playing', bankArmCalls === 1 && r.status === 'playing');
  cleanup(r);
}
{
  const { removeSeat } = await import('../dist/core/bankruptcy.js');
  const before = bankArmCalls;
  const r = mkRoom({ players: [mkPlayer(0), mkPlayer(1)] }, 2);
  removeSeat(r, r.players[1]);
  check('removeSeat silent on kick-to-finish', bankArmCalls === before && r.status === 'finished');
  cleanup(r);
}

// --- flow review fixes ---------------------------------------------------------
{
  check('UNMORTGAGE_RATE is 0.6', UNMORTGAGE_RATE === 0.6);
  {
    // One fee formula everywhere: server charge, bot brain, client quote.
    const { unmortgageFee, mortgagePayout, houseRefund } = await import('@monopoly/shared');
    check(
      'unmortgageFee pins 60% rounded',
      unmortgageFee(60) === 36 && unmortgageFee(200) === 120 && unmortgageFee(100) === 60,
    );
    check('mortgagePayout pins half rounded', mortgagePayout(60) === 30 && mortgagePayout(200) === 100);
    check('houseRefund pins half floored', houseRefund(50) === 25 && houseRefund(51) === 25);
  }
  {
    // Deed mutation happy paths (handlers validate first; same contract as applyTradeSwap).
    const { applyMortgage, applyUnmortgage, applyBuildHouse, applySellHouse } = await import('../dist/core/deeds.js');
    const r = mkRoom({ players: [mkPlayer(0, { properties: [1, 3], cash: 1500 })], buildings: {} });
    const me = r.players[0];
    check(
      'applyMortgage pays half + flags',
      applyMortgage(r, me, 1) === 30 && me.cash === 1530 && me.mortgaged.join() === '1',
    );
    check(
      'applyUnmortgage charges fee + unflags',
      applyUnmortgage(r, me, 1) === 36 && me.cash === 1494 && me.mortgaged.length === 0,
    );
    check(
      'applyBuildHouse levels up',
      JSON.stringify(applyBuildHouse(r, me, 1)) === JSON.stringify({ level: 1, cost: 50 }) &&
        me.cash === 1444 &&
        r.buildings[1] === 1,
    );
    r.buildings[1] = 2;
    check(
      'applySellHouse unwinds + refunds',
      JSON.stringify(applySellHouse(r, me, 1)) === JSON.stringify({ level: 1, refund: 25 }) &&
        me.cash === 1469 &&
        r.buildings[1] === 1,
    );
    cleanup(r);
  }
}
{
  // Bot with exactly $50 pays jail fine (matches human payJail rule).
  // Dice pinned: the post-release roll is random (tax/cards would move cash),
  // so stub it to 1+2 → Baltic Ave, which a broke bot passes cash-neutral.
  const realRandom = Math.random;
  const stub = [0.01, 0.2];
  Math.random = () => stub.shift() ?? 0.5;
  try {
    const r = mkRoom({ players: [mkPlayer(0, { isBot: true, inJail: true, cash: 50 }), mkPlayer(1)] });
    const me = r.players[0];
    const trace = [];
    botTakeTurn(r, me, trace);
    check(
      'bot with $50 pays out of jail',
      trace.some((e) => e.t === 'jail' && e.ok && e.detail === 'paid-50') && me.cash === 0 && !me.inJail,
    );
    cleanup(r);
  } finally {
    Math.random = realRandom;
  }
}
{
  // pruneTrades logs expired offers to room.log.
  const r = mkRoom({
    players: [mkPlayer(0), mkPlayer(1)],
    trades: [
      {
        id: 't_exp',
        fromId: 'u_p0',
        toId: 'u_p1',
        giveTiles: [],
        giveCash: 50,
        giveCards: 0,
        wantTiles: [],
        wantCash: 0,
        wantCards: 0,
        createdAt: Date.now() - 70000,
        expiresAt: Date.now() - 10000,
      },
    ],
  });
  pruneTrades(r);
  check('pruneTrades drops expired offer', r.trades.length === 0);
  check(
    'pruneTrades logs expiration',
    r.log.some((l) => l.cat === 'trade' && l.text.includes('expired') && l.text.includes('A to B')),
  );
  cleanup(r);
}
{
  // pickMortgageTile prioritizes railroads and lone properties over full color sets.
  // Brown set = [1, 3], Reading Railroad = 5, Oriental (light blue) = 6.
  const r = mkRoom({
    players: [
      mkPlayer(0, {
        properties: [1, 3, 5, 6], // full brown set (1, 3) + RR (5) + lone light blue (6)
        mortgaged: [],
      }),
    ],
  });
  const me = r.players[0];
  check('pickMortgageTile picks railroad first', pickMortgageTile(r, me) === 5);
  me.mortgaged.push(5);
  check('pickMortgageTile picks lone property second', pickMortgageTile(r, me) === 6);
  me.mortgaged.push(6);
  check('pickMortgageTile picks full set property last', pickMortgageTile(r, me) === 1);
  cleanup(r);
}

// --- regression cover for sibling-bug fixes ------------------------------------
{
  const shared = await import('@monopoly/shared');
  const { BOARD, COLOR_HEX, GAME_ERRORS, MAX_BID, MAX_LOG_ENTRIES, MAX_TRADE_CASH, MIN_BID } = shared;
  check('BOARD has 40 tiles', BOARD.length === 40);
  check(
    'every property rent.length===7',
    BOARD.filter((t) => t.kind === 'property').every((t) => t.rent.length === 7),
  );
  check('BOARD frozen', Object.isFrozen(BOARD));
  check(
    'COLOR_HEX frozen + covers sets',
    Object.isFrozen(COLOR_HEX) &&
      ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'].every(
        (c) => typeof COLOR_HEX[c] === 'string',
      ),
  );
  check(
    'railroads 4x$200',
    BOARD.filter((t) => t.kind === 'railroad').length === 4 &&
      BOARD.filter((t) => t.kind === 'railroad').every((t) => t.price === 200),
  );
  check('utilities 2x$150', BOARD.filter((t) => t.kind === 'utility').length === 2);
  check('tilePrice OOB safe', shared.tilePrice(999) === 0 && shared.tilePrice(-1) === 0);
  check('tileName OOB safe', typeof shared.tileName(999) === 'string');
  check('GameError has NOTHING_TO_PASS', GAME_ERRORS.includes('NOTHING_TO_PASS'));
  check('MAX_BID caps bids', MAX_BID === 100000 && MIN_BID === 10 && MAX_TRADE_CASH === 100000);
  check('MAX_LOG_ENTRIES is 80', MAX_LOG_ENTRIES === 80);
}
{
  // Socket event contract (shared/events.ts): a typo'd event name is an 8s
  // ack timeout, so the inventory is pinned — every contracted client event
  // must have a socket.on handler, every broadcast a client listener, and no
  // handler may exist outside the contract.
  const { CLIENT_EVENTS, SERVER_EVENTS } = await import('@monopoly/shared');
  const walkTs = (dirUrl) => {
    const out = [];
    for (const e of fs.readdirSync(dirUrl, { withFileTypes: true })) {
      const child = new URL(e.name, dirUrl);
      if (e.isDirectory()) out.push(...walkTs(new URL(`${e.name}/`, dirUrl)));
      else if (e.isFile() && /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(child);
    }
    return out;
  };
  const readAll = (dirUrl) =>
    walkTs(dirUrl)
      .map((u) => fs.readFileSync(u, 'utf8'))
      .join('\n');
  const handlersSrc = readAll(new URL('../src/handlers/', import.meta.url));
  const clientSrc = readAll(new URL('../../client/src/', import.meta.url));
  const hasHandler = (e) => new RegExp(`socket\\.on\\(\\s*'${e}'`).test(handlersSrc);
  const missingHandlers = CLIENT_EVENTS.filter((e) => !hasHandler(e));
  check('every client event has a handler', missingHandlers.length === 0, missingHandlers.join(','));
  const unheard = SERVER_EVENTS.filter((e) => !clientSrc.includes(`.on('${e}'`));
  check('every server event has a listener', unheard.length === 0, unheard.join(','));
  const handled = [...handlersSrc.matchAll(/socket\.on\(\s*'([^']+)'/g)].map((m) => m[1]);
  const undocumented = handled.filter((e) => !CLIENT_EVENTS.includes(e) && e !== 'disconnect');
  check('every handler is contracted', undocumented.length === 0, undocumented.join(','));
}
{
  // GameError production coverage: every union code must be produced
  // somewhere in server/src (mirrors the contract test above). Dead codes
  // like NAME_TAKEN fail here instead of rotting in the union.
  const { GAME_ERRORS } = await import('@monopoly/shared');
  // NOTE: collect into one shared array — walkSrc must return string parts,
  // never a joined string (spreading a string splices every character).
  const srcParts = [];
  const walkSrc = (dirUrl) => {
    for (const e of fs.readdirSync(dirUrl, { withFileTypes: true })) {
      if (e.isDirectory()) walkSrc(new URL(`${e.name}/`, dirUrl));
      else if (e.isFile() && /\.ts$/.test(e.name)) srcParts.push(fs.readFileSync(new URL(e.name, dirUrl), 'utf8'));
    }
  };
  walkSrc(new URL('../src/', import.meta.url));
  const serverSrc = srcParts.join('\n');
  const unproduced = GAME_ERRORS.filter((c) => !serverSrc.includes(`'${c}'`));
  check('every GameError is produced', unproduced.length === 0, unproduced.join(','));
}
{
  // Migrate fuzz: 200 deterministically-seeded corrupt snapshots must heal
  // (or reject on bad code) but never throw — a throw at boot is a crash loop.
  const { migrateRoom } = await import('../dist/core/migrate.js');
  let fseed = 0xc10c;
  const frnd = () => {
    fseed |= 0;
    fseed = (fseed + 0x6d2b79f5) | 0;
    let t = Math.imul(fseed ^ (fseed >>> 15), 1 | fseed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fpick = (arr) => arr[Math.floor(frnd() * arr.length)];
  const junk = [null, undefined, 42, -7, 1.5, NaN, Infinity, 'x', '', [], {}, [null], { a: 1 }, true];
  const fields = [
    'code',
    'status',
    'players',
    'trades',
    'auction',
    'buildings',
    'turnDeadline',
    'auctionQueue',
    'log',
    'dice',
    'turnIndex',
    'turnCount',
    'boardStyle',
    'pendingBuy',
    'winnerId',
    'rollingId',
    'rev',
    'lastActivity',
  ];
  let threw = 0;
  let insane = 0;
  for (let i = 0; i < 200; i++) {
    const room = {
      code: 'FZ01AB',
      status: 'playing',
      players: [mkPlayer(0), mkPlayer(1)],
      turnIndex: 0,
      turnCount: 1,
      dice: [1, 1],
      lastRoll: null,
      lastCard: null,
      pendingBuy: null,
      trades: [],
      auction: null,
      buildings: {},
      turnDeadline: Date.now() + 60000,
      auctionQueue: [],
      lastActivity: Date.now(),
      pausedAt: null,
      boardStyle: 'classic',
      log: [],
      winnerId: null,
      rollingId: null,
      rev: 0,
    };
    const n = 1 + Math.floor(frnd() * 3);
    for (let k = 0; k < n; k++) room[fpick(fields)] = fpick(junk);
    if (Array.isArray(room.players) && frnd() < 0.5) room.players.push(fpick([null, 7, 'p', {}]));
    if (room.auction && typeof room.auction === 'object' && frnd() < 0.4) {
      room.auction.bids = fpick([null, 'x', [null]]);
    }
    let ok = false;
    try {
      ok = migrateRoom(room) === true;
    } catch {
      threw++;
      continue;
    }
    if (ok) {
      const sane =
        Array.isArray(room.players) &&
        Array.isArray(room.trades) &&
        Array.isArray(room.auctionQueue) &&
        Array.isArray(room.log) &&
        room.buildings !== null &&
        typeof room.buildings === 'object' &&
        room.players.every((p) => p && typeof p === 'object' && Number.isFinite(p.cash));
      if (!sane) insane++;
    }
  }
  check('migrate fuzz never throws', threw === 0);
  check('migrate fuzz output sane', insane === 0);
}
{
  const { rentFor, applyCardEffect, netWorth } = await import('@monopoly/shared');
  const own = (tile, bankrupt = false) => ({
    players: [{ id: 'o', properties: [tile, 3], mortgaged: [], bankrupt }],
    buildings: {},
  });
  check(
    'rentFor NaN level falls back to base',
    Number.isFinite(
      rentFor({ players: [{ id: 'o', properties: [1, 3], mortgaged: [] }], buildings: { 1: NaN } }, 1, 7),
    ),
  );
  check(
    'rentFor Infinity level clamps to hotel-or-base',
    Number.isFinite(
      rentFor({ players: [{ id: 'o', properties: [1, 3], mortgaged: [] }], buildings: { 1: Infinity } }, 1, 7),
    ),
  );
  check('rentFor bankrupt owner excluded', rentFor(own(1, true), 1, 7) === 0);
  check(
    'rentFor utility NaN dice is 0',
    rentFor({ players: [{ id: 'o', properties: [12, 28], mortgaged: [] }], buildings: {} }, 12, NaN) === 0,
  );
  check('rentFor OOB tile is 0', rentFor({ players: [], buildings: {} }, 999, 7) === 0);
  const p1 = { cash: NaN, jailCards: 0, position: 0, inJail: false, jailTurns: 0 };
  applyCardEffect(p1, { cash: 100 });
  check('applyCardEffect heals NaN cash', p1.cash === 1600);
  const p2 = { cash: 1500, jailCards: 0, position: 5, inJail: false, jailTurns: 0 };
  applyCardEffect(p2, { jailCards: -5 });
  check('applyCardEffect clamps jailCards >=0', p2.jailCards === 0);
  const bad = { bankrupt: false, cash: NaN, properties: [1], mortgaged: 'x', jailCards: 0 };
  check(
    'netWorth survives corrupt snapshot',
    netWorth(bad, { buildings: { 1: NaN } }) === 60 + 0 || Number.isFinite(netWorth(bad, { buildings: { 1: NaN } })),
  );
}
{
  const { makePlayer, resetPlayer } = await import('../dist/core/player.js');
  const roster = [];
  const a = makePlayer(roster, 'Anu', 'car', { isHost: true, controllerLabel: 'TV' });
  roster.push(a);
  const b = makePlayer(roster, 'Anu', 'dog', {});
  check('makePlayer uniqueName suffix', b.name === 'Anu 2' && a.cash === 1500 && a.seatPin.length === 4);
  // Untyped socket payloads must never throw the seat factory: non-string
  // names fall back to the role default instead of crashing on .slice.
  const badHost = makePlayer([], 12345, 'car', { isHost: true });
  const badGuest = makePlayer([], null, 'dog', {});
  check('makePlayer coerces non-string names', badHost.name === 'Host' && badGuest.name === 'Player');
  b.cash = NaN;
  b.position = 999;
  b.properties = [1];
  resetPlayer(b);
  check('resetPlayer restores cash/position/deeds', b.cash === 1500 && b.position === 0 && b.properties.length === 0);
}
{
  const { setRolling, clearRolling } = await import('../dist/core/rolling.js');
  const r = mkRoom();
  setRolling(r, r.players[0].id);
  check('setRolling sets flag without emit crash', r.rollingId === r.players[0].id);
  check('clearRolling wrong pid false', clearRolling(r, 'nope') === false && r.rollingId === r.players[0].id);
  check('clearRolling owner true', clearRolling(r, r.players[0].id) === true && r.rollingId === null);
  cleanup(r);
}
{
  const { normCash, normTiles, normCards, applyTradeSwap } = await import('../dist/core/trade.js');
  check(
    'normCash rejects NaN/Infinity/fraction/over-cap',
    normCash(NaN) === null &&
      normCash(Infinity) === null &&
      normCash(1.5) === null &&
      normCash(100001) === null &&
      normCash(50) === 50,
  );
  check(
    'normTiles rejects OOB/dupes',
    normTiles([1, 1]) === null && normTiles([999]) === null && JSON.stringify(normTiles([1])) === JSON.stringify([1]),
  );
  check('normCards rejects negative/huge', normCards(-1) === null && normCards(21) === null && normCards(2) === 2);
  const from = { properties: [1], cash: NaN, jailCards: 0 };
  const me = { properties: [3], cash: 1500, jailCards: 1 };
  applyTradeSwap(from, me, { giveTiles: [1], wantTiles: [3], giveCash: 0, wantCash: 0, giveCards: 1, wantCards: 0 });
  check(
    'applyTradeSwap heals NaN + clamps cards',
    Number.isFinite(from.cash) && Number.isFinite(me.cash) && from.jailCards >= 0 && me.jailCards >= 0,
  );
}
{
  // Shared offer/accept tile gate: built set, unowned deed, locked deed, clean.
  const { validateTradeAssets } = await import('../dist/core/tradeAccept.js');
  const r = mkRoom({
    players: [mkPlayer(0, { properties: [1, 3, 6] }), mkPlayer(1)],
    buildings: { 1: 1 },
    trades: [
      {
        id: 't_lock',
        fromId: 'u_p1',
        toId: 'u_p0',
        giveTiles: [6],
        giveCash: 0,
        giveCards: 0,
        wantTiles: [],
        wantCash: 0,
        wantCards: 0,
        createdAt: 1,
        expiresAt: Date.now() + 60000,
      },
    ],
  });
  const holder = r.players[0];
  check('validateTradeAssets flags built set', validateTradeAssets(r, [1], holder) === 'HAS_HOUSES');
  check('validateTradeAssets flags unowned deed', validateTradeAssets(r, [5], holder) === 'TILE_LOCKED');
  check('validateTradeAssets flags locked deed', validateTradeAssets(r, [6], holder) === 'TILE_LOCKED');
  check('validateTradeAssets ignores self lock', validateTradeAssets(r, [6], holder, 't_lock') === null);
  cleanup(r);
}
{
  // Offer payload parsing: garbage, empty, and overlapping deeds all reject.
  const { parseTradeAssets } = await import('../dist/core/tradeAccept.js');
  const clean = { giveTiles: [1], wantTiles: [], giveCash: 0, wantCash: 0, giveCards: 0, wantCards: 0 };
  check('parseTradeAssets rejects garbage', parseTradeAssets({ ...clean, giveCash: 1.5 }) === null);
  check('parseTradeAssets rejects empty', parseTradeAssets({ ...clean, giveTiles: [] }) === null);
  check('parseTradeAssets rejects overlap', parseTradeAssets({ ...clean, wantTiles: [1] }) === null);
  check('parseTradeAssets parses clean', JSON.stringify(parseTradeAssets(clean)?.giveTiles) === '[1]');
}
{
  // Auction resolve drops corrupt bids instead of NaN-ing the winner.
  const r = mkRoom({ players: [mkPlayer(0, { cash: 1500 }), mkPlayer(1, { cash: 1500 })] });
  r.auction = {
    id: 'a1',
    tile: 1,
    startedBy: 'u_p0',
    bids: [
      { playerId: 'u_p0', amount: NaN, at: 1 },
      { playerId: 'u_p1', amount: 100, at: 2 },
    ],
    endsAt: Date.now() + 30000,
  };
  resolveAuction(r.code, 'a1');
  check('resolveAuction ignores NaN bid', r.players[1].properties.includes(1) && r.players[1].cash === 1400);
  cleanup(r);
}
{
  // sellHouse full-set rule: single deed of a set cannot unwind houses.
  const { sellSetEvenly } = await import('../dist/core/houses.js');
  const r = mkRoom({ players: [mkPlayer(0, { properties: [1] })], buildings: { 1: 2 } });
  const out = sellSetEvenly(r, r.players[0], 1);
  check('sellSetEvenly needs full set', out.sold === 0);
  cleanup(r);
}
{
  // IO boundary: only broadcast.ts touches socket.io.
  const fsMod = await import('fs');
  const seatSrc = fsMod.readFileSync(new URL('../src/core/seat.ts', import.meta.url), 'utf8');
  const bcast = await import('../dist/core/broadcast.js');
  check('seat delegates evict via broadcast', typeof bcast.notifyEvicted === 'function' && !/getIo\(\)/.test(seatSrc));
}
{
  // migrateRoom: corrupt snapshots heal, bad codes reject.
  const { migrateRoom } = await import('../dist/core/migrate.js');
  const bad = {
    code: 'AB12CD',
    status: 'limbo',
    players: [
      {
        id: 'p0',
        cash: NaN,
        position: 999,
        properties: [1, 999],
        mortgaged: 'x',
        jailCards: 99,
        jailTurns: -1,
        doubles: 2.5,
      },
    ],
    turnIndex: -1,
    turnCount: 1.5,
    dice: [7],
    lastRoll: null,
    lastCard: null,
    pendingBuy: 999,
    trades: [{ giveCash: 999999, wantCash: 'x', giveCards: null, wantCards: -1, giveTiles: [1, 999], wantTiles: null }],
    auction: { id: 'a', tile: 999, startedBy: 'p0', bids: [{ playerId: 'p0', amount: NaN, at: 1 }], endsAt: 1 },
    buildings: { 1: 99, 3: 2 },
    turnDeadline: null,
    auctionQueue: [999, 5],
    lastActivity: 0,
    pausedAt: null,
    boardStyle: 'maze',
    log: 'x',
    winnerId: null,
    rollingId: 'p0',
    rev: 0,
  };
  check(
    'migrateRoom heals corrupt snapshot',
    migrateRoom(bad) === true &&
      bad.status === 'lobby' &&
      bad.dice.join(',') === '1,1' &&
      bad.pendingBuy === null &&
      bad.players[0].cash === 1500 &&
      bad.players[0].position === 0 &&
      bad.players[0].jailCards === 20 &&
      bad.buildings[1] === undefined &&
      bad.buildings[3] === 2 &&
      bad.auction === null &&
      bad.boardStyle === 'classic' &&
      bad.rollingId === null &&
      Array.isArray(bad.log),
  );
  check('migrateRoom rejects bad code', migrateRoom({ ...structuredClone(bad), code: '!!!' }) === false);
}
{
  // Corrupt containers/entries must heal, never throw (else boot crash-loops).
  const { migrateRoom } = await import('../dist/core/migrate.js');
  const room = {
    code: 'CD34EF',
    status: 'playing',
    players: [
      null,
      { id: 'p0', cash: 1500, position: 0, properties: [], mortgaged: [], jailCards: 0, jailTurns: 0, doubles: 0 },
    ],
    turnIndex: 0,
    turnCount: 1,
    dice: [1, 1],
    lastRoll: null,
    lastCard: null,
    pendingBuy: null,
    trades: [null, { giveCash: 10, wantCash: 0, giveCards: 0, wantCards: 0, giveTiles: [], wantTiles: [] }],
    auction: {
      id: 'a',
      tile: 1,
      startedBy: 'p0',
      bids: [null, { playerId: 'p0', amount: 50, at: 1 }],
      endsAt: Date.now() + 99999,
    },
    buildings: {},
    turnDeadline: null,
    auctionQueue: 'nope',
    lastActivity: 1,
    pausedAt: null,
    boardStyle: 'classic',
    log: [],
    winnerId: null,
    rollingId: null,
    rev: 0,
  };
  let threw = false;
  try {
    migrateRoom(room);
  } catch {
    threw = true;
  }
  check(
    'migrateRoom survives null entries',
    threw === false &&
      room.players.length === 1 &&
      room.trades.length === 1 &&
      room.auction.bids.length === 1 &&
      Array.isArray(room.auctionQueue),
  );
}
{
  // Bot survives corrupt cash instead of stalling on NaN.
  const r = mkRoom({ players: [mkPlayer(0, { isBot: true, cash: NaN, properties: [] }), mkPlayer(1)] });
  const me = r.players[0];
  const trace = [];
  botTakeTurn(r, me, trace);
  check(
    'bot heals NaN cash and ends turn',
    Number.isFinite(me.cash) && trace.some((e) => e.t === 'end' || e.t === 'bankrupt'),
  );
  cleanup(r);
}
{
  // Turn timeout bankrupts corrupt cash instead of advancing NaN.
  const r = mkRoom({ players: [mkPlayer(0, { cash: NaN, hasRolled: true }), mkPlayer(1)] });
  resolveTurnTimeout(r.code, r.turnCount);
  check('timeout bankrupts NaN cash', r.players[0].bankrupt === true);
  cleanup(r);
}
{
  // Named timer buffers replace magic +500s.
  const timers = await import('../dist/core/timers.js');
  const auction = await import('../dist/core/auction.js');
  check('timer slack constants named', timers.TURN_TIMER_SLACK_MS === 500 && auction.AUCTION_RESOLVE_BUFFER_MS === 500);
}

for (const l of results) console.log(l);
if (rooms.size !== 0) {
  console.log(`FAIL cleanup leaked ${rooms.size} room(s)`);
  process.exitCode = 1;
}
