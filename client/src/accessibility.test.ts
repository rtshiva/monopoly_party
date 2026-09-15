import { describe, it, expect, beforeEach, afterAll } from 'vitest';

// Provide global localStorage and document mock for Node test environment
const store: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  clear: () => { for (const k in store) delete store[k]; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};

const classes = new Set<string>();
const mockDocument = {
  documentElement: {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
  },
};

(globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;
(globalThis as unknown as { document: typeof mockDocument }).document = mockDocument;

// Import module under test
const { isHighContrast, setHighContrast } = await import('./accessibility');

describe('accessibility settings', () => {
  beforeEach(() => {
    mockStorage.clear();
    classes.clear();
    setHighContrast(false);
  });

  afterAll(() => {
    mockStorage.clear();
    classes.clear();
  });

  it('toggles high contrast mode and updates localStorage and document', () => {
    expect(isHighContrast()).toBe(false);
    setHighContrast(true);
    expect(isHighContrast()).toBe(true);
    expect(mockStorage.getItem('monopoly.highContrast')).toBe('1');
    expect(classes.has('high-contrast')).toBe(true);

    setHighContrast(false);
    expect(isHighContrast()).toBe(false);
    expect(mockStorage.getItem('monopoly.highContrast')).toBe('0');
    expect(classes.has('high-contrast')).toBe(false);
  });
});
