import { describe, expect, it } from 'vitest';
import { formatSpeech } from './announcer';

describe('formatSpeech', () => {
  it('formats rent payments into spoken sentences', () => {
    const s = formatSpeech('Siva paid $1050 rent to Anu');
    expect(s).toBe('Rent! Siva paid 1050 dollars rent to Anu!');
  });

  it('formats passing GO and collecting salary', () => {
    const s = formatSpeech('Anu passed GO (+$200)');
    expect(s).toBe('Anu passed GO and collected 200 dollars!');
  });

  it('formats property purchases', () => {
    const s = formatSpeech('Zed bought Boardwalk for $400');
    expect(s).toBe('Zed acquired Boardwalk for 400 dollars!');
  });

  it('formats property building upgrades', () => {
    const s = formatSpeech('Siva built on Park Place');
    expect(s).toBe('Siva upgraded property on Park Place!');
  });

  it('formats victories and champion praise', () => {
    const s = formatSpeech('Siva wins the game!');
    expect(s).toContain('Siva wins the game!');
    expect(s).toContain('Congratulations to our champion!');
  });

  it('formats bankruptcy declarations', () => {
    const s = formatSpeech('Anu is bankrupt');
    expect(s).toContain('Anu has declared bankruptcy!');
  });

  it('formats jail sentences', () => {
    const s = formatSpeech('Mia went to JAIL');
    expect(s).toContain('sent directly to jail');
  });

  it('formats auction milestones', () => {
    const open = formatSpeech('Auction started for Park Place');
    expect(open).toBe('Auction opened for Park Place! Place your bids!');

    const won = formatSpeech('Anu won Boardwalk auction for $350');
    expect(won).toBe('Sold! Anu won Boardwalk for 350 dollars!');
  });

  it('returns null for routine non-headline events', () => {
    expect(formatSpeech('')).toBeNull();
    expect(formatSpeech('Siva rolled 5 + 3 = 8')).toBeNull();
    expect(formatSpeech('Anu ended turn')).toBeNull();
  });
});
