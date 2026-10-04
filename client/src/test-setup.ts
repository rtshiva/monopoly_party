/**
 * test-setup.ts — Shared vitest setup (wired via setupFiles in vitest.config).
 * jest-dom matchers + Testing Library cleanup (auto-cleanup needs globals,
 * which this repo doesn't enable, so it runs explicitly after each test).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
