import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RoomState } from '@monopoly/shared';

const __filename = fileURLToPath(import.meta.url);
// src/persist.ts -> src/../data, dist/persist.js -> dist/../data. Both resolve to server/data.
const DATA_DIR = path.resolve(path.dirname(__filename), '../data');

function filePath(): string {
  return process.env.ROOMS_FILE ?? path.join(DATA_DIR, 'rooms.json');
}

/** Crash-safe snapshot of all rooms. Best-effort: never throws into game logic. */
export function saveRooms(rooms: Map<string, RoomState>) {
  try {
    const file = filePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...rooms.values()]));
    fs.renameSync(tmp, file);
  } catch { /* persistence must never break a live game */ }
}

export function loadRooms(): RoomState[] {
  try {
    const file = filePath();
    if (!fs.existsSync(file)) return [];
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is RoomState =>
      !!r && typeof (r as RoomState).code === 'string' && Array.isArray((r as RoomState).players));
  } catch { return []; }
}
