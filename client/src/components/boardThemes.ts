import type { BoardStyle, TileColor } from '@monopoly/shared';
import { DEFAULT_BOARD_STYLE } from '@monopoly/shared';

export interface BoardTheme {
  id: BoardStyle;
  name: string;
  short: string;
  icon: string;
  tagline: string;
  /** Outer board background. */
  boardBg: string;
  /** Property tile background (light, like the reference boards). */
  tileBg: string;
  /** Primary tile text. */
  ink: string;
  /** Secondary tile text. */
  subInk: string;
  /**
   * Optional generated center art, e.g. '/themes/coastal-center.webp'.
   * Drop the file in client/public/themes/ — SVG scene is the fallback.
   * Square; no text (the title badge renders as HTML on top).
   */
  artImage?: string;
  /**
   * Optional tile backgrounds: streets key by color (`brown` … `blue`),
   * everything else by kind (`railroad | utility | tax | chance | chest |
   * go | jail | parking | gotojail`). Square (~512px), subtle texture, no
   * text; missing keys fall back to plain colors — mix freely.
   */
  tileArt?: Partial<Record<TileArtKey, string>>;
}

/** Every tile surface that can carry generated art. */
export type TileArtKey =
  | Exclude<TileColor, 'none'>
  | 'railroad' | 'utility' | 'tax' | 'chance' | 'chest'
  | 'go' | 'jail' | 'parking' | 'gotojail';

/** Six skins. Rules and streets never change — only the look. */
export const BOARD_THEMES: Record<BoardStyle, BoardTheme> = {
  classic: {
    id: 'classic', name: 'Classic', short: 'Classic', icon: '🎩',
    tagline: 'THE ORIGINAL. DEEDS · DICE · DESTINY.',
    boardBg: '#e3ecd9', tileBg: '#fffdf4', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/classic/classic-center.webp',
    tileArt: {
      brown: '/themes/classic/classic-tile-brown.webp',
      lightblue: '/themes/classic/classic-tile-lightblue.webp',
      pink: '/themes/classic/classic-tile-pink.webp',
      orange: '/themes/classic/classic-tile-orange.webp',
      red: '/themes/classic/classic-tile-red.webp',
      yellow: '/themes/classic/classic-tile-yellow.webp',
      green: '/themes/classic/classic-tile-green.webp',
      blue: '/themes/classic/classic-tile-blue.webp',
      railroad: '/themes/classic/classic-tile-railroad.webp',
      utility: '/themes/classic/classic-tile-utility.webp',
      tax: '/themes/classic/classic-tile-tax.webp',
      chance: '/themes/classic/classic-tile-chance.webp',
      chest: '/themes/classic/classic-tile-chest.webp',
      go: '/themes/classic/classic-tile-go.webp',
      jail: '/themes/classic/classic-tile-jail.webp',
      parking: '/themes/classic/classic-tile-parking.webp',
      gotojail: '/themes/classic/classic-tile-gotojail.webp',
    },
  },  grandprix: {
    id: 'grandprix', name: 'Grand Prix Circuit', short: 'Grand', icon: '🏁',
    tagline: 'SAME GAME. A FASTER JOURNEY.',
    boardBg: '#ece1c9', tileBg: '#fffdf4', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/grandprix-center.webp',
  },
  city: {
    id: 'city', name: 'City Street Circuit', short: 'City', icon: '🌆',
    tagline: 'EXPLORE · INVEST · BUILD. OWN THE CITY.',
    boardBg: '#dfe7ef', tileBg: '#fbfdff', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/city/city-center.webp',
    tileArt: {
      brown: '/themes/city/city-tile-brown.webp',
      lightblue: '/themes/city/city-tile-lightblue.webp',
      pink: '/themes/city/city-tile-pink.webp',
      orange: '/themes/city/city-tile-orange.webp',
      red: '/themes/city/city-tile-red.webp',
      yellow: '/themes/city/city-tile-yellow.webp',
      green: '/themes/city/city-tile-green.webp',
      blue: '/themes/city/city-tile-blue.webp',
      railroad: '/themes/city/city-tile-railroad.webp',
      utility: '/themes/city/city-tile-utility.webp',
      tax: '/themes/city/city-tile-tax.webp',
      chance: '/themes/city/city-tile-chance.webp',
      chest: '/themes/city/city-tile-chest.webp',
      go: '/themes/city/city-tile-go.webp',
      jail: '/themes/city/city-tile-jail.webp',
      parking: '/themes/city/city-tile-free-parking.webp',
      gotojail: '/themes/city/city-tile-go-to-jail.webp',
    },
  },
  dinosaur: {
    id: 'dinosaur', name: 'Dinosaur Park', short: 'Dino', icon: '🦕',
    tagline: 'ROAR · INVEST · SURVIVE.',
    boardBg: '#dde7cf', tileBg: '#fbfdf4', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/dinosaur-park/dinosaur-park-center.webp',
    tileArt: {
      brown: '/themes/dinosaur-park/dinosaur-park-tile-brown.webp',
      lightblue: '/themes/dinosaur-park/dinosaur-park-tile-lightblue.webp',
      pink: '/themes/dinosaur-park/dinosaur-park-tile-pink.webp',
      orange: '/themes/dinosaur-park/dinosaur-park-tile-orange.webp',
      red: '/themes/dinosaur-park/dinosaur-park-tile-red.webp',
      yellow: '/themes/dinosaur-park/dinosaur-park-tile-yellow.webp',
      green: '/themes/dinosaur-park/dinosaur-park-tile-green.webp',
      blue: '/themes/dinosaur-park/dinosaur-park-tile-blue.webp',
      railroad: '/themes/dinosaur-park/dinosaur-park-tile-railroad.webp',
      utility: '/themes/dinosaur-park/dinosaur-park-tile-utility.webp',
      tax: '/themes/dinosaur-park/dinosaur-park-tile-tax.webp',
      chance: '/themes/dinosaur-park/dinosaur-park-tile-chance.webp',
      chest: '/themes/dinosaur-park/dinosaur-park-tile-chest.webp',
      go: '/themes/dinosaur-park/dinosaur-park-tile-go.webp',
      jail: '/themes/dinosaur-park/dinosaur-park-tile-jail.webp',
      parking: '/themes/dinosaur-park/dinosaur-park-tile-free-parking.webp',
      gotojail: '/themes/dinosaur-park/dinosaur-park-tile-go-to-jail.webp',
    },
  },
  space: {
    id: 'space', name: 'Space City', short: 'Space', icon: '🚀',
    tagline: 'TO INFINITY · INVEST BEYOND.',
    boardBg: '#1c2340', tileBg: '#fbfdff', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/space-city/space-city-center.webp',
    tileArt: {
      brown: '/themes/space-city/space-city-tile-brown.webp',
      lightblue: '/themes/space-city/space-city-tile-lightblue.webp',
      pink: '/themes/space-city/space-city-tile-pink.webp',
      orange: '/themes/space-city/space-city-tile-orange.webp',
      red: '/themes/space-city/space-city-tile-red.webp',
      yellow: '/themes/space-city/space-city-tile-yellow.webp',
      green: '/themes/space-city/space-city-tile-green.webp',
      blue: '/themes/space-city/space-city-tile-blue.webp',
      railroad: '/themes/space-city/space-city-tile-railroad.webp',
      utility: '/themes/space-city/space-city-tile-utility.webp',
      tax: '/themes/space-city/space-city-tile-tax.webp',
      chance: '/themes/space-city/space-city-tile-chance.webp',
      chest: '/themes/space-city/space-city-tile-chest.webp',
      go: '/themes/space-city/space-city-tile-go.webp',
      jail: '/themes/space-city/space-city-tile-jail.webp',
      parking: '/themes/space-city/space-city-tile-free-parking.webp',
      gotojail: '/themes/space-city/space-city-tile-go-to-jail.webp',
    },
  },
  coastal: {
    id: 'coastal', name: 'Coastal Cruise', short: 'Coastal', icon: '🌊',
    tagline: 'SUN · SEA · INVEST. MAKE WAVES.',
    boardBg: '#f3e8cf', tileBg: '#fffdf4', ink: '#1e293b', subInk: '#64748b',
  },
  mountain: {
    id: 'mountain', name: 'Mountain Rally', short: 'Mountain', icon: '⛰️',
    tagline: 'CLIMB · INVEST · CONQUER. A HIGHER GAME.',
    boardBg: '#e4e7ec', tileBg: '#fbfcfe', ink: '#1e293b', subInk: '#64748b',
  },
};

/** One drop-in theme folder, as reported by GET /api/themes. */
export interface DiscoveredTheme {
  id: string;
  name: string;
  center: string;
  tileArt: Partial<Record<TileArtKey, string>>;
  tiles?: string[];
  missing?: string[];
  warnings?: string[];
}

/** Neutral light defaults for discovered themes without registry metadata. */
export function generatedTheme(d: DiscoveredTheme): BoardTheme {
  return {
    id: d.id,
    name: d.name,
    short: d.name.split(/[\s-_]+/)[0]?.slice(0, 10) || d.id,
    icon: '✨',
    tagline: 'COMMUNITY THEME.',
    boardBg: '#eef2f7',
    tileBg: '#fffdf4',
    ink: '#1e293b',
    subInk: '#64748b',
    artImage: d.center,
    tileArt: d.tileArt,
  };
}

/**
 * Merge drop-in discovery over the built-in registry. A discovered folder
 * whose center art matches a built-in (city, dinosaur-park, space-city…)
 * supplements that entry instead of duplicating it; anything else (e.g.
 * discworld) becomes a new selectable theme with zero code changes. Pure.
 */
export function mergeDiscovered(
  builtins: Record<string, BoardTheme>,
  discovered: DiscoveredTheme[],
): BoardTheme[] {
  const byId = new Map<string, BoardTheme>();
  for (const d of discovered) {
    if (!d || typeof d.id !== 'string' || !d.id) continue;
    byId.set(d.id, generatedTheme(d));
  }
  for (const b of Object.values(builtins)) {
    const dupeKey = [...byId.keys()].find(
      (k) => k !== b.id && byId.get(k)?.artImage && byId.get(k)?.artImage === b.artImage,
    );
    const base = dupeKey ? byId.get(dupeKey)! : byId.get(b.id);
    if (dupeKey) byId.delete(dupeKey);
    byId.set(
      b.id,
      base
        ? { ...base, ...b, id: b.id, tileArt: { ...base.tileArt, ...b.tileArt } }
        : b,
    );
  }
  return [...byId.values()];
}

/** Theme for a room style id — discovered or built-in, default fallback. */
export function themeFor(style: string, discovered: DiscoveredTheme[] = []): BoardTheme {
  const merged = mergeDiscovered(BOARD_THEMES, discovered);
  return merged.find((t) => t.id === style) ?? merged.find((t) => t.id === DEFAULT_BOARD_STYLE) ?? BOARD_THEMES.grandprix;
}
