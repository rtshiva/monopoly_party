/**
 * roll.ts — Dice roll orchestration (doRoll).
 *
 * The three sub-steps live in rollSteps.ts (one concern per file); this
 * module only sequences them and maps outcomes to turn flow.
 */
import { rollD6 } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { log } from './broadcast.js';
import { moveToken, resolveJail, resolveTile } from './rollSteps.js';

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
  if (!Number.isFinite(me.cash)) me.cash = 1500;
  if (!Number.isInteger(me.position) || me.position < 0 || me.position > 39) me.position = 0;
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
