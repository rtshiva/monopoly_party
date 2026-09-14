/**
 * roll.ts — Dice roll, movement, and tile resolution.
 *
 * doRoll() is the core game loop step. It is decomposed into three focused
 * sub-functions to reduce cognitive load and regression surface:
 *
 *   resolveJail()  — handles the jail-escape or jail-increment logic before
 *                    any movement occurs. Returns whether the player stayed in
 *                    jail or was released.
 *
 *   moveToken()    — applies the dice sum to position, handles GO pass salary.
 *
 *   resolveTile()  — handles the landing tile's effect (rent, tax, card draw,
 *                    go-to-jail, pending buy). Returns the set of outcomes
 *                    that callers need for flow control.
 *
 * doRoll() orchestrates these three steps and returns 'rolled' | 'jailed' |
 * 'advance' so the handler knows whether to advance the turn immediately.
 */
import { applyCardEffect, drawChance, drawChest, ownerOf, rentFor, rollD6 } from '@monopoly/shared';
import { GO_SALARY, JAIL_FINE } from '@monopoly/shared';
import { BOARD } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { log } from './broadcast.js';

// ---------------------------------------------------------------------------
// Sub-step 1: Jail resolution
// ---------------------------------------------------------------------------

type JailOutcome = 'stayed' | 'released' | 'auto_paid';

function resolveJail(
  room: RoomState,
  me: Player,
  d1: number,
  d2: number,
): JailOutcome | 'not_in_jail' {
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

  log(
    room,
    `🔒 ${me.name} is in jail (turn ${me.jailTurns}/2). Roll doubles, pay $50, or play a card.`,
    'bad',
    'info',
  );
  return 'stayed';
}

// ---------------------------------------------------------------------------
// Sub-step 2: Token movement
// ---------------------------------------------------------------------------

function moveToken(room: RoomState, me: Player, sum: number) {
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

type TileOutcome = 'pending_buy' | 'paid_rent' | 'own_property' | 'tax' | 'jail' | 'card' | 'nothing';

function resolveTile(room: RoomState, me: Player, diceSum: number): TileOutcome {
  const tile = BOARD[me.position];
  log(room, `🎲 ${me.name} → ${tile.name}`, 'info', 'move');

  if (tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility') {
    const owner = ownerOf(room, me.position);
    if (!owner) {
      room.pendingBuy = me.position;
      log(room, `🏷️ ${tile.name} is for sale ($${(tile as { price: number }).price})`, 'money', 'purchase');
      return 'pending_buy';
    }
    if (owner === me.id) {
      log(room, `🏠 ${me.name} landed on own ${tile.name}`, 'info');
      return 'own_property';
    }
    const rent = rentFor(room, me.position, diceSum);
    const seller = room.players.find((p) => p.id === owner)!;
    me.cash -= rent;
    seller.cash += rent;
    log(room, `💸 ${me.name} paid $${rent} rent to ${seller.name} (${tile.name})`, 'money', 'money');
    return 'paid_rent';
  }

  if (tile.kind === 'tax') {
    me.cash -= tile.amount;
    log(room, `🧾 ${me.name} paid $${tile.amount} tax`, 'bad', 'money');
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

// ---------------------------------------------------------------------------
// Orchestrator: full dice-roll step
// ---------------------------------------------------------------------------

export type RollResult = 'rolled' | 'jailed' | 'advance';

/**
 * Apply a complete dice roll + move + tile resolution for the given player.
 * Returns:
 *   'rolled'  — normal outcome; caller emits and waits for player action.
 *   'jailed'  — player is in jail and their turn is over.
 *   'advance' — turn must pass immediately (3 doubles → jail).
 *
 * No socket I/O inside — the handler handles emit().
 */
export function doRoll(room: RoomState, me: Player): RollResult {
  const d1 = rollD6();
  const d2 = rollD6();
  room.dice = [d1, d2];
  room.lastCard = null; // a new roll dismisses the previous card flip

  // --- Step 1: jail ---
  const jailOutcome = resolveJail(room, me, d1, d2);
  if (jailOutcome === 'stayed') return 'jailed';
  const justReleased = jailOutcome === 'released';
  // After 'auto_paid' the player is free; after 'not_in_jail' we proceed normally.

  const sum = d1 + d2;
  const isDouble = d1 === d2;
  room.lastRoll = `${me.name} rolled ${d1}+${d2}=${sum}${isDouble ? ' (doubles!)' : ''}`;

  // Three doubles → jail, turn passes.
  if (isDouble) {
    me.doubles++;
    if (me.doubles >= 3) {
      me.position = 10;
      me.inJail = true;
      me.jailTurns = 0;
      me.doubles = 0;
      me.hasRolled = true;
      room.pendingBuy = null;
      log(room, `🚨 ${me.name} rolled 3 doubles → JAIL!`, 'bad', 'move');
      return 'advance';
    }
  } else {
    me.doubles = 0;
  }

  // --- Step 2: move ---
  moveToken(room, me, sum);

  // --- Step 3: tile ---
  const tileOutcome = resolveTile(room, me, sum);
  me.hasRolled = true;

  if (me.cash < 0) {
    log(room, `⚠️ ${me.name} is broke ($${me.cash}). Mortgage or go bankrupt!`, 'bad', 'info');
  }

  // Doubles grant a re-roll unless the player ended up in jail.
  if (isDouble && !me.inJail && me.doubles > 0 && !justReleased) {
    me.hasRolled = false;
    log(room, `✨ Doubles! ${me.name} rolls again`, 'good', 'info');
  }

  // pendingBuy keeps hasRolled = true; the re-roll flag above only fires for
  // "roll again" doubles on non-buyable tiles.
  if (tileOutcome === 'pending_buy') me.hasRolled = true;

  return 'rolled';
}
