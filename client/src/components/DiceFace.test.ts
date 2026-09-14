import { describe, expect, it } from 'vitest';
import { nextRotation } from './DiceFace';

// Locks the tumble math behind the dice fix: every authoritative roll must
// land exactly on its face (mod 360), always spinning forward, including
// wraparound — a skipped or short rotation is what used to strand fantasy
// faces on the roller's screen.
describe('nextRotation', () => {
  it('lands on the target face', () => {
    const r = nextRotation({ x: 0, y: 0 }, 5);
    expect(r.x % 360).toBe(90);
    expect(r.y % 360).toBe(0);
  });
  it('always spins forward', () => {
    const r = nextRotation({ x: 100, y: 200 }, 1);
    expect(r.x).toBeGreaterThanOrEqual(100);
    expect(r.y).toBeGreaterThanOrEqual(200);
  });
  it('wraps around instead of spinning back', () => {
    const r = nextRotation({ x: 350, y: 0 }, 1);
    expect(r.x % 360).toBe(0);
    expect(r.x).toBeGreaterThan(350);
  });
  it('falls back to face 1', () => {
    const r = nextRotation({ x: 0, y: 0 }, 99);
    expect(r.x % 360).toBe(0);
    expect(r.y % 360).toBe(0);
  });
});
