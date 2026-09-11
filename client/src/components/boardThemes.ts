import type { BoardStyle, TileColor } from '@monopoly/shared';

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
  grandprix: {
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
