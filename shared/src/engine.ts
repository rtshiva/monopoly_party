import { BOARD } from './board.js';
import { GO_SALARY, JAIL_FINE } from './types.js';
import type { Player, RoomState } from './types.js';

export function rollD6(): number { return 1 + Math.floor(Math.random() * 6); }

export function ownerOf(state: RoomState, tile: number): string | null {
  for (const p of state.players) if (!p.bankrupt && p.properties.includes(tile)) return p.id;
  return null;
}

/** All tile indices sharing a color set with the given property tile
 *  (e.g. brown → [1, 3]). Empty for non-property tiles. Pure. */
export function fullSetOf(tileIdx: number): number[] {
  const t = BOARD[tileIdx];
  if (!t || t.kind !== 'property') return [];
  return BOARD.map((x, i) => ({ x, i }))
    .filter(({ x }) => x.kind === 'property' && x.color === t.color)
    .map(({ i }) => i);
}

export function countRailroads(state: RoomState, playerId: string): number {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  return p.properties.filter((t) => BOARD[t]?.kind === 'railroad').length;
}

export function rentFor(state: RoomState, tile: number, diceSum: number): number {
  const t = BOARD[tile];
  if (t.kind === 'property') {
    const owner = state.players.find((p) => p.properties.includes(tile));
    if (!owner) return 0;
    if (owner.mortgaged.includes(tile)) return 0;
    // Buildings use the rent table directly: level 1-4 → rent[2..5] houses,
    // level 5 → rent[6] hotel. Floored + clamped so corrupt snapshots can
    // never produce undefined (NaN cash) — money must stay finite.
    const level = state.buildings?.[tile] ?? 0;
    if (level > 0) return t.rent[Math.min(Math.floor(level) + 1, 6)];
    // No buildings: full color set doubles base rent — but only when the
    // whole set is unmortgaged (a mortgaged setmate breaks the bonus).
    const sameColor = BOARD.map((x, i) => ({ x, i }))
      .filter(({ x }) => x.kind === 'property' && x.color === t.color)
      .map(({ i }) => i);
    const fullSet = sameColor.every((i) => owner.properties.includes(i) && !owner.mortgaged.includes(i));
    return fullSet ? t.rent[1] : t.rent[0];
  }
  if (t.kind === 'railroad') {
    const owner = state.players.find((p) => p.properties.includes(tile));
    if (!owner || owner.mortgaged.includes(tile)) return 0;
    const n = countRailroads(state, owner.id);
    return [0, 25, 50, 100, 200][n] ?? 25;
  }
  if (t.kind === 'utility') {
    const owner = state.players.find((p) => p.properties.includes(tile));
    if (!owner || owner.mortgaged.includes(tile)) return 0;
    const owned = owner.properties.filter((i) => BOARD[i].kind === 'utility').length;
    return diceSum * (owned >= 2 ? 10 : 4);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Pure card-draw API
//
// These functions are intentionally side-effect-free: they pick a card at
// random and describe its effect without touching any state. The caller
// (server) applies the effect with applyCardEffect().
//
// This makes the functions unit-testable without a full RoomState fixture and
// allows future client-side simulation or undo/replay systems.
// ---------------------------------------------------------------------------

export interface CardEffect {
  /** Cash delta applied to the drawing player (positive = gain, negative = loss). */
  cash?: number;
  /** Teleport position (0 = GO). When set, also grants GO_SALARY if position wraps. */
  teleport?: number;
  /** Additional jail-free cards granted (1) or consumed (-1). */
  jailCards?: number;
  /** If true, send the player to jail at position 10. */
  goToJail?: boolean;
}

export interface CardDraw {
  text: string;
  effect: CardEffect;
}

const CHANCE_CARDS: (() => CardDraw)[] = [
  () => ({ text: `Chance: Advance to GO, collect $${GO_SALARY}`, effect: { cash: GO_SALARY, teleport: 0 } }),
  () => ({ text: 'Chance: Bank pays you $100', effect: { cash: 100 } }),
  () => ({ text: 'Chance: Pay $50 fee', effect: { cash: -50 } }),
  () => ({ text: `Chance: Take a trip to GO (+$${GO_SALARY})`, effect: { cash: GO_SALARY, teleport: 0 } }),
  () => ({ text: 'Chance: Go to Jail', effect: { goToJail: true } }),
  () => ({ text: 'Chance: You win $50 lottery', effect: { cash: 50 } }),
  () => ({ text: 'Chance: Get Out of Jail Free — kept! (play it from your phone)', effect: { jailCards: 1 } }),
];

const CHEST_CARDS: (() => CardDraw)[] = [
  () => ({ text: 'Chest: Inheritance $100', effect: { cash: 100 } }),
  () => ({ text: `Chest: Doctor fee $${JAIL_FINE}`, effect: { cash: -JAIL_FINE } }),
  () => ({ text: 'Chest: Tax refund $200', effect: { cash: 200 } }),
  () => ({ text: 'Chest: School fee $100', effect: { cash: -100 } }),
  () => ({ text: 'Chest: Beauty contest $50', effect: { cash: 50 } }),
  () => ({ text: 'Chest: Get Out of Jail Free — kept! (play it from your phone)', effect: { jailCards: 1 } }),
];

/** Pure: picks a random Chance card and returns its text + effect. No mutation. */
export function drawChance(): CardDraw {
  return CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)]();
}

/** Pure: picks a random Community Chest card and returns its text + effect. No mutation. */
export function drawChest(): CardDraw {
  return CHEST_CARDS[Math.floor(Math.random() * CHEST_CARDS.length)]();
}

/**
 * Apply a card effect to a player. Called by the server after drawChance/drawChest.
 * Returns true if the player was sent to jail (caller should skip further tile logic).
 */
export function applyCardEffect(player: Player, effect: CardEffect): boolean {
  if (effect.goToJail) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    return true;
  }
  if (effect.teleport !== undefined) player.position = effect.teleport;
  if (effect.cash !== undefined) player.cash += effect.cash;
  if (effect.jailCards !== undefined) player.jailCards += effect.jailCards;
  return false;
}
