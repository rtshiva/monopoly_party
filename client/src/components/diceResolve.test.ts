import { describe, expect, it } from 'vitest';
import { resolveDiceFaces } from './diceResolve';

// Commits the cases previously verified via a throwaway node script: the
// phone renders its shuffle preview only while actively shaking/committing,
// otherwise the authoritative server dice win.
describe('resolveDiceFaces', () => {
  it('shows preview while active', () => {
    expect(resolveDiceFaces([4, 4], true, [6, 2])).toEqual([4, 4]);
  });
  it('server wins when idle', () => {
    expect(resolveDiceFaces([4, 4], false, [6, 2])).toEqual([6, 2]);
  });
  it('falls back to server dice without preview', () => {
    expect(resolveDiceFaces(null, true, [6, 2])).toEqual([6, 2]);
    expect(resolveDiceFaces(null, false, [1, 1])).toEqual([1, 1]);
  });
});
