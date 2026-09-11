import { BOARD, drawChance, drawChest, ownerOf, rentFor, rollD6 } from '@monopoly/shared';
import { AUCTION_DURATION_MS, GO_SALARY, JAIL_FINE, OFFLINE_TURN_MS, TURN_MS } from '@monopoly/shared';
import type { Auction, Player, RoomState, TradeOffer } from '@monopoly/shared';
import { auctionTimers, clearControllerSocket, dropControl, genPin, getIo, issueControl, rooms, seatKeys, seatSockets, turnTimers, uid } from './store.js';
import { saveRooms } from './persist.js';

// ---------- seat control (identity vs capability) ----------
// player.id is public (display). Acting requires the seat's secret key,
// which is issued only to the controlling device and never broadcast.

export function requireControl(room: RoomState, playerId: unknown, key: unknown): Player | null {
  if (typeof playerId !== 'string' || typeof key !== 'string' || !key) return null;
  const me = room.players.find((p) => p.id === playerId);
  if (!me || me.bankrupt) return null;
  return seatKeys.get(room.code)?.get(me.id) === key ? me : null;
}

export function controllerSocketOf(code: string, playerId: string): string | undefined {
  return seatSockets.get(code)?.get(playerId);
}

export function setControllerSocket(code: string, playerId: string, socketId: string) {
  let m = seatSockets.get(code);
  if (!m) { m = new Map(); seatSockets.set(code, m); }
  m.set(playerId, socketId);
}

/** Evict the previous controller socket when it isn't the new one. */
export function evictPreviousController(code: string, playerId: string, socketId: string, byLabel: string) {
  const prev = controllerSocketOf(code, playerId);
  if (prev && prev !== socketId) {
    getIo().to(prev).emit('evicted', { seatId: playerId, by: byLabel });
  }
  setControllerSocket(code, playerId, socketId);
}

export { clearControllerSocket, dropControl, genPin, issueControl };

// ---------- rooms / players ----------

export function makeCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(c)) return makeCode();
  return c;
}

const VALID_TOKENS: Player['token'][] = ['car', 'hat', 'dog', 'ship', 'cat', 'balloon', 'robot', 'crown'];
export function cleanToken(t: unknown, fallback: Player['token']): Player['token'] {
  return VALID_TOKENS.includes(t as Player['token']) ? (t as Player['token']) : fallback;
}

export function current(room: RoomState): Player {
  return room.players[room.turnIndex % Math.max(1, room.players.length)];
}

export function activePlayers(room: RoomState) {
  return room.players.filter((p) => !p.bankrupt);
}

export function checkWin(room: RoomState) {
  const alive = activePlayers(room);
  if (room.status === 'playing' && alive.length === 1 && room.players.length > 1) {
    room.status = 'finished';
    room.winnerId = alive[0].id;
    log(room, `🏆 ${alive[0].name} wins the game!`, 'good');
  }
}

export function advanceTurn(room: RoomState) {
  if (room.status !== 'playing') return;
  room.pendingBuy = null;
  let guard = 0;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    guard++;
  } while (current(room).bankrupt && guard < 20);
  const cp = current(room);
  cp.hasRolled = false;
  cp.doubles = 0;
  room.turnCount++;
  log(room, `➡️ ${cp.name}'s turn — roll on your phone`);
  checkWin(room);
  armTurnTimer(room);
}

// ---------- turn timers ----------

export function clearTurnTimer(code: string) {
  const t = turnTimers.get(code);
  if (t) { clearTimeout(t); turnTimers.delete(code); }
}

/** (Re)arm the auto-resolve timer for whoever is current. Offline seats get a short fuse. */
export function armTurnTimer(room: RoomState) {
  clearTurnTimer(room.code);
  if (room.status !== 'playing') { room.turnDeadline = null; return; }
  const ms = current(room).connected ? TURN_MS : OFFLINE_TURN_MS;
  room.turnDeadline = Date.now() + ms;
  const token = room.turnCount;
  turnTimers.set(room.code, setTimeout(() => {
    turnTimers.delete(room.code);
    resolveTurnTimeout(room.code, token);
  }, ms + 500));
}

export function resolveTurnTimeout(code: string, turnCount: number) {
  turnTimers.delete(code);
  const room = rooms.get(code);
  if (!room || room.status !== 'playing' || room.turnCount !== turnCount) return; // stale timer
  const me = current(room);
  if (me.bankrupt) { advanceTurn(room); emit(room); return; }
  if (!me.hasRolled && me.doubles === 0) {
    log(room, `⏰ ${me.name} ran out of time — auto-rolling`, 'bad');
    if (doRoll(room, me) === 'advance') { advanceTurn(room); emit(room); return; }
  }
  if (room.pendingBuy != null && current(room).id === me.id) {
    const tile = room.pendingBuy;
    room.pendingBuy = null;
    if (openAuction(room, tile, me.id)) {
      log(room, `⏰ ${me.name} didn't decide — ${BOARD[tile].name} goes to auction`, 'info');
    }
  }
  if (me.cash < 0) {
    log(room, `⏰ ${me.name} out of time and broke — bankrupt`, 'bad');
    bankruptPlayer(room, me);
    emit(room);
    return;
  }
  advanceTurn(room);
  emit(room);
}

// ---------- core roll (shared by the roll handler and the turn timer) ----------

/** Applies a full dice roll + move + tile resolution. No socket I/O inside. */
export function doRoll(room: RoomState, me: Player): 'rolled' | 'jailed' | 'advance' {
  // One dice source for every roll: jail rolls first, doubles walk out free
  // (no extra roll granted for the escape itself).
  let d1 = rollD6(); let d2 = rollD6();
  room.dice = [d1, d2];
  room.lastCard = null; // a new roll dismisses the previous card flip
  let justReleased = false;
  if (me.inJail) {
    if (d1 === d2) {
      me.inJail = false; me.jailTurns = 0; me.doubles = 0;
      justReleased = true;
      log(room, `🎲 ${me.name} rolled doubles ${d1}+${d2} — out of jail!`, 'good');
    } else {
      me.jailTurns++;
      me.hasRolled = true;
      room.lastRoll = `${me.name} rolled ${d1}+${d2} (still in jail)`;
      if (me.jailTurns >= 2) {
        if (me.cash < JAIL_FINE) {
          // Can't afford auto-release: stay in jail, must mortgage/trade or go bankrupt.
          log(room, `🔒 ${me.name} can't afford the $${JAIL_FINE} jail fine ($${me.cash}). Mortgage, play a card, or go bankrupt!`, 'bad');
          return 'jailed';
        }
        me.cash -= JAIL_FINE;
        me.inJail = false; me.jailTurns = 0;
        log(room, `🔓 ${me.name} served time & paid $${JAIL_FINE}`, 'info');
      } else {
        log(room, `🔒 ${me.name} is in jail (turn ${me.jailTurns}/2). Roll doubles, pay $50, or play a card.`, 'bad');
        return 'jailed';
      }
    }
  }

  const sum = d1 + d2;
  const isDouble = d1 === d2;
  room.lastRoll = `${me.name} rolled ${d1}+${d2}=${sum}${isDouble ? ' (doubles!)' : ''}`;

  if (isDouble) {
    me.doubles++;
    if (me.doubles >= 3) {
      me.position = 10; me.inJail = true; me.jailTurns = 0; me.doubles = 0; me.hasRolled = true;
      room.pendingBuy = null;
      log(room, `🚨 ${me.name} rolled 3 doubles → JAIL!`, 'bad');
      return 'advance'; // caller passes the turn
    }
  } else {
    me.doubles = 0;
  }

  // move with GO pass
  const old = me.position;
  me.position = (me.position + sum) % 40;
  if (me.position < old) { me.cash += GO_SALARY; log(room, `💰 ${me.name} passed GO +$${GO_SALARY}`, 'money'); }

  const tile = BOARD[me.position];
  log(room, `🎲 ${me.name} → ${tile.name}`, 'info');

  if (tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility') {
    const owner = ownerOf(room, me.position);
    if (!owner) {
      room.pendingBuy = me.position;
      me.hasRolled = true;
      log(room, `🏷️ ${tile.name} is for sale ($${(tile as { price: number }).price})`, 'money');
    } else if (owner === me.id) {
      me.hasRolled = true;
      log(room, `🏠 ${me.name} landed on own ${tile.name}`, 'info');
    } else {
      const rent = rentFor(room, me.position, sum);
      const seller = room.players.find((p) => p.id === owner)!;
      me.cash -= rent; seller.cash += rent;
      me.hasRolled = true;
      log(room, `💸 ${me.name} paid $${rent} rent to ${seller.name} (${tile.name})`, 'money');
    }
  } else if (tile.kind === 'tax') {
    me.cash -= tile.amount; me.hasRolled = true;
    log(room, `🧾 ${me.name} paid $${tile.amount} tax`, 'bad');
  } else if (tile.kind === 'gotojail') {
    me.position = 10; me.inJail = true; me.jailTurns = 0; me.hasRolled = true;
    log(room, `🚔 ${me.name} → JAIL`, 'bad');
  } else if (tile.kind === 'chance') {
    const msg = drawChance(room, me.id); me.hasRolled = true;
    room.lastCard = { kind: 'chance', text: msg, at: Date.now() };
    log(room, `🃏 ${msg}`, 'info');
  } else if (tile.kind === 'chest') {
    const msg = drawChest(room, me.id); me.hasRolled = true;
    room.lastCard = { kind: 'chest', text: msg, at: Date.now() };
    log(room, `🎁 ${msg}`, 'info');
  } else {
    me.hasRolled = true;
  }

  if (isDouble && !me.inJail && me.doubles > 0 && !justReleased) {
    me.hasRolled = false; // roll again, same player (never for a jail escape)
    log(room, `✨ Doubles! ${me.name} rolls again`, 'good');
  }

  if (me.cash < 0) log(room, `⚠️ ${me.name} is broke ($${me.cash}). Mortgage or go bankrupt!`, 'bad');
  return 'rolled';
}

// ---------- seat removal (host kick; deeds go to bank auction) ----------

export function removeSeat(room: RoomState, target: Player) {
  const deeds = [...target.properties];
  for (const t of deeds) delete room.buildings[t];
  removePlayerTrades(room, target.id);
  dropControl(room.code, target.id);
  if (deeds.length > 0) room.auctionQueue.push(...deeds);
  const idx = room.players.findIndex((p) => p.id === target.id);
  if (idx === -1) return;
  room.players.splice(idx, 1);
  if (room.players.length === 0) return;
  if (idx < room.turnIndex) room.turnIndex--;
  room.turnIndex = room.turnIndex % room.players.length;
  const cp = current(room);
  cp.hasRolled = false;
  cp.doubles = 0;
  room.pendingBuy = null;
  armTurnTimer(room);
  checkWin(room);
  if (room.status === 'playing' && !room.auction) openNextQueuedAuction(room);
}

// ---------- bankruptcy (shared by the bankrupt handler and the turn timer) ----------

export function bankruptPlayer(room: RoomState, me: Player) {
  me.bankrupt = true;
  const deeds = [...me.properties];
  for (const t of deeds) delete room.buildings[t];
  me.properties = []; me.mortgaged = [];
  me.jailCards = 0;
  me.controllerLabel = null;
  dropControl(room.code, me.id);
  removePlayerTrades(room, me.id);
  if (deeds.length > 0) {
    room.auctionQueue.push(...deeds);
    log(room, `🏦 ${me.name}'s ${deeds.length} deed${deeds.length === 1 ? '' : 's'} go${deeds.length === 1 ? 'es' : ''} to bank auction`, 'info');
  }
  log(room, `💀 ${me.name} went bankrupt!`, 'bad');
  if (current(room).id === me.id) advanceTurn(room);
  checkWin(room);
  if (room.status === 'playing' && !room.auction) openNextQueuedAuction(room);
}

// ---------- tiles ----------

export function isBuyable(tile: number): boolean {
  const t = BOARD[tile];
  return !!t && (t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility');
}

export function colorSetTiles(tile: number): number[] {
  const t = BOARD[tile];
  if (!t || t.kind !== 'property') return [];
  return BOARD.map((x, i) => ({ x, i }))
    .filter(({ x }) => x.kind === 'property' && x.color === t.color)
    .map(({ i }) => i);
}

// ---------- trades ----------

export function pruneTrades(room: RoomState) {
  const now = Date.now();
  if (room.trades.some((t) => t.expiresAt <= now)) {
    room.trades = room.trades.filter((t) => t.expiresAt > now);
  }
}

export function removePlayerTrades(room: RoomState, pid: string) {
  room.trades = room.trades.filter((t) => t.fromId !== pid && t.toId !== pid);
}

export function isTileLocked(room: RoomState, tile: number, excludeId?: string): boolean {
  return room.trades.some(
    (t) => t.id !== excludeId && (t.giveTiles.includes(tile) || t.wantTiles.includes(tile)),
  );
}

export function normTiles(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > 8) return null;
  const out: number[] = [];
  for (const x of v) {
    if (!Number.isInteger(x) || !isBuyable(x as number)) return null;
    if (out.includes(x as number)) return null; // no dupes
    out.push(x as number);
  }
  return out;
}

export function normCash(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100000) return null;
  return v;
}

export function describeTrade(offer: TradeOffer): string {
  const bits: string[] = [];
  if (offer.giveTiles.length) bits.push(offer.giveTiles.map((t) => BOARD[t].name).join(', '));
  if (offer.giveCash) bits.push(`$${offer.giveCash}`);
  const want: string[] = [];
  if (offer.wantTiles.length) want.push(offer.wantTiles.map((t) => BOARD[t].name).join(', '));
  if (offer.wantCash) want.push(`$${offer.wantCash}`);
  return `${bits.join(' + ') || 'nothing'} for ${want.join(' + ') || 'nothing'}`;
}

// ---------- auctions ----------

export function clearAuctionTimer(code: string) {
  const t = auctionTimers.get(code);
  if (t) { clearTimeout(t); auctionTimers.delete(code); }
}

export function scheduleAuctionResolve(code: string, auctionId: string) {
  clearAuctionTimer(code);
  auctionTimers.set(code, setTimeout(() => {
    auctionTimers.delete(code);
    resolveAuction(code, auctionId);
  }, AUCTION_DURATION_MS + 500));
}

export function openAuction(room: RoomState, tile: number, startedById: string): boolean {
  if (!isBuyable(tile) || ownerOf(room, tile)) return false;
  clearAuctionTimer(room.code);
  room.auction = { id: uid('a'), tile, startedBy: startedById, bids: [], endsAt: Date.now() + AUCTION_DURATION_MS };
  log(room, `🔨 Auction opened for ${BOARD[tile].name}! Bid from your phone (30s)`, 'money');
  scheduleAuctionResolve(room.code, room.auction.id);
  return true;
}

export function resolveAuction(code: string, auctionId: string) {
  const room = rooms.get(code);
  if (!room || !room.auction || room.auction.id !== auctionId) return;
  const auction: Auction = room.auction;
  room.auction = null;
  const valid = auction.bids.filter((b) => {
    const p = room.players.find((x) => x.id === b.playerId);
    return p && !p.bankrupt && p.cash >= b.amount;
  });
  valid.sort((a, b) => b.amount - a.amount || a.at - b.at);
  if (valid.length === 0) {
    log(room, `🔨 Auction for ${BOARD[auction.tile].name} ended with no bids`, 'info');
  } else {
    const winner = room.players.find((x) => x.id === valid[0].playerId)!;
    winner.cash -= valid[0].amount;
    winner.properties.push(auction.tile);
    log(room, `🔨 ${winner.name} won ${BOARD[auction.tile].name} for $${valid[0].amount}!`, 'good');
  }
  openNextQueuedAuction(room);
  emit(room);
}

/** Opens the next bank-stock auction if the block is free. No broadcast inside; callers emit. */
export function openNextQueuedAuction(room: RoomState) {
  if (room.auction || room.auctionQueue.length === 0) return;
  const tile = room.auctionQueue.shift()!;
  if (openAuction(room, tile, 'bank')) {
    log(room, `🏦 Bank auctions ${BOARD[tile].name} (bankrupt stock)`, 'money');
  }
}

// ---------- broadcast ----------

export function log(room: RoomState, text: string, tone: RoomState['log'][number]['tone'] = 'info') {
  room.log.unshift({ id: uid('log'), text, at: Date.now(), tone });
  room.log = room.log.slice(0, 80);
}

export function emit(room: RoomState) {
  pruneTrades(room);
  room.lastActivity = Date.now();
  getIo().to(room.code).emit('roomState', room);
  // Snapshot every broadcast: rooms are tiny, and this makes restarts lossless.
  saveRooms(rooms);
}
