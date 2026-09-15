/**
 * botBrain.ts — One full bot turn + its pure decision helpers.
 *
 * Timer-free and emit-free: botTakeTurn() is a synchronous state machine
 * (jail, roll, buy-or-auction, one build, unmortgage, mortgage rescue,
 * bankrupt, advance). The scheduler in bots.ts owns all timers and the
 * broadcast. Pure scans (shouldBuy/pick*) are unit-tested directly.
 */
import { BOARD, JAIL_FINE, UNMORTGAGE_RATE } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { log } from './broadcast.js';
import { advanceTurn } from './player.js';
import { doRoll } from './roll.js';
import { bankruptPlayer } from './bankruptcy.js';
import { queueOrOpenAuction } from './auction.js';
import { colorSetTiles } from './trade.js';
import { setHasBuildings } from './houses.js';

/** Bots keep this cash buffer after a purchase (never go broke buying). */
export const BOT_BUY_BUFFER = 100;
/** Bots build only when left with more than this after the house cost. */
export const BOT_BUILD_BUFFER = 200;
/** Bots unmortgage while keeping at least this cash on hand. */
export const BOT_UNMORTGAGE_BUFFER = 500;

/**
 * Flight recorder: one entry per thing the bot attempted this turn, with the
 * outcome and reason. Threaded through botTakeTurn as an optional out-param —
 * the game feed stays clean, but BOT_DEBUG=1 (or the sim harness on failure)
 * shows exactly what the bot tried and why it did or didn't work.
 */
export interface BotTrace {
  t: 'jail' | 'roll' | 'buy' | 'pass' | 'build' | 'build-skip' | 'unmortgage' | 'mortgage' | 'bankrupt' | 'end';
  ok: boolean;
  detail: string;
}

/** Pure decision: buy when the price leaves the safety buffer. */
export function shouldBuy(cash: number, price: number): boolean {
  return cash >= price + BOT_BUY_BUFFER;
}

/**
 * Cheapest legal house build for a bot: a tile tied for the lowest level in
 * a fully-owned, unmortgaged set the bot can afford (with buffer). Pure scan,
 * no mutation. Mirrors the server's even-build rule.
 */
export function pickBuildTile(room: RoomState, me: Player): number | null {
  let best: number | null = null;
  let bestCost = Infinity;
  for (const tile of me.properties) {
    const t = BOARD[tile];
    if (!t || t.kind !== 'property') continue;
    const set = colorSetTiles(tile);
    if (set.length === 0 || !set.every((i) => me.properties.includes(i))) continue;
    if (set.some((i) => me.mortgaged.includes(i))) continue;
    const level = room.buildings[tile] ?? 0;
    if (level >= 5) continue;
    const min = Math.min(...set.map((i) => room.buildings[i] ?? 0));
    if (level > min) continue; // even build: only lowest tiles
    if (me.cash < t.houseCost + BOT_BUILD_BUFFER) continue;
    if (t.houseCost < bestCost) { bestCost = t.houseCost; best = tile; }
  }
  return best;
}

/**
 * Unmortgage pick: cheapest fee first (fee mirrors economy.ts: 60% of price).
 * Pure scan, no mutation. Without this, bots mortgage-spiral into eternal
 * rent-free endgames that never conclude.
 */
export function pickUnmortgageTile(room: RoomState, me: Player): number | null {
  void room;
  let best: number | null = null;
  let bestFee = Infinity;
  for (const tile of me.mortgaged) {
    const t = BOARD[tile] as { price: number } | undefined;
    if (!t || typeof t.price !== 'number') continue;
    const fee = Math.round(t.price * UNMORTGAGE_RATE);
    if (me.cash < fee + BOT_UNMORTGAGE_BUFFER) continue;
    if (fee < bestFee) { bestFee = fee; best = tile; }
  }
  return best;
}

/**
 * Mortgage rescue: first unmortgaged deed in a building-free set. Pure scan,
 * no mutation. Returns null when nothing can be mortgaged.
 */
export function pickMortgageTile(room: RoomState, me: Player): number | null {
  for (const tile of me.properties) {
    if (me.mortgaged.includes(tile)) continue;
    if (setHasBuildings(room, tile)) continue;
    return tile;
  }
  return null;
}

/**
 * One full bot turn. Synchronous state machine — no timers, no I/O;
 * botAct() broadcasts afterwards. Ends with advanceTurn() on every path
 * except bankruptcy (which advances internally when current).
 * Pass `trace` to record every attempt + outcome (flight recorder).
 */
export function botTakeTurn(room: RoomState, me: Player, trace: BotTrace[] = []) {
  // --- jail ---
  if (me.inJail) {
    if (me.jailCards > 0) {
      me.jailCards--;
      me.inJail = false;
      me.jailTurns = 0;
      log(room, `🃏 ${me.name} played a Get-Out-of-Jail-Free card`, 'good');
      trace.push({ t: 'jail', ok: true, detail: 'card' });
    } else if (me.cash >= JAIL_FINE) {
      me.cash -= JAIL_FINE;
      me.inJail = false;
      me.jailTurns = 0;
      log(room, `🔓 ${me.name} paid $${JAIL_FINE} to leave jail`, 'good', 'money');
      trace.push({ t: 'jail', ok: true, detail: 'paid-50' });
    } else {
      trace.push({ t: 'jail', ok: true, detail: `roll-out cash=${me.cash}` });
    }
    if (me.inJail) {
      const r = doRoll(room, me);
      trace.push({ t: 'roll', ok: r === 'rolled', detail: `jail-outcome=${r} dice=${room.dice}` });
      if (r !== 'rolled') { advanceTurn(room); return; }
      if (me.inJail) { advanceTurn(room); return; }
    }
  }

  // --- roll (skipped only if some prior step already rolled — none do) ---
  if (!me.hasRolled) {
    const r = doRoll(room, me);
    trace.push({ t: 'roll', ok: r === 'rolled', detail: `outcome=${r} dice=${room.dice}` });
    if (r === 'advance' || r === 'jailed') { advanceTurn(room); return; }
  }

  // --- buy or auction ---
  if (room.pendingBuy != null && room.pendingBuy === me.position) {
    const tile = BOARD[me.position] as { price: number; name: string };
    if (shouldBuy(me.cash, tile.price)) {
      me.cash -= tile.price;
      me.properties.push(me.position);
      room.pendingBuy = null;
      log(room, `✅ ${me.name} bought ${tile.name} for $${tile.price}`, 'good', 'purchase');
      trace.push({ t: 'buy', ok: true, detail: `${tile.name} $${tile.price} cash-left=${me.cash}` });
    } else {
      room.pendingBuy = null;
      // Queue behind a live auction rather than replacing it (see auction.ts).
      const fate = queueOrOpenAuction(room, me.position, me.id);
      trace.push({ t: 'pass', ok: fate !== 'dropped', detail: `${tile.name} $${tile.price} cash=${me.cash} fate=${fate}` });
      if (fate === 'open') {
        log(room, `🔨 ${me.name} passed — ${tile.name} goes to auction`, 'info', 'purchase');
      } else {
        log(room, `🔨 ${me.name} passed — ${tile.name} queued for auction`, 'info', 'purchase');
      }
    }
  }

  // --- one house build ---
  const build = pickBuildTile(room, me);
  if (build != null) {
    const t = BOARD[build];
    if (t && t.kind === 'property') {
      me.cash -= t.houseCost;
      const level = (room.buildings[build] ?? 0) + 1;
      room.buildings[build] = level;
      log(room, `🏠 ${me.name} built ${level === 5 ? 'a HOTEL' : `house #${level}`} on ${t.name} ($${t.houseCost})`, 'good', 'build');
      trace.push({ t: 'build', ok: true, detail: `${t.name} level=${level} cash-left=${me.cash}` });
    }
  } else {
    const colors = new Set(me.properties.map((i) => {
      const t = BOARD[i];
      return t && t.kind === 'property' ? t.color : '';
    }));
    trace.push({
      t: 'build-skip', ok: true,
      detail: me.properties.length === 0 ? 'no-deeds'
        : me.cash < BOT_BUILD_BUFFER ? `poor cash=${me.cash}`
        : `no-eligible-set colors=[${[...colors].filter(Boolean)}]`,
    });
  }

  // --- unmortgage while rich (keeps rents alive; prevents mortgage-spiral
  // stalls where nobody can collect enough to finish the game) ---
  for (;;) {
    const um = pickUnmortgageTile(room, me);
    if (um == null) break;
    const t = BOARD[um] as { price: number; name: string };
    const fee = Math.round(t.price * 0.6);
    me.cash -= fee;
    me.mortgaged = me.mortgaged.filter((x) => x !== um);
    log(room, `🏦 ${me.name} unmortgaged ${t.name} (−$${fee})`, 'info', 'money');
    trace.push({ t: 'unmortgage', ok: true, detail: `${t.name} fee=${fee} cash=${me.cash}` });
  }

  // --- mortgage rescue, then bankrupt as last resort ---
  while (me.cash < 0) {
    const tile = pickMortgageTile(room, me);
    if (tile == null) break;
    const t = BOARD[tile] as { price: number; name: string };
    me.cash += Math.round(t.price / 2);
    me.mortgaged.push(tile);
    log(room, `🏦 ${me.name} mortgaged ${t.name} (+$${Math.round(t.price / 2)})`, 'money', 'money');
    trace.push({ t: 'mortgage', ok: true, detail: `${t.name} cash=${me.cash}` });
  }
  if (me.cash < 0) {
    trace.push({ t: 'bankrupt', ok: true, detail: `cash=${me.cash}` });
    bankruptPlayer(room, me);
    return;
  }

  trace.push({ t: 'end', ok: true, detail: `cash=${me.cash} deeds=${me.properties.length}` });
  advanceTurn(room);
}
