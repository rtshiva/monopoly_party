import { describe, expect, it } from 'vitest';
import { pruneEntries } from './debug';
import type { DbgEntry } from './debug';

describe('pruneEntries', () => {
  const now = 1_000_000;
  const mk = (at: number): DbgEntry => ({ at, evt: 'x', msg: '' });
  it('drops entries older than retention', () => {
    const out = pruneEntries([mk(now - 10), mk(now - 1000)], now, 100);
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe(now - 10);
  });
  it('drops malformed entries', () => {
    const out = pruneEntries([{ at: 'x' } as unknown as DbgEntry, mk(now)], now, 1000);
    expect(out).toHaveLength(1);
  });
  it('keeps boundary entries', () => {
    expect(pruneEntries([mk(now - 100)], now, 100)).toHaveLength(1);
  });
});
