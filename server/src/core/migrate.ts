/**
 * migrate.ts — Snapshot migration for rooms loaded from disk on startup.
 *
 * Extracted from index.ts once the field list passed ~15 entries (one concern
 * per file). Each field added in a later milestone is normalised here so old
 * snapshots remain compatible. Pure state normalisation — no I/O, no timers;
 * callers handle persistence and broadcast.
 */
import { DEFAULT_BOARD_STYLE } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { isKnownStyle } from '../themes.js';

function clampCash(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 1500;
}

/**
 * Normalise a loaded snapshot in place. Returns false when the room code
 * itself is corrupt — callers must skip (not store) such rooms.
 */
export function migrateRoom(room: RoomState): boolean {
  room.trades ??= [];
  room.buildings ??= {};
  room.auctionQueue ??= [];
  room.lastActivity ??= Date.now();
  room.rev ??= 0;
  if (!Number.isInteger(room.turnCount)) room.turnCount = 0;
  if (!Number.isInteger(room.turnIndex) || room.turnIndex < 0) room.turnIndex = 0;
  if (!Array.isArray(room.log)) room.log = [];
  if (!Array.isArray(room.players)) room.players = [];
  if (room.status !== 'lobby' && room.status !== 'playing' && room.status !== 'paused' && room.status !== 'finished') {
    room.status = 'lobby';
  }
  if (
    !Array.isArray(room.dice) ||
    room.dice.length !== 2 ||
    !room.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)
  ) {
    room.dice = [1, 1];
  }
  if (typeof room.code !== 'string' || !/^[A-Z0-9]{4,10}$/.test(room.code)) return false;
  // Ephemeral hold-to-roll presence: never restore a mid-shake flag.
  room.rollingId = null;
  // Nullable game fields added across milestones.
  room.lastRoll ??= null;
  room.lastCard ??= null;
  if (room.pendingBuy != null && (!Number.isInteger(room.pendingBuy) || room.pendingBuy < 0 || room.pendingBuy > 39)) {
    room.pendingBuy = null;
  } else room.pendingBuy ??= null;
  room.turnDeadline ??= null;
  room.pausedAt ??= null;
  room.winnerId ??= null;
  // Player fields added across milestones (pre-card / pre-timer snapshots).
  // Floor + clamp untrusted snapshot numbers at the read site: corrupt cash,
  // position, cards or deeds must never reach game arithmetic.
  for (const p of room.players) {
    p.cash = clampCash((p as { cash?: unknown }).cash);
    p.position = Number.isInteger(p.position) && p.position >= 0 && p.position <= 39 ? p.position : 0;
    p.mortgaged = Array.isArray(p.mortgaged) ? p.mortgaged.filter((t) => Number.isInteger(t) && t >= 0 && t <= 39) : [];
    p.properties = Array.isArray(p.properties)
      ? p.properties.filter((t) => Number.isInteger(t) && t >= 0 && t <= 39)
      : [];
    p.jailTurns = Number.isInteger(p.jailTurns) && p.jailTurns >= 0 ? p.jailTurns : 0;
    p.jailCards = Number.isInteger(p.jailCards) && p.jailCards >= 0 ? Math.min(p.jailCards, 20) : 0;
    p.doubles ??= 0;
    if (!Number.isInteger(p.doubles) || p.doubles < 0) p.doubles = 0;
    p.hasRolled ??= false;
    p.connected ??= false;
    p.seatPin ??= '0000';
    p.controllerLabel ??= null;
    p.isBot ??= false;
  }
  // Buildings: integer 0..5 only, drop corrupt levels.
  for (const k of Object.keys(room.buildings)) {
    const v = room.buildings[Number(k)];
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 5) delete room.buildings[Number(k)];
  }
  room.auctionQueue = room.auctionQueue.filter((t) => Number.isInteger(t) && t >= 0 && t <= 39);
  if (room.auction && (!Number.isInteger(room.auction.tile) || room.auction.tile < 0 || room.auction.tile > 39)) {
    room.auction = null;
  }
  if (room.auction) {
    room.auction.bids = room.auction.bids.filter(
      (b) => Number.isInteger(b.amount) && b.amount >= 10 && b.amount <= 100000,
    );
  }
  // Retired skins (maze/circuit) migrate forward; drop-in theme folders are
  // honoured so a reboot never resets a custom board. Unknown values reset.
  if (!isKnownStyle(room.boardStyle)) room.boardStyle = DEFAULT_BOARD_STYLE;
  // Normalize pre-card-era trade offers so old snapshots can't NaN the swap math.
  for (const t of room.trades) {
    t.giveCards = Number.isInteger(t.giveCards) && (t.giveCards as number) >= 0 ? t.giveCards : 0;
    t.wantCards = Number.isInteger(t.wantCards) && (t.wantCards as number) >= 0 ? t.wantCards : 0;
    t.giveCash =
      typeof t.giveCash === 'number' && Number.isInteger(t.giveCash) && t.giveCash >= 0
        ? Math.min(t.giveCash, 100000)
        : 0;
    t.wantCash =
      typeof t.wantCash === 'number' && Number.isInteger(t.wantCash) && t.wantCash >= 0
        ? Math.min(t.wantCash, 100000)
        : 0;
    t.giveTiles = Array.isArray(t.giveTiles) ? t.giveTiles.filter((x) => Number.isInteger(x) && x >= 0 && x <= 39) : [];
    t.wantTiles = Array.isArray(t.wantTiles) ? t.wantTiles.filter((x) => Number.isInteger(x) && x >= 0 && x <= 39) : [];
  }
  return true;
}
