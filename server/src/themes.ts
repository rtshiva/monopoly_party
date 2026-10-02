/**
 * themes.ts — Drop-in board-skin discovery.
 *
 * A theme is a folder (or loose files) under client/public/themes/
 * containing `<prefix>-center.webp`, e.g. `discworld/discworld-center.webp`.
 * Per-tile art follows `<prefix>-tile-<key>.webp` (keys: 8 street colors +
 * railroad/utility/tax/chance/chest/go/jail/parking/gotojail); present files
 * are reported, missing keys fall back to plain colors client-side.
 *
 * Persistence boundary (like persist.ts): fs reads only, no game logic,
 * never throws. Scanned live per request so newly dropped themes appear
 * without a restart (validation) — migration uses the boot-time scan.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOARD_STYLES } from '@monopoly/shared';
import { validateThemeArt } from './themes-validate.js';

const __filename = fileURLToPath(import.meta.url);
// Prefer the dev source tree, fall back to the prod build output.
function candidates(): string[] {
  const here = path.dirname(__filename);
  return [path.resolve(here, '../../client/public/themes'), path.resolve(here, '../client/dist/themes')];
}

export function themesDir(): string | null {
  for (const dir of candidates()) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* try next */
    }
  }
  return null;
}

export interface DiscoveredTheme {
  id: string;
  name: string;
  /** Web URL (dev + prod share the /themes/ mount). */
  center: string;
  dir: string;
  prefix: string;
  /** Tile-art keys with a file on disk. */
  tiles: string[];
  /** Ready-to-render art URLs by key (convention-built, existence-checked). */
  tileArt: Record<string, string>;
  /** Art keys with no file (plain-color fallback client-side). */
  missing: string[];
  /** Human-readable art problems (dimensions, weight). Empty when clean. */
  warnings: string[];
}

/** Turn `dinosaur-park` into `Dinosaur Park`. Pure. */
export function prettifyThemeName(id: string): string {
  return id
    .split(/[-_]+/)
    .map((w) => (w ? `${w[0]?.toUpperCase() ?? ''}${w.slice(1)}` : w))
    .join(' ');
}

function walkCenterFiles(dir: string, base: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue;
      walkCenterFiles(full, base, out);
    } else if (e.isFile() && e.name.endsWith('-center.webp')) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
}

/** Scan for themes. Never throws — empty list on any failure. */
export function discoverThemes(fromDir?: string): DiscoveredTheme[] {
  try {
    const base = fromDir ?? themesDir();
    if (!base) return [];
    const found: string[] = [];
    walkCenterFiles(base, base, found);
    const out: DiscoveredTheme[] = [];
    for (const rel of found.sort()) {
      const parts = rel.split('/');
      const file = parts[parts.length - 1] ?? '';
      const prefix = file.slice(0, -'-center.webp'.length);
      if (!prefix) continue;
      // Nested `discworld/discworld-center.webp` → id from the folder (covers
      // the existing city/dinosaur-park/space-city layouts); loose
      // `grandprix-center.webp` → id from the file prefix.
      const id = parts.length > 1 ? (parts[parts.length - 2] ?? prefix) : prefix;
      if (!id || !/^[a-z0-9][a-z0-9-_]*$/i.test(id)) continue;
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      const urlBase = dir ? `/themes/${dir}/${prefix}` : `/themes/${prefix}`;
      const { tiles, tileArt, missing, warnings } = validateThemeArt(base, dir, prefix, urlBase);
      if (out.some((t) => t.id === id)) continue;
      out.push({
        id,
        name: prettifyThemeName(id),
        center: `${urlBase}-center.webp`,
        dir,
        prefix,
        tiles,
        tileArt,
        missing,
        warnings,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Built-in id or a discovered folder — the setBoardStyle/createRoom gate. */
export function isKnownStyle(style: unknown, fromDir?: string): style is string {
  if (typeof style !== 'string' || !style) return false;
  if ((BOARD_STYLES as readonly string[]).includes(style)) return true;
  return discoverThemes(fromDir).some((t) => t.id === style);
}
