---
name: monopoly-arch
description: >-
  Architecture and coding standards for the Monopoly Web App (monopoly_party).
  Activate this skill when adding new server features, creating files, or
  reviewing code in this project. Enforces the patterns established during the
  M0–M4 cleanup to prevent the maintainability issues found in the senior
  architect review.
---

# Monopoly Web App — Architecture Standards

This skill encodes the **must-follow** patterns for the `monopoly_web_app` project.
Violating these rules will recreate the maintainability debt that was cleaned up
in the September 2026 refactor. Always read this skill before adding or modifying
server-side code.

---

## 1. Module Structure (server)

The server is organised under `server/src/`:

```
server/src/
  core/
    auction.ts       ← Auction lifecycle (open, timer, resolve, queue)
    bankruptcy.ts    ← bankruptPlayer(), removeSeat()
    broadcast.ts     ← log(), emit() — the ONLY place that calls getIo()
    player.ts        ← makeCode(), current(), activePlayers(), advanceTurn(), checkWin()
    roll.ts          ← doRoll() and its sub-functions (resolveJail, moveToken, resolveTile)
    seat.ts          ← requireControl(), issueControl(), evictPreviousController()
    timers.ts        ← armTurnTimer(), clearTurnTimer(), resolveTurnTimeout()
    trade.ts         ← Trade helpers, isBuyable(), normTiles(), colorSetTiles()
  handlers/
    auctions.ts      ← Socket handler: auctionBid
    economy.ts       ← Socket handler: mortgage, bankrupt, useJailCard, buyHouse, sellHouse
    lobby.ts         ← Socket handler: createRoom, joinRoom, startGame, claimSeat, …
    trades.ts        ← Socket handler: tradeOffer, tradeRespond, tradeCancel
    turns.ts         ← Socket handler: rollDice, buyProperty, passProperty, endTurn, payJail
  index.ts           ← Express setup, Socket.IO init, room recovery, hygiene timer
  persist.ts         ← saveRooms() / loadRooms() — disk snapshot, no game logic
  store.ts           ← In-memory maps (rooms, seatKeys, seatSockets, timers) + uid()
```

### Rules
- **One concern per file.** If a file grows beyond ~150 lines, ask whether it is doing too much.
- **Handlers are thin.** Each socket handler file only: validates input, calls core functions, calls `emit()`. No game logic lives directly in handlers.
- **`broadcast.ts` is the only IO boundary.** No other file may call `getIo()` directly.
- **`persist.ts` has no game logic.** It reads and writes JSON. Period.
- **`store.ts` is pure data.** No game logic, no IO beyond the Socket.IO reference.

---

## 2. Shared Package (`shared/`)

The `shared/` package (`@monopoly/shared`) is imported by **both** client and server.

### Rules
- **All functions in `shared/` must be pure or side-effect-free.**
  - They may read from `BOARD` and constants.
  - They must NOT mutate `RoomState` or call any server-side module.
  - `drawChance()` and `drawChest()` return `{ text, effect: CardEffect }` — do NOT change them back to mutating functions.
- **`applyCardEffect(player, effect)` lives in `engine.ts` and is the only place that applies card effects to players.**
- **Never add a `require` or `import` of a server-only module (`socket.io`, `express`, `fs`) in `shared/`.**

---

## 3. Typed Error Codes

All socket handler acknowledgements **must** use the `GameError` union from `shared/types.ts`.

```ts
// ✅ Correct
import type { GameError } from '@monopoly/shared';
cb?.({ ok: false, error: 'NO_CONTROL' satisfies GameError });

// ❌ Wrong — raw string, no compile-time check
cb?.({ ok: false, error: 'no_control' });
```

**When adding a new error code:**
1. Add it to the `GameError` union in `shared/src/types.ts` first.
2. Use it in the handler.
3. Handle it (or at least type-check it) on the client side.

---

## 4. Socket Handlers — Standard Pattern

Every socket handler must follow this pattern exactly:

```ts
socket.on('eventName', ({ code, playerId, key, ...payload }, cb) => {
  // 1. Look up the room
  const room = rooms.get(code);
  if (!room) return cb?.({ ok: false, error: 'NO_ROOM' satisfies GameError });

  // 2. Authenticate the controller
  const me = requireControl(room, playerId, key);
  if (!me) return cb?.({ ok: false, error: 'NO_CONTROL' satisfies GameError });

  // 3. Validate preconditions (game status, turn ownership, etc.)
  // ...

  // 4. Mutate state using core/ functions
  // ...

  // 5. Acknowledge success, then broadcast
  cb?.({ ok: true });
  emit(room);       // ← always last
});
```

**Never call `emit()` before `cb?.()`** — the client ack and the broadcast should be in this order.

---

## 5. New Feature Checklist

Before adding any new game mechanic:

- [ ] Does it add state to `RoomState`? → Update `shared/src/types.ts` AND add a migration line in `migrateRoom()` in `index.ts`.
- [ ] Does it add a new error code? → Add to `GameError` in `shared/src/types.ts`.
- [ ] Does it add server-only logic? → Put it in the appropriate `core/` module.
- [ ] Does it add shared rule logic? → Put it in `shared/src/engine.ts` as a pure function.
- [ ] Does it add a socket event? → Add it to the appropriate `handlers/` file.
- [ ] Does the new core module grow beyond ~150 lines? → Split it.

---

## 6. Long Function Warning

`doRoll()` in `core/roll.ts` is already decomposed into three sub-functions. Follow this same pattern for any function that:
- Has more than 5 return paths, OR
- Handles more than 2 distinct concerns, OR
- Exceeds ~80 lines.

Extract named sub-functions with return types (not just `boolean`). Prefer named union types over `'string1' | 'string2'` inline.

---

## 7. CORS & Environment Variables

The Socket.IO CORS origin is controlled by `ALLOWED_ORIGIN`:

```bash
# Development / LAN (default — allows any origin)
# No env var needed

# Internet / cloud deployment
ALLOWED_ORIGIN=https://yourdomain.com npm start
```

**Never hardcode `cors: { origin: '*' }` in a production deployment guide or Dockerfile.**

---

## 8. Persistence Rules

- `saveRooms()` is called inside `emit()` — **do not call it anywhere else** unless you have a very specific reason (and document it).
- `loadRooms()` is called once at startup only.
- The data file path is controlled by `ROOMS_FILE` env var (`server/data/rooms.json` default).
- `persist.ts` must never throw into game logic — always wrapped in try/catch.

---

## 9. What NOT to do (Anti-Patterns)

| Anti-Pattern | Why It's Banned | Correct Alternative |
|---|---|---|
| Adding game logic to `handlers/*.ts` directly | Makes handlers untestable and fat | Put in `core/` module, call from handler |
| Adding a new utility to `broadcast.ts` | It's the IO boundary, not a utils file | Put utilities in the relevant `core/` module |
| Mutating `RoomState` in `shared/engine.ts` | Breaks unit testability; can't be used on client | Return an effect object; apply in server |
| Returning a raw string error: `{ error: 'my_new_code' }` | Untyped, breaks client error handling | Add to `GameError` union first |
| Calling `getIo()` outside `broadcast.ts` | Makes IO untraceable | Import `emit()` from broadcast |
| Recursive `makeCode()` | Unbounded call stack | Use iterative `do { } while ()` loop |
| A file with multiple distinct concerns | God file — blocks parallel work | One file per domain |

---

## 10. Testing Rules (learned incidents)

- **Hermetic suites.** Every test script rebuilds its own inputs first
  (`test:unit`/`test:sim` rebuild `@monopoly/shared` before running). No
  suite may trust another step's `dist/` output — the stale-dist incident
  (green tests against last week's tables) is why `verify` exists.
- **Data tables get shape tests.** Assert structural invariants
  (`rent.length === 7` for every property, 40 board tiles, unique cells),
  not just spot values — the off-by-one rent tier survived value checks.
- **Money stays finite.** Any new arithmetic on cash/prices/refunds gets a
  finite-integer assertion in `unit.mjs`. Floor + clamp untrusted snapshot
  numbers at the read site.
- **Deterministic sim.** The 21-game sim uses fixed seeds so CI replays
  exactly. New game-logic paths must be reachable by `botTakeTurn` or a
  seeded sim agent — otherwise they are untested in combination.
- **Client pure helpers get vitest cover** (`client/src/**/*.test.ts`).
  Anything verified once via a throwaway script gets committed as a test
  the same day, or the verification didn't happen.
- **No test edits production constants.** Tests assert against the same
  constants the code uses (`MAX_PLAYERS`, `TURN_MS`); magic numbers in
  tests are a second source of truth waiting to drift.
