/**
 * playwright.config.ts — Minimal browser smoke (E2E), kept OUT of `verify`.
 *
 * verify stays fast and browser-free for CI; run this separately with
 * `npm run test:e2e` (builds server dist first, then drives real browsers
 * against vite dev + the built server with an isolated snapshot file).
 */
import { defineConfig } from '@playwright/test';
import os from 'os';
import path from 'path';

const e2eData = path.join(os.tmpdir(), 'monopoly-e2e');

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [{ name: 'chromium' }],
  webServer: [
    {
      // Built server (mirrors prod single-port layout via the client proxy).
      command: 'node dist/index.js',
      cwd: 'server',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: '3001',
        ROOMS_FILE: path.join(e2eData, 'rooms.json'),
        LOG_FILE: path.join(e2eData, 'debug.log'),
      },
    },
    {
      // Client from source (no client build needed); /api + socket proxy to :3001.
      command: 'vite --port 5173 --strictPort',
      cwd: 'client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      env: { PORT: '5173' },
    },
  ],
});
