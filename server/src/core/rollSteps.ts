/**
 * rollSteps.ts — The three roll sub-steps, extracted from roll.ts (one
 * concern per file). doRoll() in roll.ts orchestrates these; all functions
 * are pure state mutations — no I/O, callers handle emit().
 */
import { applyCardEffect, drawChance, drawChest, ownerOf, rentFor } from '@monopoly/shared';
import { GO_SALARY, JAIL_FINE } from '@monopoly/shared';
import { BOARD } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { log } from './broadcast.js';

// ---------------------------------------------------------------------------
// Sub-step 1: Jail resolution
// ---------------------------------------------------------------------------

export type JailOutcome = 'stayed' | 'released' | 'auto_paid';

export function resolveJail(room: RoomState, me: Player, d1: number, d2: number): JailOutcome | 'not_in_jail' {
  if (!me.inJail) return 'not_in_jail';

  if (d1 === d2) {
    // Doubles escape: leave jail, but don't get an extra roll (justReleased guards that).
    me.inJail = false;
    me.jailTurns = 0;
    me.doubles = 0;
    log(room, `🎲 ${me.name} rolled doubles ${d1}+${d2} — out of jail!`, 'good', 'move');
    return 'released';
  }

  me.jailTurns++;
  me.hasRolled = true;
  room.lastRoll = `${me.name} rolled ${d1}+${d2} (still in jail)`;

  if (me.jailTurns >= 2) {
    if (me.cash < JAIL_FINE) {
      // Can't afford auto-release: must mortgage/trade or go bankrupt.
      log(
        room,
        `🔒 ${me.name} can't afford the $${JAIL_FINE} jail fine ($${me.cash}). Mortgage, play a card, or go bankrupt!`,
        'bad',
        'info',
      );
      return 'stayed';
    }
    me.cash -= JAIL_FINE;
    me.inJail = false;
    me.jailTurns = 0;
    log(room, `🔓 ${me.name} served time & paid $${JAIL_FINE}`, 'info', 'money');
    return 'auto_paid';
  }

  log(room, `🔒 ${me.name} is in jail (turn ${me.jailTurns}/2). Roll doubles, pay $50, or play a card.`, 'bad', 'info');
  return 'stayed';
}

// ---------------------------------------------------------------------------
// Sub-step 2: Token movement
// ---------------------------------------------------------------------------

export function moveToken(room: RoomState, me: Player, sum: number) {
  if (!Number.isFinite(me.cash)) me.cash = 1500;
  if (!Number.isInteger(me.position) || me.position < 0 || me.position > 39) me.position = 0;
  const old = me.position;
  me.position = (me.position + sum) % 40;
  if (me.position < old) {
    me.cash += GO_SALARY;
    log(room, `💰 ${me.name} passed GO +$${GO_SALARY}`, 'money', 'money');
  }
}

// ---------------------------------------------------------------------------
// Sub-step 3: Tile resolution
// ---------------------------------------------------------------------------

export type TileOutcome = 'pending_buy' | 'paid_rent' | 'own_property' | 'tax' | 'jail' | 'card' | 'nothing';

export function resolveTile(room: RoomState, me: Player, diceSum: number): TileOutcome {
  if (!Number.isFinite(me.cash)) me.cash = 1500;
  if (!Number.isInteger(me.position) || me.position < 0 || me.position > 39) me.position = 0;
  const tile = BOARD[me.position];
  if (!tile) return 'nothing';
  log(room, `🎲 ${me.name} → ${tile.name}`, 'info', 'move');

  if (tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility') {
    const owner = ownerOf(room, me.position);
    if (!owner) {
      room.pendingBuy = me.position;
      log(room, `🏷️ ${tile.name} is for sale ($${tile.price})`, 'money', 'purchase');
      return 'pending_buy';
    }
    if (owner === me.id) {
      log(room, `🏠 ${me.name} landed on own ${tile.name}`, 'info');
      return 'own_property';
    }
    const rent = rentFor(room, me.position, diceSum);
    if (!Number.isFinite(rent)) return 'nothing';
    const seller = room.players.find((p) => p.id === owner);
    if (!seller) return 'nothing';
    if (!Number.isFinite(seller.cash)) seller.cash = 1500;
    me.cash -= rent;
    seller.cash += rent;
    log(room, `💸 ${me.name} paid $${rent} rent to ${seller.name} (${tile.name})`, 'money', 'money');
    return 'paid_rent';
  }

  if (tile.kind === 'tax') {
    const amount = tile.amount;
    me.cash -= amount;
    log(room, `🧾 ${me.name} paid $${amount} tax`, 'bad', 'money');
    return 'tax';
  }

  if (tile.kind === 'gotojail') {
    me.position = 10;
    me.inJail = true;
    me.jailTurns = 0;
    log(room, `🚔 ${me.name} → JAIL`, 'bad', 'move');
    return 'jail';
  }

  if (tile.kind === 'chance') {
    const draw = drawChance();
    const jailed = applyCardEffect(me, draw.effect);
    room.lastCard = { kind: 'chance', text: draw.text, at: Date.now() };
    log(room, `🃏 ${draw.text}`, 'info');
    if (jailed) return 'jail';
    return 'card';
  }

  if (tile.kind === 'chest') {
    const draw = drawChest();
    const jailed = applyCardEffect(me, draw.effect);
    room.lastCard = { kind: 'chest', text: draw.text, at: Date.now() };
    log(room, `🎁 ${draw.text}`, 'info');
    if (jailed) return 'jail';
    return 'card';
  }

  return 'nothing';
}
