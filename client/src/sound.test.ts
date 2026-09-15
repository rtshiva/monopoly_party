import { describe, it, expect, beforeEach, afterAll } from 'vitest';

// Provide global localStorage mock for Node test environment
const store: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  clear: () => { for (const k in store) delete store[k]; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};

(globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

// Now import module under test
const { isMuted, setMuted, getVolume, setVolume } = await import('./sound');

describe('sound controls', () => {
  beforeEach(() => {
    mockStorage.clear();
    setMuted(false);
    setVolume(0.8);
  });

  afterAll(() => {
    mockStorage.clear();
  });

  it('toggles muted state and persists to storage', () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(mockStorage.getItem('monopoly.muted')).toBe('1');
    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(mockStorage.getItem('monopoly.muted')).toBe('0');
  });

  it('adjusts volume and clamps within [0, 1]', () => {
    setVolume(0.5);
    expect(getVolume()).toBe(0.5);
    expect(mockStorage.getItem('monopoly.volume')).toBe('0.5');

    setVolume(1.5);
    expect(getVolume()).toBe(1);

    setVolume(-0.2);
    expect(getVolume()).toBe(0);
  });
});
