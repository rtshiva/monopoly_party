import { defineConfig } from 'vitest/config';

// Test-only config: the app build (vite build + tsc) is untouched.
// Picks up co-located *.test.ts next to the pure helpers it covers.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
