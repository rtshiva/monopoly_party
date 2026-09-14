/**
 * bots.ts — Bot turn scheduler.
 *
 * When the turn reaches a live bot seat, pokeBot() (called from armTurnTimer,
 * so every turn handoff is covered) schedules botAct() after a think delay.
 * botAct re-validates (token + seat + status + hammer) then runs one full
 * turn from botBrain.ts and broadcasts. At most one bot act is ever pending
 * per room. Bots never trade, bid, or get claimed — see botBrain.ts.
 */
import type { RoomState } from '@monopoly/shared';
import { botTimers, rooms } from '../store.js';
import { emit } from './broadcast.js';
import { dlog } from '../debug.js';
import { current } from './player.js';
import { botTakeTurn, type BotTrace } from './botBrain.js';

/** Visible "thinking" pause before a bot acts (TV shows the turn banner). */
export const BOT_THINK_MS = 2500;

export function clearBotTimer(code: string) {
  const t = botTimers.get(code);
  if (t) { clearTimeout(t); botTimers.delete(code); }
}

/**
 * Schedule a bot turn when the current seat is a live bot. Called from
 * armTurnTimer on every handoff; clears any stale timer first so at most one
 * bot act is ever pending per room.
 */
export function pokeBot(room: RoomState) {
  clearBotTimer(room.code);
  if (room.status !== 'playing') return;
  // Hammer down: bots bid like everyone else and take their turn after.
  if (room.auction) return;
  const me = current(room);
  if (me.bankrupt || !me.isBot) return;
  const token = room.turnCount;
  botTimers.set(
    room.code,
    setTimeout(() => {
      botTimers.delete(room.code);
      botAct(room.code, token);
    }, BOT_THINK_MS),
  );
}

/** Timer entry: re-validate everything, run one full turn, broadcast. */
export function botAct(code: string, turnCount: number) {
  botTimers.delete(code);
  const room = rooms.get(code);
  if (!room || room.status !== 'playing' || room.turnCount !== turnCount) return;
  // Poked before the hammer fell: stand down — resolveAuction() re-arms and
  // re-pokes when the slot frees up.
  if (room.auction) return;
  const me = current(room);
  if (me.bankrupt || !me.isBot) return;
  const trace: BotTrace[] = [];
  botTakeTurn(room, me, trace);
  if (process.env.BOT_DEBUG) {
    for (const e of trace) console.log(`[bot] ${room.code} turn#${room.turnCount} ${me.name} ${e.t} ${e.ok ? 'ok' : 'FAIL'} ${e.detail}`);
  }
  dlog({
    evt: 'bot.turn', code: room.code, turn: room.turnCount, seat: me.id,
    msg: trace.map((e) => `${e.t}:${e.ok ? 'ok' : 'FAIL'}`).join(' '),
  });
  emit(room);
}
