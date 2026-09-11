import type { BoardStyle } from '@monopoly/shared';

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
   * Optional generated center art, e.g. '/themes/coastal.webp'.
   * Drop the file in client/public/themes/ — SVG scene is the fallback.
   * Must be square (see client/public/themes/README.md for the spec).
   */
  artImage?: string;
}

/** Four track-inspired skins. Rules and streets never change — only the look. */
export const BOARD_THEMES: Record<BoardStyle, BoardTheme> = {
  grandprix: {
    id: 'grandprix', name: 'Grand Prix Circuit', short: 'Grand', icon: '🏁',
    tagline: 'SAME GAME. A FASTER JOURNEY.',
    boardBg: '#ece1c9', tileBg: '#fffdf4', ink: '#1e293b', subInk: '#64748b',
  },
  city: {
    id: 'city', name: 'City Street Circuit', short: 'City', icon: '🌆',
    tagline: 'EXPLORE · INVEST · BUILD. OWN THE CITY.',
    boardBg: '#dfe7ef', tileBg: '#fbfdff', ink: '#1e293b', subInk: '#64748b',
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
