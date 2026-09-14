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

const __filename = fileURLToPath(import.meta.url);
// Prefer the dev source tree, fall back to the prod build output.
function candidates(): string[] {
  const here = path.dirname(__filename);
  return [
    path.resolve(here, '../../client/public/themes'),
    path.resolve(here, '../client/dist/themes'),
  ];
}

export function themesDir(): string | null {
  for (const dir of candidates()) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch { /* try next */ }
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

export const TILE_ART_KEYS = [
  'brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue',
  'railroad', 'utility', 'tax', 'chance', 'chest', 'go', 'jail', 'parking', 'gotojail',
];

/** Turn `dinosaur-park` into `Dinosaur Park`. Pure. */
export function prettifyThemeName(id: string): string {
  return id.split(/[-_]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/**
 * Read WebP dimensions from the file header (no image dependency).
 * Handles VP8 (lossy), VP8L (lossless) and VP8X (extended) containers.
 * Returns null when the file isn't a parseable WebP. Pure w.r.t. parsing —
 * takes a buffer so unit tests don't need fixture files.
 */
export function probeWebp(buf: Buffer): { w: number; h: number } | null {
  try {
    if (buf.length < 30) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    let off = 12;
    while (off + 8 <= buf.length) {
      const fourcc = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      const data = off + 8;
      if (fourcc === 'VP8X' && data + 10 <= buf.length) {
        const w = buf.readUIntLE(data + 4, 3) + 1;
        const h = buf.readUIntLE(data + 7, 3) + 1;
        return { w, h };
      }
      if (fourcc === 'VP8 ' && data + 10 <= buf.length) {
        if (buf[data + 3] !== 0x9d || buf[data + 4] !== 0x01 || buf[data + 5] !== 0x2a) return null;
        return { w: buf.readUInt16LE(data + 6) & 0x3fff, h: buf.readUInt16LE(data + 8) & 0x3fff };
      }
      if (fourcc === 'VP8L' && data + 5 <= buf.length) {
        if (buf[data] !== 0x2f) return null;
        const b1 = buf[data + 1], b2 = buf[data + 2], b3 = buf[data + 3], b4 = buf[data + 4];
        const w = (b1 | ((b2 & 0x3f) << 8)) + 1;
        const h = (((b2 >> 6) & 0x03) | (b3 << 2) | ((b4 & 0x0f) << 10)) + 1;
        return { w, h };
      }
      off = data + size + (size % 2);
      if (size <= 0 || off <= data) break;
    }
    return null;
  } catch {
    return null;
  }
}

/** Sniff a renamed upload: PNG/JPEG masquerading as .webp still renders in
 *  browsers but wastes bandwidth (discworld-center was a 12MB PNG). Pure. */
export function sniffKind(buf: Buffer): 'webp' | 'png' | 'jpeg' | null {
  try {
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
    return null;
  } catch {
    return null;
  }
}

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
    } catch { /* dims stay null */ }
    return { bytes: st.size, dims, kind };
  } catch {
    return null;
  }
}

function walkCenterFiles(dir: string, base: string, out: string[]) {
  let entries: fs.Dirent[] = [];
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
      const file = parts[parts.length - 1];
      const prefix = file.slice(0, -'-center.webp'.length);
      if (!prefix) continue;
      // Nested `discworld/discworld-center.webp` → id from the folder (covers
      // the existing city/dinosaur-park/space-city layouts); loose
      // `grandprix-center.webp` → id from the file prefix.
      const id = parts.length > 1 ? parts[parts.length - 2] : prefix;
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) continue;
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      const urlBase = dir ? `/themes/${dir}/${prefix}` : `/themes/${prefix}`;
      const centerFile = path.join(base, dir, `${prefix}-center.webp`);
      const tileArt: Record<string, string> = {};
      const tiles: string[] = [];
      const warnings: string[] = [];
      const centerStat = statFile(centerFile);
      if (centerStat) {
        if (!centerStat.dims) {
          warnings.push(centerStat.kind && centerStat.kind !== 'webp'
            ? `${prefix}-center.webp: not a WebP (${centerStat.kind.toUpperCase()} renamed?)`
            : `${prefix}-center.webp: unreadable WebP header`);
        } else {
          if (centerStat.dims.w !== centerStat.dims.h) warnings.push(`${prefix}-center.webp: not square (${centerStat.dims.w}×${centerStat.dims.h})`);
          if (centerStat.dims.w < 1024) warnings.push(`${prefix}-center.webp: small (${centerStat.dims.w}px, min 1024)`);
        }
        if (centerStat.bytes > 600 * 1024) warnings.push(`${prefix}-center.webp: heavy (${Math.round(centerStat.bytes / 1024)}KB, aim <600KB)`);
      }
      const missing: string[] = [];
      for (const k of TILE_ART_KEYS) {
        const f = path.join(base, dir, `${prefix}-tile-${k}.webp`);
        const st = statFile(f);
        if (!st) { missing.push(k); continue; }
        tiles.push(k);
        tileArt[k] = `${urlBase}-tile-${k}.webp`;
        if (!st.dims) {
          warnings.push(st.kind && st.kind !== 'webp'
            ? `${prefix}-tile-${k}.webp: not a WebP (${st.kind.toUpperCase()} renamed?)`
            : `${prefix}-tile-${k}.webp: unreadable WebP header`);
        } else {
          if (st.dims.w !== st.dims.h) warnings.push(`${prefix}-tile-${k}.webp: not square (${st.dims.w}×${st.dims.h})`);
          if (st.dims.w < 256) warnings.push(`${prefix}-tile-${k}.webp: small (${st.dims.w}px, min 256)`);
        }
        if (st.bytes > 80 * 1024) warnings.push(`${prefix}-tile-${k}.webp: heavy (${Math.round(st.bytes / 1024)}KB, aim <80KB)`);
      }
      if (out.some((t) => t.id === id)) continue;
      out.push({ id, name: prettifyThemeName(id), center: `${urlBase}-center.webp`, dir, prefix, tiles, tileArt, missing, warnings });
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
