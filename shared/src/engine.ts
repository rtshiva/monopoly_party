import { BOARD } from './board.js';
import { GO_SALARY, JAIL_FINE } from './types.js';
import type { RoomState } from './types.js';

export function rollD6(): number { return 1 + Math.floor(Math.random() * 6); }

export function ownerOf(state: RoomState, tile: number): string | null {
  for (const p of state.players) if (!p.bankrupt && p.properties.includes(tile)) return p.id;
  return null;
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
    // Buildings use the rent table directly: rent[1..4] houses, rent[5] hotel.
    const level = state.buildings?.[tile] ?? 0;
    if (level > 0) return t.rent[Math.min(level, 5)];
    // No buildings: full color set doubles base rent.
    const sameColor = BOARD.map((x, i) => ({ x, i }))
      .filter(({ x }) => x.kind === 'property' && x.color === t.color)
      .map(({ i }) => i);
    const fullSet = sameColor.every((i) => owner.properties.includes(i));
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

export function drawChance(state: RoomState, pid: string): string {
  const p = state.players.find((x) => x.id === pid)!;
  const cards = [
    () => { p.cash += GO_SALARY; return `Chance: Advance to GO, collect $${GO_SALARY}`; },
    () => { p.cash += 100; return 'Chance: Bank pays you $100'; },
    () => { p.cash -= 50; return 'Chance: Pay $50 fee'; },
    () => { p.position = 0; p.cash += GO_SALARY; return `Chance: Take a trip to GO (+$${GO_SALARY})`; },
    () => { p.position = 10; p.inJail = true; p.jailTurns = 0; return 'Chance: Go to Jail'; },
    () => { p.cash += 50; return 'Chance: You win $50 lottery'; },
  ];
  const fn = cards[Math.floor(Math.random() * cards.length)];
  return fn();
}

export function drawChest(state: RoomState, pid: string): string {
  const p = state.players.find((x) => x.id === pid)!;
  const cards = [
    () => { p.cash += 100; return 'Chest: Inheritance $100'; },
    () => { p.cash -= JAIL_FINE; return `Chest: Doctor fee $${JAIL_FINE}`; },
    () => { p.cash += 200; return 'Chest: Tax refund $200'; },
    () => { p.cash -= 100; return 'Chest: School fee $100'; },
    () => { p.cash += 50; return 'Chest: Beauty contest $50'; },
  ];
  const fn = cards[Math.floor(Math.random() * cards.length)];
  return fn();
}
