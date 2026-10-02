import { describe, expect, it } from 'vitest';
import {
  BOARD,
  COLOR_HEX,
  GAME_ERRORS,
  MAX_BID,
  MAX_LOG_ENTRIES,
  applyCardEffect,
  netWorth,
  rentFor,
} from '@monopoly/shared';
import { friendlyError } from './friendlyError';
import { debugEnabled } from './debug';

describe('sibling-bug regression cover', () => {
  it('BOARD shape holds (40, rent x7, frozen)', () => {
    expect(BOARD.length).toBe(40);
    for (const t of BOARD) if (t.kind === 'property') expect((t as { rent: number[] }).rent.length).toBe(7);
    expect(Object.isFrozen(BOARD)).toBe(true);
    expect(Object.isFrozen(COLOR_HEX)).toBe(true);
  });
  it('GameError union maps both directions', () => {
    for (const c of GAME_ERRORS) expect(friendlyError(c)).not.toBe('Action failed');
    expect(GAME_ERRORS).toContain('NOTHING_TO_PASS');
    expect(friendlyError('NOTHING_TO_PASS')).toBe('Nothing to pass');
  });
  it('mapper has no dead codes (two-sided lock)', () => {
    expect(GAME_ERRORS).not.toContain('EXPIRED');
    expect(friendlyError('EXPIRED')).toBe('EXPIRED');
  });
  it('MAX caps exist', () => {
    expect(MAX_BID).toBe(100000);
    expect(MAX_LOG_ENTRIES).toBe(80);
  });
  it('rentFor survives corrupt levels', () => {
    const room = (level: unknown) =>
      ({ players: [{ id: 'o', properties: [1], mortgaged: [] }], buildings: { 1: level } }) as never;
    expect(rentFor(room(NaN), 1, 7)).toBe((BOARD[1] as { rent: number[] }).rent[0]);
    expect(rentFor(room('2'), 1, 7)).toBe((BOARD[1] as { rent: number[] }).rent[0]);
    expect(Number.isFinite(rentFor(room(Infinity), 1, 7))).toBe(true);
  });
  it('applyCardEffect clamps cards and heals cash', () => {
    const p = { cash: NaN, jailCards: 0, position: 0, inJail: false, jailTurns: 0 } as never;
    applyCardEffect(p, { cash: 100 });
    expect((p as { cash: number }).cash).toBe(1600);
    const q = { cash: 1500, jailCards: 0, position: 0, inJail: false, jailTurns: 0 } as never;
    applyCardEffect(q, { jailCards: -5 });
    expect((q as { jailCards: number }).jailCards).toBe(0);
  });
  it('netWorth survives corrupt snapshot', () => {
    const bad = { bankrupt: false, cash: NaN, properties: [1], mortgaged: 'x' } as never;
    expect(Number.isFinite(netWorth(bad, { buildings: { 1: NaN } } as never))).toBe(true);
  });
  it('debug overlay is gated (default off)', () => {
    expect(debugEnabled('')).toBe(false);
    expect(debugEnabled('?debug=1')).toBe(true);
    expect(debugEnabled('?debug=0')).toBe(false);
  });
});
