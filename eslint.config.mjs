// Root ESLint flat config: arch boundaries + TS hygiene.
// Run: npm run lint  (wired into `npm run verify`).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.mjs', 'client/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Catches stale-closure / missing-dep effect bugs in socket screens.
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    // shared/ stays pure: no server-only modules.
    files: ['shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'socket.io', message: 'shared/ must stay pure (no server IO).' },
            { name: 'express', message: 'shared/ must stay pure (no server IO).' },
            { name: 'fs', message: 'shared/ must stay pure (no fs).' },
            { name: 'node:fs', message: 'shared/ must stay pure (no fs).' },
          ],
          patterns: [{ group: ['../server/*', './server/*'], message: 'shared/ must not import server modules.' }],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // broadcast.ts is the only IO boundary: getIo() lives here (+ its definition in store.ts).
    files: ['server/src/**/*.ts'],
    ignores: ['server/src/core/broadcast.ts', 'server/src/store.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*store*'],
              importNames: ['getIo'],
              message: 'Only core/broadcast.ts may call getIo() — use emit()/notifyEvicted() instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/src/**/*.ts', 'client/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
