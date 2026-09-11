// Fast regression suite. Self-contained: boots the built server on PORT 3123
// with an isolated snapshot file, runs every socket event's wiring, proves
// restart recovery, then tears everything down.
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

  const c = await emit(s1, 'createRoom', { playerName: 'Host', token: 'car' });
  check('createRoom', c.ok === true);
  const code = c.code; const idA = c.playerId;
  await sleep(500);
  let snapDiag = '';
  try { snapDiag = `dir=[${fs.readdirSync(path.dirname(ROOMS_FILE)).join(',')}]`; } catch (e) { snapDiag = `readdir fail: ${e.message}`; }
  check('snapshot written', fs.existsSync(ROOMS_FILE), `${ROOMS_FILE} ${snapDiag}`);
  const j = await emit(s2, 'joinRoom', { code, playerName: 'Anu', token: 'dog' });
  check('joinRoom', j.ok === true);
  const idB = j.playerId;
  check('watchRoom', (await emit(s2, 'watchRoom', { code })).ok === true);
  const s3 = await connect();
  check('rejoin', (await emit(s3, 'rejoin', { code, playerId: idA })).ok === true);
  check('startGame', (await emit(s1, 'startGame', { code })).ok === true);
  await sleep(300);
  check('deadline armed', typeof room.turnDeadline === 'number' && room.turnDeadline > Date.now());

  const curId = room.players[room.turnIndex % room.players.length].id;
  const otherId = curId === idA ? idB : idA;
  const otherSock = otherId === idA ? s1 : s2;
  check('wrong-turn roll rejected', (await emit(otherSock, 'rollDice', { code, playerId: otherId })).error === 'NOT_YOUR_TURN');
  const curSock = curId === idA ? s1 : s2;
  check('roll ok', (await emit(curSock, 'rollDice', { code, playerId: curId })).ok === true);
  await sleep(150);
  if (room.pendingBuy != null) {
    const b = await emit(curSock, 'buyProperty', { code, playerId: curId });
    check('buy or NO_CASH', b.ok === true || b.error === 'NO_CASH', JSON.stringify(b));
    await sleep(150);
  }
  const upd = room.players.find((p) => p.id === curId);
  if (upd.hasRolled && room.pendingBuy == null && upd.cash >= 0) {
    check('endTurn', (await emit(curSock, 'endTurn', { code, playerId: curId })).ok === true);
    await sleep(150);
  }
  check('turns advance', room.turnCount >= 1, `turns=${room.turnCount}`);
  check('mortgage BAD_TILE', (await emit(s1, 'mortgage', { code, playerId: idA, tile: 0 })).error === 'BAD_TILE');
  check('empty trade BAD_TRADE', (await emit(s1, 'tradeOffer', { code, playerId: idA, to: idB, giveTiles: [], giveCash: 0, wantTiles: [], wantCash: 0 })).error === 'BAD_TRADE');
  check('auctionBid NO_AUCTION', (await emit(s1, 'auctionBid', { code, playerId: idA, amount: 50 })).error === 'NO_AUCTION');
  check('buyHouse BAD_TILE', (await emit(s1, 'buyHouse', { code, playerId: idA, tile: 0 })).error === 'BAD_TILE');
  check('payJail refused', (await emit(s1, 'payJail', { code, playerId: idA })).ok === false);

  // bankrupt one side -> finished, then restart
  const loser = room.players.find((p) => !p.bankrupt);
  const loserSock = loser.id === idA ? s1 : s2;
  await emit(loserSock, 'bankrupt', { code, playerId: loser.id });
  await sleep(200);
  check('bankrupt finishes 2p', room.status === 'finished' && !!room.winnerId);
  check('rematch resets', (await emit(s1, 'startGame', { code })).ok === true);
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
  const rj = await emit(s4, 'rejoin', { code, playerId: idA });
  await sleep(300);
  check('rejoin after restart', rj.ok === true && room2?.status === 'playing');
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
