import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RoomState } from '@monopoly/shared';

const __filename = fileURLToPath(import.meta.url);
// src/persist.ts -> src/../data, dist/persist.js -> dist/../data. Both resolve to server/data.
const DATA_DIR = path.resolve(path.dirname(__filename), '../data');

/** Single-key snapshot layout, shared by every server instance. */
export const ROOMS_REDIS_KEY = 'monopoly:rooms:v1';

function filePath(): string {
  return process.env.ROOMS_FILE ?? path.join(DATA_DIR, 'rooms.json');
}

function validRooms(raw: unknown): RoomState[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is RoomState =>
    !!r && typeof (r as RoomState).code === 'string' && Array.isArray((r as RoomState).players));
}

// ---------------------------------------------------------------------------
// Redis — optional, best-effort. No REDIS_URL means file-only (today's
// behaviour, including the regression suite). Failures never throw: the file
// snapshot is always written, so a dead Redis can never break a live game.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<unknown> };
let clientP: Promise<RedisClient | null> | null = null;

async function getRedis(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!clientP) {
    clientP = (async () => {
      try {
        const { createClient } = await import('redis');
        const client = createClient({
          url,
          // No auto-reconnect: a dead Redis must fail fast so boot and emit
          // fall back to the file snapshot. The next call retries (clientP
          // is cleared below), giving reconnect-on-demand.
          socket: { connectTimeout: 1500, reconnectStrategy: () => false as const },
        });
        client.on('error', () => { /* best-effort: file fallback covers us */ });
        await Promise.race([
          client.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 2500)),
        ]);
        return client as unknown as RedisClient;
      } catch {
        clientP = null; // allow a later emit to retry
        return null;
      }
    })();
  }
  return clientP;
}

/** Crash-safe file snapshot of all rooms. Best-effort: never throws into game logic. */
export function saveRooms(rooms: Map<string, RoomState>) {
  try {
    const file = filePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...rooms.values()]));
    fs.renameSync(tmp, file);
  } catch { /* persistence must never break a live game */ }
  // Fire-and-forget Redis mirror (when configured). Errors are swallowed
  // inside — emit() must never wait on or fail because of persistence.
  void saveRoomsRedis(rooms).catch(() => {});
}

async function saveRoomsRedis(rooms: Map<string, RoomState>): Promise<void> {
  const client = await getRedis();
  if (!client) return;
  try {
    await client.set(ROOMS_REDIS_KEY, JSON.stringify([...rooms.values()]));
  } catch { /* file snapshot already covers us */ }
}

export function loadRooms(): RoomState[] {
  try {
    const file = filePath();
    if (!fs.existsSync(file)) return [];
    return validRooms(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown);
  } catch { return []; }
}

/** Boot load: Redis first (shared state), file fallback. Never throws. */
export async function loadRoomsAsync(): Promise<RoomState[]> {
  try {
    const client = await getRedis();
    if (client) {
      try {
        const raw = await client.get(ROOMS_REDIS_KEY);
        if (raw) {
          const rooms = validRooms(JSON.parse(raw) as unknown);
          if (rooms.length > 0) return rooms;
        }
      } catch { /* fall through to file */ }
    }
  } catch { /* fall through to file */ }
  return loadRooms();
}
