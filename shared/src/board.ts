import type { Tile, TileColor } from './types.js';

// Classic 40-tile layout, simplified rents.
// rent[] = [base, full-set, 1H, 2H, 3H, 4H, hotel]. Indexed by building
// level + 1 (level 0 uses rent[0], or rent[1] on a full set) — every entry
// must exist or hotels silently charge the 4-house price.
const P = (name: string, color: TileColor, price: number, base: number, houseCost: number): Tile => ({
  kind: 'property', name, color, price,
  rent: [base, base * 2, base * 5, base * 12, base * 20, base * 30, base * 45], houseCost,
});

export const BOARD: Tile[] = [
  { kind: 'go', name: 'GO' },
  P('Med Ave', 'brown', 60, 4, 50),
  { kind: 'chest', name: 'Chest' },
  P('Baltic Ave', 'brown', 60, 6, 50),
  { kind: 'tax', name: 'Income Tax', amount: 100 },
  { kind: 'railroad', name: 'Reading RR', price: 200 },
  P('Oriental Ave', 'lightblue', 100, 8, 50),
  { kind: 'chance', name: 'Chance' },
  P('Vermont Ave', 'lightblue', 100, 8, 50),
  P('Conn Ave', 'lightblue', 120, 10, 50),
  { kind: 'jail', name: 'Jail' },
  P('St Charles', 'pink', 140, 12, 100),
  { kind: 'utility', name: 'Electric Co', price: 150 },
  P('States Ave', 'pink', 140, 12, 100),
  P('Virginia Ave', 'pink', 160, 14, 100),
  { kind: 'railroad', name: 'Penn RR', price: 200 },
  P('St James', 'orange', 180, 16, 100),
  { kind: 'chest', name: 'Chest' },
  P('Tennessee', 'orange', 180, 16, 100),
  P('New York Ave', 'orange', 200, 18, 100),
  { kind: 'parking', name: 'Free Parking' },
  P('Kentucky', 'red', 220, 20, 150),
  { kind: 'chance', name: 'Chance' },
  P('Indiana Ave', 'red', 220, 20, 150),
  P('Illinois Ave', 'red', 240, 22, 150),
  { kind: 'railroad', name: 'B&O RR', price: 200 },
  P('Atlantic Ave', 'yellow', 260, 24, 150),
  P('Ventnor Ave', 'yellow', 260, 24, 150),
  { kind: 'utility', name: 'Water Works', price: 150 },
  P('Marvin Gardens', 'yellow', 280, 26, 150),
  { kind: 'gotojail', name: 'Go To Jail' },
  P('Pacific Ave', 'green', 300, 28, 200),
  P('N Carolina', 'green', 300, 28, 200),
  { kind: 'chest', name: 'Chest' },
  P('Penn Ave', 'green', 320, 30, 200),
  { kind: 'railroad', name: 'Short Line', price: 200 },
  { kind: 'chance', name: 'Chance' },
  P('Park Place', 'blue', 350, 36, 200),
  { kind: 'tax', name: 'Luxury Tax', amount: 150 },
  P('Boardwalk', 'blue', 400, 50, 200),
];

export const COLOR_HEX: Record<string, string> = {
  brown: '#8d5a2b', lightblue: '#7dd3fc', pink: '#f472b6', orange: '#fb923c',
  red: '#ef4444', yellow: '#facc15', green: '#22c55e', blue: '#3b82f6', none: '#475569',
};

export function tilePrice(i: number): number {
  const t = BOARD[i];
  if (t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility') return t.price;
  return 0;
}

export function tileName(i: number): string { return BOARD[i].name; }
