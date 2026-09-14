import { describe, expect, it } from 'vitest';
import { minNextBid, nameOf, outbidBy, topBid } from './auctionNotify';
import type { RoomState } from '@monopoly/shared';

const base = {
  id: 'a1',
  tile: 1,
  startedBy: 'x',
  endsAt: Date.now() + 30000,
};

describe('topBid', () => {
  it('picks highest, earliest on ties', () => {
    const a = { ...base, bids: [{ playerId: 'p2', amount: 50, at: 2 }, { playerId: 'p1', amount: 50, at: 1 }] };
    expect(topBid(a)?.playerId).toBe('p1');
    expect(topBid({ ...base, bids: [] })).toBeNull();
  });
});

describe('minNextBid', () => {
  it('floors at $10, else top + 1', () => {
    expect(minNextBid({ ...base, bids: [] })).toBe(10);
    expect(minNextBid({ ...base, bids: [{ playerId: 'p', amount: 50, at: 1 }] })).toBe(51);
  });
});

describe('outbidBy', () => {
  const a = {
    ...base,
    bids: [
      { playerId: 'me', amount: 50, at: 1 },
      { playerId: 'you', amount: 80, at: 2 },
    ],
  };
  it('names the leader when I trail', () => {
    expect(outbidBy(a, 'me')).toBe('you');
  });
  it('stays quiet when leading or absent', () => {
    expect(outbidBy(a, 'you')).toBeNull();
    expect(outbidBy(a, 'ghost')).toBeNull();
    expect(outbidBy({ ...base, bids: [] }, 'me')).toBeNull();
  });
});

describe('nameOf', () => {
  it('falls back to ?', () => {
    const room = { players: [{ id: 'a', name: 'Anu' }] } as RoomState;
    expect(nameOf(room, 'a')).toBe('Anu');
    expect(nameOf(room, 'zzz')).toBe('?');
  });
});
