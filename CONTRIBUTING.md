# Contributing

## The one gate

```bash
npm run verify   # all builds + server suites + client vitest. Green means done.
```

Work in single-feature cycles: review → plan (show it, wait) → implement
(smallest diff) → review the diff → verify → report. Details live in
`.opencode/skills/feature-cycle/SKILL.md`; architecture rules in
`.agents/skills/monopoly-arch/SKILL.md`. Commits only on explicit request.

## Where things live

| What | Where |
|---|---|
| Game design + use cases | `DESIGN.md` |
| Run/deploy/party setup | `README.md` |
| Board art spec + drop-in themes | `client/public/themes/README.md` |
| Debug playbook (journal, `?debug=1`, summary endpoint) | `README.md` → Debugging |
| CI (same `verify` command) | `.github/workflows/ci.yml` |

## Test layers

- `server/test/unit.mjs` — fast, hermetic, no sockets (rebuilds shared first)
- `server/test/sim.mjs` — 21 seeded full games through the production bot brain
- `server/test/regression.mjs` — live socket suite on an isolated port + snapshot file
- `client/src/**/*.test.ts` — vitest for pure client helpers

New game logic must be reachable from the sim; new error codes go in the
`GameError` union first with a client mapping and a test.
