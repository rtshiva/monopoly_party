import { defineConfig } from 'vitest/config';

// Test-only config: the app build (vite build + tsc) is untouched.
// Picks up co-located *.test.ts next to the pure helpers it covers, plus
// *.test.tsx component tests (which opt into jsdom via a pragma comment).
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Warn-only v1: no thresholds so `verify` stays green while
      // reports are informational. Raise once baselines are known.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'coverage/**', 'dist/**'],
      all: true,
    },
  },
});
