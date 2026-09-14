import { describe, expect, it } from 'vitest';
import { GAME_ERRORS } from '@monopoly/shared';
import { friendlyError } from './friendlyError';

// Locks the incident where unmapped codes (e.g. ROOM_FULL) leaked raw into
// the banner: every union member must have a dedicated human message.
describe('friendlyError coverage', () => {
  it('maps every GameError', () => {
    const missing = GAME_ERRORS.filter((c) => friendlyError(c) === c || friendlyError(c) === 'Action failed');
    expect(missing).toEqual([]);
  });
  it('falls back gracefully', () => {
    expect(friendlyError(undefined)).toBe('Action failed');
    expect(friendlyError('')).toBe('Action failed');
  });
});
