/**
 * Client diagnostics ring buffer. Records socket ack errors, delta
 * fallbacks, and render-gate tripwires (e.g. a suppressed dice preview —
 * the exact signature of the 4+4-vs-6+2 incident). View with ?debug=1
 * (DebugPanel); nothing leaves the device. No secrets ever: codes and
 * errors only, never keys or PINs.
 *
 * The buffer also persists to localStorage so refreshes and crashes keep
 * their evidence: throttled writes while running (at most every
 * PERSIST_MIN_INTERVAL_MS when dirty) plus a guaranteed flush on pagehide,
 * 24h retention, previous session restored underneath a marker line.
 */
export interface DbgEntry {
  at: number;
  evt: string;
  msg: string;
}

const MAX = 120;
const LS_KEY = 'monopoly.debug';
const PERSIST_MIN_INTERVAL_MS = 30 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

const buf: DbgEntry[] = [];
let dirty = false;
let lastPersist = 0;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideHooked = false;

/** Drop entries older than maxAgeMs (pure — unit-tested). */
export function pruneEntries(entries: DbgEntry[], nowMs: number, maxAgeMs: number): DbgEntry[] {
  return entries.filter((e) => typeof e?.at === 'number' && nowMs - e.at <= maxAgeMs);
}

function persistNow() {
  try {
    if (typeof localStorage === 'undefined' || !dirty) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: Date.now(), entries: buf }));
    dirty = false;
    lastPersist = Date.now();
  } catch { /* private mode / quota: memory buffer still works */ }
}

function schedulePersist() {
  dirty = true;
  try {
    if (typeof window === 'undefined') return;
    if (!pagehideHooked) {
      pagehideHooked = true;
      window.addEventListener('pagehide', persistNow);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persistNow();
      });
    }
    if (trailingTimer != null) return;
    const wait = Math.max(0, PERSIST_MIN_INTERVAL_MS - (Date.now() - lastPersist));
    trailingTimer = setTimeout(() => {
      trailingTimer = null;
      persistNow();
    }, wait);
  } catch { /* noop */ }
}

function restore(): DbgEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) return [];
    const entries = pruneEntries(parsed.entries as DbgEntry[], Date.now(), RETENTION_MS);
    return entries.slice(-MAX);
  } catch {
    return [];
  }
}

// Restore once at module load: previous session underneath a marker.
try {
  const prev = restore();
  if (prev.length > 0) {
    buf.push(...prev);
    buf.push({ at: Date.now(), evt: 'session', msg: `restored ${prev.length} entries from previous session` });
  }
} catch { /* noop */ }

export function dlogc(evt: string, msg = '') {
  buf.push({ at: Date.now(), evt, msg });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  try {
    // Mirror to console so browser devtools/inspect captures all events
    console.log(`[debug] ${evt}${msg ? `: ${msg}` : ''}`);
  } catch { /* noop */ }
  schedulePersist();
}

/** Clear the in-memory and persisted ring buffer. */
export function clearDebugBuffer() {
  buf.length = 0;
  dirty = true;
  persistNow();
}

/** Newest-first snapshot for the overlay. */
export function debugBuffer(): DbgEntry[] {
  return [...buf].reverse();
}

export function debugEnabled(search?: string): boolean {
  try {
    const s = search ?? (typeof window !== 'undefined' ? window.location?.search ?? '' : '');
    const p = new URLSearchParams(s);
    // Hardcoded enabled till stability; can still be explicitly disabled via ?debug=0
    return p.get('debug') !== '0';
  } catch {
    return true;
  }
}
