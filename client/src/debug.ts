/**
 * Client diagnostics ring buffer. Records socket ack errors, delta
 * fallbacks, and render-gate tripwires (e.g. a suppressed dice preview —
 * the exact signature of the 4+4-vs-6+2 incident). In-memory only, newest
 * wins at 120 entries. View with ?debug=1 (DebugPanel); nothing leaves the
 * device. No secrets ever: codes and errors only, never keys or PINs.
 */
export interface DbgEntry {
  at: number;
  evt: string;
  msg: string;
}

const buf: DbgEntry[] = [];
const MAX = 120;

export function dlogc(evt: string, msg = '') {
  buf.push({ at: Date.now(), evt, msg });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

/** Newest-first snapshot for the overlay. */
export function debugBuffer(): DbgEntry[] {
  return [...buf].reverse();
}

export function debugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}
