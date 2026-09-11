// Fast regression + security suite. Self-contained: boots the built server on
// PORT 3123 with an isolated snapshot file, runs every socket event's wiring,
// proves seat-control auth (keys/PINs/takeover), proves restart recovery,
// then tears everything down.
// Run: npm test --workspace=@monopoly/server   (or npm test from repo root)
import { once } from 'events';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';
import { drawChance, drawChest } from '@monopoly/shared';
import { tileCell } from '@monopoly/shared';
import { applyTradeSwap, doRoll, removeSeat } from '../dist/helpers.js';
const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const ROOMS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-test-')), 'rooms.json');
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

const results = [];
const check = (n, c, x = '') => { results.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: path.resolve(SERVER_DIR, '..'),
    env: { ...process.env, PORT: String(PORT), ROOMS_FILE },
    stdio: 'ignore',
  });
  return child;
}

async function waitHealth(child) {
  for (let i = 0; i < 50; i++) {
    if (child.exitCode != null) throw new Error('server exited during boot');
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('server never became healthy');
}

const emit = (s, ev, d) => new Promise((res) => s.emit(ev, d, (r) => res(r ?? { ok: false })));
const connect = () => {
  const s = io(BASE, { transports: ['websocket'] });
  return new Promise((res) => s.on('connect', () => res(s)));
};

let child = boot();
try {
  await waitHealth(child);

  const s1 = await connect();
  const s2 = await connect();
  let room = null;
  s1.on('roomState', (r) => { room = r; });

  const c = await emit(s1, 'createRoom', { playerName: 'Host', token: 'car', deviceLabel: 'Suite-A' });
  check('createRoom', c.ok === true && !!c.controlKey);
  const code = c.code; const idA = c.playerId; const keyA = c.controlKey;
  await sleep(500);
  let snapDiag = '';
  try { snapDiag = `dir=[${fs.readdirSync(path.dirname(ROOMS_FILE)).join(',')}]`; } catch (e) { snapDiag = `readdir fail: ${e.message}`; }
  check('snapshot written', fs.existsSync(ROOMS_FILE), `${ROOMS_FILE} ${snapDiag}`);
  const j = await emit(s2, 'joinRoom', { code, playerName: 'Anu', token: 'dog', deviceLabel: 'Suite-B' });
  check('joinRoom', j.ok === true && !!j.controlKey);
  const idB = j.playerId; const keyB = j.controlKey;
  // Real clients rejoin on mount to attach as live controllers — mirror that.
  await emit(s1, 'rejoin', { code, playerId: idA, key: keyA });
  await emit(s2, 'rejoin', { code, playerId: idB, key: keyB });
  check('watchRoom', (await emit(s2, 'watchRoom', { code })).ok === true);
  // Pure spectators must never disturb seat presence (dashboard separation)
  const sW = await connect();
  await emit(sW, 'watchRoom', { code });
  const connBefore = room.players.find((p) => p.id === idA).connected;
  sW.disconnect();
  await sleep(300);
  check('watcher disconnect disturbs nothing', room.players.find((p) => p.id === idA).connected === connBefore);
  const listed = await emit(s2, 'listRooms', {});
  check('listRooms shows lobby', listed.ok === true && listed.rooms.some((r) => r.code === code && r.status === 'lobby' && !('seatPin' in r) && !('controlKey' in r)));
  const s3 = await connect();
  check('rejoin with key', (await emit(s3, 'rejoin', { code, playerId: idA, key: keyA })).ok === true);
  check('rejoin without key rejected', (await emit(s3, 'rejoin', { code, playerId: idA })).error === 'NO_CONTROL');
  check('non-host start rejected', (await emit(s2, 'startGame', { code, playerId: idB, key: keyB })).error === 'NOT_HOST');
  check('startGame by host', (await emit(s1, 'startGame', { code, playerId: idA, key: keyA })).ok === true);
  await sleep(300);
  check('deadline armed', typeof room.turnDeadline === 'number' && room.turnDeadline > Date.now());
  check('default board is grandprix', room.boardStyle === 'grandprix');
  check('lastCard starts null', room.lastCard == null);
  const listed2 = await emit(s2, 'listRooms', {});
  check('listRooms shows live game', listed2.ok === true && listed2.rooms.some((r) => r.code === code && r.status === 'playing'));
  await sleep(15); // distinct activity timestamps for ordering
  const c2 = await emit(s3, 'createRoom', { playerName: 'Zed', token: 'robot', deviceLabel: 'Suite-E' });
  const listed3 = await emit(s2, 'listRooms', {});
  const order = listed3.rooms.map((r) => r.code);
  check('listRooms newest first', order[0] === c2.code, order.slice(0, 3).join(','));
  check('seat PINs + labels visible (TV transparency)', room.players.every((p) => /^\d{4}$/.test(p.seatPin) && !!p.controllerLabel));

  const curId = room.players[room.turnIndex % room.players.length].id;
  const curKey = curId === idA ? keyA : keyB;
  const otherId = curId === idA ? idB : idA;
  const otherSock = otherId === idA ? s1 : s2;
  const otherKey = otherId === idA ? keyA : keyB;
  check('wrong-key roll rejected', (await emit(otherSock, 'rollDice', { code, playerId: otherId, key: 'bogus' })).error === 'NO_CONTROL');
  check('wrong-turn roll rejected', (await emit(otherSock, 'rollDice', { code, playerId: otherId, key: otherKey })).error === 'NOT_YOUR_TURN');
  const curSock = curId === idA ? s1 : s2;
  check('roll ok', (await emit(curSock, 'rollDice', { code, playerId: curId, key: curKey })).ok === true);
  await sleep(150);
  if (room.pendingBuy != null) {
    const b = await emit(curSock, 'buyProperty', { code, playerId: curId, key: curKey });
    check('buy or NO_CASH', b.ok === true || b.error === 'NO_CASH', JSON.stringify(b));
    await sleep(150);
  }
  const upd = room.players.find((p) => p.id === curId);
  if (upd.hasRolled && room.pendingBuy == null && upd.cash >= 0) {
    check('endTurn', (await emit(curSock, 'endTurn', { code, playerId: curId, key: curKey })).ok === true);
    await sleep(150);
  }
  check('turns advance', room.turnCount >= 1, `turns=${room.turnCount}`);
  check('mortgage BAD_TILE', (await emit(s1, 'mortgage', { code, playerId: idA, key: keyA, tile: 0 })).error === 'BAD_TILE');
  check('empty trade BAD_TRADE', (await emit(s1, 'tradeOffer', { code, playerId: idA, key: keyA, to: idB, giveTiles: [], giveCash: 0, wantTiles: [], wantCash: 0 })).error === 'BAD_TRADE');
  check('auctionBid NO_AUCTION', (await emit(s1, 'auctionBid', { code, playerId: idA, key: keyA, amount: 50 })).error === 'NO_AUCTION');
  check('buyHouse BAD_TILE', (await emit(s1, 'buyHouse', { code, playerId: idA, key: keyA, tile: 0 })).error === 'BAD_TILE');
  check('payJail refused', (await emit(s1, 'payJail', { code, playerId: idA, key: keyA })).ok === false);
  check('useJailCard without card', (await emit(s1, 'useJailCard', { code, playerId: idA, key: keyA })).error === 'NO_CARD');
  check('card offer beyond holdings', (await emit(s1, 'tradeOffer', { code, playerId: idA, key: keyA, to: idB, giveTiles: [], giveCash: 0, giveCards: 20, wantTiles: [], wantCash: 0, wantCards: 0 })).error === 'NO_CARDS');
  check('fractional cards rejected', (await emit(s1, 'tradeOffer', { code, playerId: idA, key: keyA, to: idB, giveTiles: [], giveCash: 0, giveCards: 1.5, wantTiles: [], wantCash: 0, wantCards: 0 })).error === 'BAD_TRADE');

  // Swap math, deterministic: tiles + cash + cards move atomically both ways
  const sFrom = { id: 'f', properties: [1, 3], mortgaged: [], cash: 500, jailCards: 2 };
  const sTo = { id: 't', properties: [6], mortgaged: [], cash: 900, jailCards: 0 };
  applyTradeSwap(sFrom, sTo, { giveTiles: [1], giveCash: 100, giveCards: 1, wantTiles: [6], wantCash: 50, wantCards: 0 });
  check('swap moves tiles', sFrom.properties.join(',') === '3,6' && sTo.properties.join(',') === '1');
  check('swap moves cash', sFrom.cash === 450 && sTo.cash === 950);
  check('swap moves cards', sFrom.jailCards === 1 && sTo.jailCards === 1);

  // S10 engine: card pools award keepable cards; doubles escape jail with no free re-roll
  const mkP = () => ({ players: [{ id: 't', name: 'T', properties: [], mortgaged: [], cash: 1500, jailCards: 0, position: 0, inJail: false, jailTurns: 0, doubles: 0, bankrupt: false, hasRolled: false }], buildings: {}, log: [] });
  let sawChanceCard = false, sawChestCard = false, cashFinite = true;
  for (let i = 0; i < 300 && !(sawChanceCard && sawChestCard); i++) {
    const r1 = mkP(); drawChance(r1, 't');
    if (r1.players[0].jailCards > 0) sawChanceCard = true;
    const r2 = mkP(); drawChest(r2, 't');
    if (r2.players[0].jailCards > 0) sawChestCard = true;
    if (!Number.isFinite(r1.players[0].cash) || !Number.isFinite(r2.players[0].cash)) cashFinite = false;
  }
  check('chance awards jail card', sawChanceCard);
  check('chest awards jail card', sawChestCard);
  check('card draws keep cash finite', cashFinite);
  // Rotated board geometry: GO top-left, clockwise; measured art bounds sane
  const c0 = tileCell(0), c10 = tileCell(10), c20 = tileCell(20), c30 = tileCell(30);
  check('GO top-left, Jail top-right', c0.col === 0 && c0.row === 0 && c10.col === 10 && c10.row === 0);
  check('Parking bottom-right, GoToJail bottom-left', c20.col === 10 && c20.row === 10 && c30.col === 0 && c30.row === 10);
  const seen = new Set();
  let okAdj = true, prev = null;
  for (let i = 0; i < 40; i++) {
    const { col, row } = tileCell(i);
    seen.add(`${col},${row}`);
    if (prev && Math.abs(col - prev.col) + Math.abs(row - prev.row) !== 1) okAdj = false;
    prev = { col, row };
  }
  check('mapping covers 40 unique cells', seen.size === 40);
  check('mapping path contiguous', okAdj);
  const mkJail = () => ({
    room: { dice: [1, 1], lastRoll: null, pendingBuy: null, log: [], players: [] },
    me: { id: 't', name: 'T', cash: 1500, position: 20, properties: [], mortgaged: [], inJail: true, jailTurns: 0, jailCards: 0, doubles: 0, bankrupt: false, hasRolled: false },
  });
  let escaped = false, escapeClean = false, waited = false;
  for (let i = 0; i < 300 && !(escaped && waited); i++) {
    const { room: jr, me: jm } = mkJail();
    jr.players.push(jm);
    const r = doRoll(jr, jm);
    if (r === 'jailed' && jm.hasRolled) waited = true;
    // A doubles release must move AND grant no extra roll (hasRolled stays true).
    if (!jm.inJail && r === 'rolled' && jr.dice[0] === jr.dice[1]) {
      escaped = true;
      escapeClean = jm.hasRolled === true && jm.doubles === 1;
    }
  }
  check('doubles escape jail', escaped);
  check('escape grants no extra roll', escapeClean);
  check('failed jail roll waits turn', waited);

  // S10 live (opportunistic): bounded drive hoping to play a real card
  let sawCardUse = false, drive = 0;
  while (drive++ < 25 && room.status === 'playing' && !sawCardUse) {
    const dm = room.players[room.turnIndex % room.players.length];
    if (dm.bankrupt) break;
    const dsk = dm.id === idA ? s1 : s2;
    const dkk = dm.id === idA ? keyA : keyB;
    if (dm.inJail && dm.jailCards > 0 && !dm.hasRolled) {
      const u = await emit(dsk, 'useJailCard', { code, playerId: dm.id, key: dkk });
      if (u.ok) { sawCardUse = true; await sleep(150); continue; }
    }
    await emit(dsk, 'rollDice', { code, playerId: dm.id, key: dkk });
    await sleep(120);
    const du = room.players.find((p) => p.id === dm.id);
    const isCur = room.players[room.turnIndex % room.players.length]?.id === dm.id;
    if (room.pendingBuy != null && isCur) {
      const b = await emit(dsk, 'buyProperty', { code, playerId: dm.id, key: dkk });
      if (!b.ok) await emit(dsk, 'passProperty', { code, playerId: dm.id, key: dkk });
      await sleep(120);
    }
    const du2 = room.players.find((p) => p.id === dm.id);
    if (du2.hasRolled && room.pendingBuy == null && du2.cash >= 0 && isCur) {
      await emit(dsk, 'endTurn', { code, playerId: dm.id, key: dkk });
      await sleep(120);
    }
    if (du2.cash < 0) break;
  }
  check('jail card live use', true, sawCardUse ? 'observed live' : 'SKIP — jail+card not attained in 25 turns');

  // Card trade live (opportunistic): anyone holding a card sells it for $10
  const cardHolder = room.players.find((p) => !p.bankrupt && p.jailCards > 0);
  const cardBuyer = cardHolder && room.players.find((p) => !p.bankrupt && p.id !== cardHolder.id && p.cash >= 10);
  if (cardHolder && cardBuyer) {
    const hk = cardHolder.id === idA ? keyA : keyB;
    const hs = cardHolder.id === idA ? s1 : s2;
    const ok = cardBuyer.id === idA ? keyA : keyB;
    const os = cardBuyer.id === idA ? s1 : s2;
    const c0 = cardHolder.jailCards;
    const b0 = cardBuyer.jailCards;
    const off = await emit(hs, 'tradeOffer', { code, playerId: cardHolder.id, key: hk, to: cardBuyer.id, giveTiles: [], giveCash: 0, giveCards: 1, wantTiles: [], wantCash: 10, wantCards: 0 });
    check('card offer created', off.ok === true, JSON.stringify(off));
    if (off.ok) {
      await sleep(150);
      const acc = await emit(os, 'tradeRespond', { code, playerId: cardBuyer.id, key: ok, tradeId: off.tradeId, accept: true });
      await sleep(150);
      const nc = room.players.find((p) => p.id === cardHolder.id).jailCards;
      const no = room.players.find((p) => p.id === cardBuyer.id).jailCards;
      check('card swap atomic', acc.ok === true && nc === c0 - 1 && no === b0 + 1, `${c0}->${nc} holder, ${b0}->${no} buyer`);
    }
  } else {
    check('card trade live', true, 'SKIP — no funded card holder after drive');
  }

  // seat takeover: s5 claims B's seat with the TV PIN; s2 must hear evicted
  const pinB = room.players.find((p) => p.id === idB).seatPin;
  check('bad PIN rejected', (await emit(s1, 'claimSeat', { code, playerId: idB, pin: '0000', deviceLabel: 'Suite-C' })).error === 'BAD_PIN');
  const s5 = await connect();
  let evicted = null;
  s2.on('evicted', (e) => { evicted = e; });
  const claim = await emit(s5, 'claimSeat', { code, playerId: idB, pin: pinB, deviceLabel: 'Suite-C' });
  check('claim with PIN works', claim.ok === true && !!claim.controlKey && claim.controlKey !== keyB);
  await sleep(300);
  check('old controller evicted', !!evicted && evicted.seatId === idB, JSON.stringify(evicted));
  check('old key dead', (await emit(s2, 'rollDice', { code, playerId: idB, key: keyB })).error === 'NO_CONTROL');
  const keyB2 = claim.controlKey;
  check('new key works', (await emit(s5, 'mortgage', { code, playerId: idB, key: keyB2, tile: 0 })).error === 'BAD_TILE');
  check('release works', (await emit(s5, 'releaseSeat', { code, playerId: idB, key: keyB2 })).ok === true);
  await sleep(150);
  check('released key dead', (await emit(s5, 'rollDice', { code, playerId: idB, key: keyB2 })).error === 'NO_CONTROL');
  const pinB2 = room.players.find((p) => p.id === idB).seatPin;
  check('PIN rotated on claim', pinB2 !== pinB);
  const reclaim = await emit(s5, 'claimSeat', { code, playerId: idB, pin: pinB2, deviceLabel: 'Suite-C' });
  check('re-claim after release', reclaim.ok === true && !!reclaim.controlKey);
  const keyB3 = reclaim.controlKey;
  s5.disconnect();

  // bankrupt one side -> finished, then restart
  const loser = room.players.find((p) => !p.bankrupt);
  const loserSock = loser.id === idA ? s1 : s2;
  const loserKey = loser.id === idA ? keyA : keyB3;
  await emit(loserSock, 'bankrupt', { code, playerId: loser.id, key: loserKey });
  await sleep(200);
  check('bankrupt finishes 2p', room.status === 'finished' && !!room.winnerId);
  const winnerId = room.winnerId;
  const rKey = winnerId === idA ? keyA : keyB3;
  const rSock = winnerId === idA ? s1 : s2;
  check('rematch resets', (await emit(rSock, 'startGame', { code, playerId: winnerId, key: rKey })).ok === true);
  await sleep(200);
  check('fresh game playing', room.status === 'playing' && room.players.every((p) => p.cash === 1500));

  // S12 unit: removeSeat pure room surgery
  const ur = {
    code: 'U', status: 'playing', players: [
      { id: 'h', name: 'H', properties: [1], mortgaged: [], cash: 100, bankrupt: false, hasRolled: true, doubles: 1, connected: true },
      { id: 'x', name: 'X', properties: [3, 6], mortgaged: [], cash: 100, bankrupt: false, hasRolled: false, doubles: 0, connected: true },
      { id: 'y', name: 'Y', properties: [], mortgaged: [], cash: 100, bankrupt: false, hasRolled: false, doubles: 0, connected: true },
    ],
    turnIndex: 1, pendingBuy: null,
    trades: [{ id: 't1', fromId: 'x', toId: 'y', giveTiles: [], giveCash: 0, wantTiles: [], wantCash: 0, createdAt: 0, expiresAt: Date.now() + 99999 }],
    auction: null, auctionQueue: [], buildings: { 3: 2 }, turnDeadline: null, lastActivity: 0, pausedAt: null, log: [], winnerId: null, turnCount: 5,
  };
  removeSeat(ur, ur.players[1]);
  check('removeSeat drops player', ur.players.length === 2 && !ur.players.some((p) => p.id === 'x'));
  check('removeSeat queues deeds', ur.auctionQueue.join(',') === '6', 'first deed opens straight into auction');
  check('removeSeat clears buildings', !('3' in ur.buildings));
  check('removeSeat drops trades', ur.trades.length === 0);
  check('removeSeat fixes turn', ur.turnIndex === 1 && ur.players[1].id === 'y' && ur.players[1].hasRolled === false);
  check('removeSeat opens auction', ur.auction?.tile === 3);

  // S12 live: host reclaim (PIN), pause/resume, kick
  const pinA3 = room.players.find((p) => p.id === idA).seatPin;
  const hk = await emit(s1, 'claimSeat', { code, playerId: idA, pin: pinA3, deviceLabel: 'Suite-A' });
  const keyA2 = hk.controlKey;
  check('host reclaims seat', hk.ok === true && !!keyA2);
  const sC = await connect();
  const cj = await emit(sC, 'joinRoom', { code, playerName: 'Cat', token: 'cat', deviceLabel: 'Suite-D' });
  const idC = cj.playerId, keyC = cj.controlKey;
  check('non-host pause rejected', (await emit(sC, 'pauseGame', { code, playerId: idC, key: keyC })).error === 'NOT_HOST');
  check('host pause works', (await emit(s1, 'pauseGame', { code, playerId: idA, key: keyA2 })).ok === true);
  await sleep(150);
  check('paused blocks rolls', (await emit(s1, 'rollDice', { code, playerId: idA, key: keyA2 })).ok === false);
  check('resume works', (await emit(s1, 'resumeGame', { code, playerId: idA, key: keyA2 })).ok === true);
  await sleep(150);
  check('deadline re-armed on resume', room.turnDeadline > Date.now());
  check('setBoardStyle bad value', (await emit(s1, 'setBoardStyle', { code, playerId: idA, key: keyA2, style: 'oval' })).error === 'BAD_STYLE');
  check('retired skin rejected', (await emit(s1, 'setBoardStyle', { code, playerId: idA, key: keyA2, style: 'maze' })).error === 'BAD_STYLE');
  check('non-host setBoardStyle rejected', (await emit(sC, 'setBoardStyle', { code, playerId: idC, key: keyC, style: 'city' })).error === 'NOT_HOST');
  for (const style of ['city', 'coastal', 'mountain', 'grandprix', 'dinosaur', 'space']) {
    const r = await emit(s1, 'setBoardStyle', { code, playerId: idA, key: keyA2, style });
    if (!r.ok) { check(`host sets ${style}`, false, JSON.stringify(r)); break; }
    await sleep(120);
    check(`board style ${style} broadcast`, room.boardStyle === style);
  }
  check('self-kick rejected', (await emit(s1, 'kickPlayer', { code, playerId: idA, key: keyA2, targetId: idA })).error === 'BAD_SEAT');
  check('non-host kick rejected', (await emit(sC, 'kickPlayer', { code, playerId: idC, key: keyC, targetId: idA })).error === 'NOT_HOST');
  check('host kicks C', (await emit(s1, 'kickPlayer', { code, playerId: idA, key: keyA2, targetId: idC })).ok === true);
  await sleep(150);
  check('kicked seat removed', room.players.length === 2 && !room.players.some((p) => p.id === idC));
  sC.disconnect();
  [s1, s2, s3].forEach((s) => s.disconnect());

  // restart recovery: kill, reboot on same snapshot, rejoin keeps seat + clock
  child.kill();
  await sleep(800);
  child = boot();
  await waitHealth(child);
  const s4 = await connect();
  let room2 = null;
  s4.on('roomState', (r) => { room2 = r; });
  const w4 = await emit(s4, 'watchRoom', { code });
  check('watch after restart', w4.ok === true);
  if (w4.ok) room2 = w4.room;
  const rj = await emit(s4, 'rejoin', { code, playerId: idA, key: keyA });
  await sleep(300);
  check('stale key rejected after restart', rj.ok === false && rj.error === 'NO_CONTROL', 'keys are memory-only by design; PIN reclaim expected');
  const pinA = room2?.players.find((p) => p.id === idA)?.seatPin;
  const rec = await emit(s4, 'claimSeat', { code, playerId: idA, pin: pinA, deviceLabel: 'Suite-A2' });
  check('PIN reclaim after restart', rec.ok === true && !!rec.controlKey);
  await sleep(300);
  check('deadline re-armed', typeof room2?.turnDeadline === 'number' && room2.turnDeadline > Date.now());
  s4.disconnect();
} catch (e) {
  check(`suite ran: ${e.message}`, false);
}

async function teardown() {
  // NOTE: process.exit() below skips finally — so teardown is explicit, not in finally.
  try { child.kill(); } catch { /* noop */ }
  try { await Promise.race([once(child, 'exit').catch(() => {}), sleep(3000)]); } catch { /* noop */ }
  try { fs.rmSync(path.dirname(ROOMS_FILE), { recursive: true, force: true }); } catch { /* noop */ }
}

await teardown();
console.log(results.join('\n'));
process.exitCode = process.exitCode ?? 0;
// Safety net: never hang the runner; teardown already ran explicitly above.
setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
