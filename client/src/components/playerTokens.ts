/**
 * playerTokens.ts — Player theme colors and token badge utilities.
 * 
 * Assigns each player seat a unique, high-contrast neon/vivid color
 * that pops on both light boards and dark art-heavy tiles.
 */

export interface PlayerThemeColor {
  name: string;
  hex: string;
  bgRgba: string;
  glowRgba: string;
  ringClass: string;
}

export const PLAYER_COLORS: PlayerThemeColor[] = [
  {
    name: 'Cyan',
    hex: '#06b6d4', // cyan-500
    bgRgba: 'rgba(6, 182, 212, 0.35)',
    glowRgba: 'rgba(6, 182, 212, 0.9)',
    ringClass: 'ring-[#06b6d4]',
  },
  {
    name: 'Magenta / Pink',
    hex: '#ec4899', // pink-500
    bgRgba: 'rgba(236, 72, 153, 0.35)',
    glowRgba: 'rgba(236, 72, 153, 0.9)',
    ringClass: 'ring-[#ec4899]',
  },
  {
    name: 'Electric Lime',
    hex: '#84cc16', // lime-500
    bgRgba: 'rgba(132, 204, 22, 0.35)',
    glowRgba: 'rgba(132, 204, 22, 0.9)',
    ringClass: 'ring-[#84cc16]',
  },
  {
    name: 'Amber Gold',
    hex: '#f59e0b', // amber-500
    bgRgba: 'rgba(245, 158, 11, 0.35)',
    glowRgba: 'rgba(245, 158, 11, 0.9)',
    ringClass: 'ring-[#f59e0b]',
  },
  {
    name: 'Bright Purple',
    hex: '#a855f7', // purple-500
    bgRgba: 'rgba(168, 85, 247, 0.35)',
    glowRgba: 'rgba(168, 85, 247, 0.9)',
    ringClass: 'ring-[#a855f7]',
  },
  {
    name: 'Sunset Orange',
    hex: '#f97316', // orange-500
    bgRgba: 'rgba(249, 115, 22, 0.35)',
    glowRgba: 'rgba(249, 115, 22, 0.9)',
    ringClass: 'ring-[#f97316]',
  },
  {
    name: 'Emerald Green',
    hex: '#10b981', // emerald-500
    bgRgba: 'rgba(16, 185, 129, 0.35)',
    glowRgba: 'rgba(16, 185, 129, 0.9)',
    ringClass: 'ring-[#10b981]',
  },
  {
    name: 'Sky Blue',
    hex: '#38bdf8', // sky-400
    bgRgba: 'rgba(56, 189, 248, 0.35)',
    glowRgba: 'rgba(56, 189, 248, 0.9)',
    ringClass: 'ring-[#38bdf8]',
  },
];

export function getPlayerColor(index: number): PlayerThemeColor {
  const safeIndex = Math.abs(index) % PLAYER_COLORS.length;
  return PLAYER_COLORS[safeIndex];
}
