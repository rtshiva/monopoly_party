/**
 * history.ts — Durable per-game event log in Postgres.
 *
 * Persistence boundary (like persist.ts): JSON in, SQL out, no game logic.
 * Optional: without DATABASE_URL every function is an immediate no-op, so
 * local/dev/test runs behave exactly as before. All failures are swallowed —
 * history must never break a live game.
 *
 * Write path: broadcast.emit() calls flushHistory(room) fire-and-forget.
 * Only log entries newer than the per-room cursor are INSERTed (oldest
 * first), with ON CONFLICT DO NOTHING so multi-instance double-writes are
 * harmless. Read path: GET /api/history/:code serves recent rows.
 */
import type { RoomState } from '@monopoly/shared';

type PgClient = {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
};

let clientP: Promise<PgClient | null> | null = null;
let ensured = false;
/** room code -> newest log entry id already flushed. Memory-only. */
const cursors = new Map<string, string>();

async function getDb(): Promise<PgClient | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!clientP) {
    clientP = (async () => {
      try {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: url, connectionTimeoutMillis: 2000 });
        client.on('error', () => { /* best-effort; file snapshots cover state */ });
        await Promise.race([
          client.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('pg timeout')), 2500)),
        ]);
        return client as unknown as PgClient;
      } catch {
        clientP = null; // reconnect-on-demand on the next flush
        return null;
      }
    })();
  }
  return clientP;
}

async function ensureTable(db: PgClient): Promise<void> {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS game_events (
      code TEXT NOT NULL,
      event_id TEXT NOT NULL PRIMARY KEY,
      text TEXT NOT NULL,
      tone TEXT,
      cat TEXT,
      turn INT,
      at BIGINT NOT NULL
    )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS game_events_code_at ON game_events (code, at DESC)`);
  ensured = true;
}

/** Append new log entries for a room. Fire-and-forget from emit(); never throws. */
export async function flushHistory(room: RoomState): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTable(db);
    const cursor = cursors.get(room.code);
    // room.log is newest-first; collect unseen entries oldest-first.
    const fresh: typeof room.log = [];
    for (const e of room.log) {
      if (cursor !== undefined && e.id === cursor) break;
      fresh.unshift(e);
      if (fresh.length >= 80) break; // log() caps the feed; never backfill more
    }
    if (fresh.length === 0) return;
    for (const e of fresh) {
      await db.query(
        `INSERT INTO game_events (code, event_id, text, tone, cat, turn, at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (event_id) DO NOTHING`,
        [room.code, e.id, e.text, e.tone ?? null, e.cat ?? null, e.turn ?? null, e.at],
      );
    }
    cursors.set(room.code, room.log[0].id);
  } catch { /* history must never break a live game */ }
}

export interface HistoryRow {
  event_id: string; text: string; tone: string | null; cat: string | null;
  turn: number | null; at: number;
}

/** Recent events for a room, newest first. Empty when unconfigured/offline. */
export async function readHistory(code: string, limit: number): Promise<HistoryRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    await ensureTable(db);
    const n = Math.max(1, Math.min(200, Math.floor(limit) || 100));
    const { rows } = await db.query(
      `SELECT event_id, text, tone, cat, turn, at FROM game_events
       WHERE code = $1 ORDER BY at DESC LIMIT $2`,
      [code, n],
    );
    return rows as unknown as HistoryRow[];
  } catch {
    return [];
  }
}

/** Forget a room's flush cursor (expiry/teardown hygiene). */
export function forgetHistory(code: string) {
  cursors.delete(code);
}
