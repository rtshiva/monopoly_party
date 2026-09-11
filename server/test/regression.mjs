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
  check('watchRoom', (await emit(s2, 'watchRoom', { code })).ok === true);
  const s3 = await connect();
  check('rejoin with key', (await emit(s3, 'rejoin', { code, playerId: idA, key: keyA })).ok === true);
  check('rejoin without key rejected', (await emit(s3, 'rejoin', { code, playerId: idA })).error === 'NO_CONTROL');
  check('non-host start rejected', (await emit(s2, 'startGame', { code, playerId: idB, key: keyB })).error === 'NOT_HOST');
  check('startGame by host', (await emit(s1, 'startGame', { code, playerId: idA, key: keyA })).ok === true);
  await sleep(300);
  check('deadline armed', typeof room.turnDeadline === 'number' && room.turnDeadline > Date.now());
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
