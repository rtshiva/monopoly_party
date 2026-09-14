/**
 * debug.ts — Always-on JSONL diagnostics journal.
 *
 * One line per significant server event (boot, seat changes, timer fires,
 * auction lifecycle, broadcast meta, hygiene purges). Each line carries the
 * room code + turn + rev so it joins with the client's ?debug=1 buffer and
 * the Postgres game_events table when root-causing a live incident.
 *
 * On by default (DEBUG_LOG=1); set DEBUG_LOG=0 to silence. Best-effort:
 * async appends, 5MB rotation, and it NEVER throws into game logic.
 * Secret rule: never log control keys or raw payloads — call sites pass only
 * the safe fields they name explicitly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const DATA_DIR = path.resolve(path.dirname(__filename), '../data');
const MAX_BYTES = 5 * 1024 * 1024;

export interface DebugFields {
  /** short event name, e.g. 'timeout.fire', 'auction.resolve', 'emit' */
  evt: string;
  code?: string;
  turn?: number;
  rev?: number;
  seat?: string;
  msg?: string;
  ms?: number;
  error?: string;
  [k: string]: unknown;
}

let stream: fs.WriteStream | null = null;
let streamFile: string | null = null;
let bytes = 0;

function enabled(): boolean {
  return process.env.DEBUG_LOG !== '0';
}

function filePath(): string {
  return process.env.LOG_FILE ?? path.join(DATA_DIR, 'debug.log');
}

function rotate(file: string) {
  try {
    stream?.close();
    stream = null;
    fs.renameSync(file, `${file}.1`);
  } catch { /* start fresh below regardless */ }
}

/** Append one journal line. Never throws. */
export function dlog(fields: DebugFields) {
  try {
    if (!enabled()) return;
    const file = filePath();
    if (!stream || streamFile !== file) {
      try { stream?.close(); } catch { /* noop */ }
      stream = null;
      streamFile = file;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        bytes = fs.statSync(file).size;
      } catch {
        bytes = 0;
      }
      if (bytes >= MAX_BYTES) rotate(file);
      stream = fs.createWriteStream(file, { flags: 'a' });
      stream.on('error', () => {
        try { stream?.close(); } catch { /* noop */ }
        stream = null;
      });
    }
    const line = JSON.stringify({ ts: new Date().toISOString(), ...fields }) + '\n';
    bytes += Buffer.byteLength(line);
    stream.write(line);
    if (bytes >= MAX_BYTES) rotate(file);
  } catch { /* diagnostics must never break the game */ }
}

/** Last N journal lines (newest first) for the debug endpoint. Never throws. */
export function tailLog(n: number): string[] {
  try {
    if (!enabled()) return [];
    const raw = fs.readFileSync(filePath(), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(Math.max(0, lines.length - Math.max(1, Math.min(200, n))));
  } catch {
    return [];
  }
}
