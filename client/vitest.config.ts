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
      // Ratchet floors (measured 2026-10-04: 25/67/52/25): fail the coverage
      // run on silent drops, never gate `verify`. Raise these when adding
      // tests — never lower them to make red green.
      thresholds: { statements: 20, branches: 60, functions: 45, lines: 20 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'coverage/**', 'dist/**'],
      all: true,
    },
  },
});
