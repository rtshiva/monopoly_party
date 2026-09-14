# Working agreements (read every session)

This repo builds a LAN party game with AI-assisted development. These rules
exist because each one was learned from a real incident in `DESIGN.md` scope.

## 1. One gate: `npm run verify`
`verify` = all three builds + server suites (unit, 21-game sim, live socket
regression) + client vitest. Never declare work done on a subset — the stale
`shared/dist` incident proved partial runs lie. CI runs the same command.

## 2. Feature cycles (see `.opencode/skills/feature-cycle/SKILL.md`)
Review → plan (show it, wait) → implement (one feature, smallest diff) →
review the diff → verify → report. Never stack uncommitted cycles.

## 3. Architecture (see `.agents/skills/monopoly-arch/SKILL.md`)
One concern per file (~150-line signal), thin handlers, `broadcast.ts` is the
only IO boundary, `shared/` stays pure, typed `GameError` codes.

## 4. Money and state integrity
Server validates turn, ownership, funds, status, tile kinds. Amounts are
finite integers before arithmetic. New error codes go in the `GameError`
union first, with a client mapping and a test.

## 5. Tests are hermetic
Every suite rebuilds its own inputs (`test:unit`/`test:sim` rebuild shared
first). No test trusts another step's artifacts. Sim seeds are fixed so CI
is deterministic. Data tables get shape tests, not just spot checks.

## 6. Observability stays on
Journal (`server/data/debug.log`), flight recorder (`BOT_DEBUG=1`), client
`?debug=1` overlay, `GET /api/debug/summary`. Bug reports ship with the
summary + a debug screenshot. After game night, grep the journal for
`void|FAIL|mismatch` before reading code.

## 7. Commits
Only on explicit request. Format `Stage N: <feature>` + one body line + test
result. Never commit red builds, build output, or snapshots.
