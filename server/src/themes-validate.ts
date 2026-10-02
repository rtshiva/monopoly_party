/**
 * themes-validate.ts — Per-file art validation for drop-in board skins.
 *
 * Extracted from themes.ts (one concern per file): discovery (what exists on
 * disk) stays in themes.ts; the "is the art good" checks live here. Pure fs
 * probing, never throws (null/empty on any failure).
 */
import fs from 'fs';
import path from 'path';
import { probeWebp, sniffKind } from './themes-webp.js';

export const TILE_ART_KEYS = [
  'brown',
  'lightblue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'blue',
  'railroad',
  'utility',
  'tax',
  'chance',
  'chest',
  'go',
  'jail',
  'parking',
  'gotojail',
];

export interface FileStat {
  bytes: number;
  dims: { w: number; h: number } | null;
  /** Actual container (catches PNG/JPEG renamed to .webp). */
  kind: 'webp' | 'png' | 'jpeg' | null;
}

function statFile(file: string): FileStat | null {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    let dims: { w: number; h: number } | null = null;
    let kind: FileStat['kind'] = null;
    try {
      const fd = fs.openSync(file, 'r');
      const head = Buffer.alloc(4096);
      const n = fs.readSync(fd, head, 0, 4096, 0);
      fs.closeSync(fd);
      const slice = head.subarray(0, n);
      dims = probeWebp(slice);
      kind = sniffKind(slice);
    } catch {
      /* dims stay null */
    }
    return { bytes: st.size, dims, kind };
  } catch {
    return null;
  }
}

export interface ThemeArt {
  /** Tile-art keys with a file on disk. */
  tiles: string[];
  /** Ready-to-render art URLs by key (convention-built, existence-checked). */
  tileArt: Record<string, string>;
  /** Art keys with no file (plain-color fallback client-side). */
  missing: string[];
  /** Human-readable art problems (dimensions, weight). Empty when clean. */
  warnings: string[];
}

/** Validate one theme's center + tile art. Never throws. */
export function validateThemeArt(base: string, dir: string, prefix: string, urlBase: string): ThemeArt {
  const tiles: string[] = [];
  const tileArt: Record<string, string> = {};
  const missing: string[] = [];
  const warnings: string[] = [];
  const centerStat = statFile(path.join(base, dir, `${prefix}-center.webp`));
  if (centerStat) {
    if (!centerStat.dims) {
      warnings.push(
        centerStat.kind && centerStat.kind !== 'webp'
          ? `${prefix}-center.webp: not a WebP (${centerStat.kind.toUpperCase()} renamed?)`
          : `${prefix}-center.webp: unreadable WebP header`,
      );
    } else {
      if (centerStat.dims.w !== centerStat.dims.h)
        warnings.push(`${prefix}-center.webp: not square (${centerStat.dims.w}×${centerStat.dims.h})`);
      if (centerStat.dims.w < 1024) warnings.push(`${prefix}-center.webp: small (${centerStat.dims.w}px, min 1024)`);
    }
    if (centerStat.bytes > 600 * 1024)
      warnings.push(`${prefix}-center.webp: heavy (${Math.round(centerStat.bytes / 1024)}KB, aim <600KB)`);
  }
  for (const k of TILE_ART_KEYS) {
    const f = path.join(base, dir, `${prefix}-tile-${k}.webp`);
    const st = statFile(f);
    if (!st) {
      missing.push(k);
      continue;
    }
    tiles.push(k);
    tileArt[k] = `${urlBase}-tile-${k}.webp`;
    if (!st.dims) {
      warnings.push(
        st.kind && st.kind !== 'webp'
          ? `${prefix}-tile-${k}.webp: not a WebP (${st.kind.toUpperCase()} renamed?)`
          : `${prefix}-tile-${k}.webp: unreadable WebP header`,
      );
    } else {
      if (st.dims.w !== st.dims.h) warnings.push(`${prefix}-tile-${k}.webp: not square (${st.dims.w}×${st.dims.h})`);
      if (st.dims.w < 256) warnings.push(`${prefix}-tile-${k}.webp: small (${st.dims.w}px, min 256)`);
    }
    if (st.bytes > 80 * 1024)
      warnings.push(`${prefix}-tile-${k}.webp: heavy (${Math.round(st.bytes / 1024)}KB, aim <80KB)`);
  }
  return { tiles, tileArt, missing, warnings };
}
