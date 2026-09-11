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
   * Optional corner vignette sheet, e.g. '/themes/coastal-corners.webp': a
   * square 2x2 collage (TL=go, TR=jail, BL=gotojail, BR=parking, each >=512px
   * inside a >=1024px sheet). The app crops each quadrant into its corner
   * cell with pure CSS — no per-corner files, no alignment to tune.
   * No text; keep each vignette's middle calm for the overlaid chips.
   */
  cornerSheet?: string;
  /**
   * Optional street + special tile backgrounds. Property streets key by
   * color (`brown` … `blue`); specials by kind (`railroad | utility | tax |
   * chance | chest`). Square (~512px), subtle texture, no text; missing keys
   * fall back to plain colors — mix freely.
   */
  tileArt?: Partial<Record<Exclude<TileColor, 'none'> | 'railroad' | 'utility' | 'tax' | 'chance' | 'chest', string>>;
}

/** Four track-inspired skins. Rules and streets never change — only the look. */
export const BOARD_THEMES: Record<BoardStyle, BoardTheme> = {
  grandprix: {
    id: 'grandprix', name: 'Grand Prix Circuit', short: 'Grand', icon: '🏁',
    tagline: 'SAME GAME. A FASTER JOURNEY.',
    boardBg: '#ece1c9', tileBg: '#fffdf4', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/grandprix-center.webp',
    cornerSheet: '/themes/grandprix-corners.webp',
  },
  city: {
    id: 'city', name: 'City Street Circuit', short: 'City', icon: '🌆',
    tagline: 'EXPLORE · INVEST · BUILD. OWN THE CITY.',
    boardBg: '#dfe7ef', tileBg: '#fbfdff', ink: '#1e293b', subInk: '#64748b',
    artImage: '/themes/city/city-center.webp',
    cornerSheet: '/themes/city/city-corners.png',
    tileArt: {
      brown: '/themes/city/city-tile-brown.webp',
      lightblue: '/themes/city/city-tile-lightblue.webp',
      pink: '/themes/city/city-tile-pink.webp',
      orange: '/themes/city/city-tile-orange.webp',
      red: '/themes/city/city-tile-red.webp',
      yellow: '/themes/city/city-tile-yellow.webp',
      green: '/themes/city/city-tile-green.webp',
      blue: '/themes/city/city-tile-blue.webp',
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
