# Monopoly Web App — Design + Use Cases

> **Concept:** Couch-party Monopoly without the physical board.
> One **Shared Screen** (TV / laptop / projector) shows the public board.
> Each player uses their **Phone** (mobile web, no install) as a private controller: roll dice, view cash/properties, buy, trade, mortgage.

---

## 1. Goals & Principles

1. **Zero-install phones:** join via QR code or 6-char room code, runs in mobile browser.
2. **Single source of truth:** authoritative game server, clients are thin views.
3. **TV-first spectacle + phone-first privacy:** public info on big screen, money/cards/actions on phone.
4. **Beautiful & modern:** dark glass-neon board, buttery animations, large touch targets, haptic-like feedback.
5. **LAN-friendly:** works on same Wi-Fi via laptop IP (`http://192.168.1.5:5173`), also deployable to internet.
6. **Resilient party play:** reconnects, host migration, pause/rejoin, no lost game on refresh.

Non-goals (V1): real money, persistent accounts, AI bots, full official tournament rules edge-cases.

---

## 2. Tech Stack (chosen)

| Layer | Choice | Why |
|---|---|---|
| **Phone + Board UI** | **Vite + React 18 + TypeScript + Tailwind CSS v4 + Framer Motion + Zustand** | Vite = instant HMR, tiny bundle for phones. Tailwind = modern glass/dark theme fast. Framer Motion = dice roll, token glide, money fly animations. Zustand = tiny client state. |
| **Realtime server** | **Node 20+ + Express + Socket.IO 4** | Socket.IO handles rooms, reconnects, fallback polling (hotel/cafe Wi-Fi safe). Authoritative: RNG + rules validated server-side, no cheating from DevTools. |
| **Shared game core** | **TypeScript `shared/` package (board.ts, engine.ts, types.ts)** imported by both client & server | One rules implementation, unit-testable, prevents client/server drift. |
| **QR / Room codes** | `qrcode.react` on host screen, `nanoid`-style 6-char codes (`A-Z2-9` no confusables) | Phone camera → instant join. |
| **Build/run** | npm workspaces: `client/`, `server/`, `shared/` | `npm run dev` runs all, `npm start` runs prod build. Deploy anywhere (Render/Fly/Vercel+separate WS). |
| **Future swaps** | Redis adapter, Postgres persistence, Next.js if SEO needed | Not needed for V1 party scale (2-8 players/room, <50 rooms/server). |

**Look & feel direction:** midnight `#0B1020` background, gold `#F5C518` accents, property color-bands, rounded-2xl cards, Inter + Space Grotesk fonts, board = CSS grid 11x11 with center stage for dice/feed, phone UI = bottom-sheet actions, 56px+ touch buttons.

```
                +-----------------+      socket.io       +------------------+
                |  Shared Screen  |<-------------------->|  Game Server     |
                |  /host/:code    |      room:ABCD12     |  Express + SIO   |
                |  Board + feed   |                      |  engine.ts (auth)|
                +-----------------+                      +--------+---------+
                         ^ QR / code                              ^
                         |                                        | websocket
               +---------+---------+                    +---------+----------+
               | Phone 1           |                    | Phone 2..8         |
               | /play/:code       |                    | cash, props, roll  |
               +-------------------+                    +--------------------+
```

---

## 3. Roles

| Role | Device | Sees | Can do |
|---|---|---|---|
| **Host (Screen)** | TV/laptop, `?view=board` or `/host/:code` | Full board, tokens, dice, turn banner, event feed, leaderboard, QR lobby | Create room, start game, pause, kick, show rules. Cannot roll for players. |
| **Player (Phone)** | Mobile web `/play/:code` | Private: cash, properties, cards, trade offers, Roll/Buy/End-turn buttons | Join, set token, roll (on my turn), buy/auction/pass, manage houses/mortgage, offer/accept trades, pay jail fee, declare bankruptcy. |
| **Spectator** | Any | Board read-only | Watch only. |
| **Server** | — | Full state | Dice RNG, movement, rent, cards, turn order, win detection, validation. |

---

## 4. Board Model (V1 simplified-classic, 40 tiles)

Full classic layout kept for familiarity. Abbreviated names for mobile.

`GO → Med Ave → Chest → Baltic → Tax → Reading RR → Oriental → Chance → Vermont → Conn → Jail/Just Visiting → St.Charles → Electric → States → Virginia → Penn RR → St.James → Chest → Tennessee → NY Ave → Free Parking → Kentucky → Chance → Indiana → Illinois → B&O RR → Atlantic → Ventnor → Water → Marvin → Go To Jail → Pacific → NC Ave → Chest → Penn Ave → ShortLine → Chance → Park Place → Tax → Boardwalk`

Data per tile in `shared/board.ts`:
```ts
type Tile =
 | { kind:'go' } | { kind:'property', name, color, price, rent:[0..5], houseCost }
 | { kind:'railroad', name, price } | { kind:'utility', name }
 | { kind:'tax', amount } | { kind:'chance'|'chest' } | { kind:'jail'|'goToJail'|'parking' }
```

V1 economy: start cash **$1500**, GO salary **$200**, doubles = extra roll (3 doubles → jail), jail = miss 1 turn or pay $50, houses: 4→hotel simplified (even-build relaxed in V1), mortgage = 50% value, 10% unmortgage fee, rent doubles if full color set (no houses), railroads: 25/50/100/200, utilities: 4x/10x dice.

---

## 5. Core Game State

```ts
interface Player { id: string; socketId: string; name: string; token: TokenKind;
  cash: number; position: number; properties: number[]; inJail: boolean; jailTurns: number;
  bankrupt: boolean; connected: boolean; isHost: boolean }
interface Room { code: string; status: 'lobby'|'playing'|'finished';
  players: Player[]; turnIndex: number; dice: [number,number]; doubles: number;
  log: LogEntry[]; winner?: string; createdAt: number }
```

Server emits `state` (full) after every mutation + `diceRolled`, `moved`, `transaction` for animations. Client never computes cash.

---

## 6. Socket Protocol

- `createRoom { playerName, token } → { code }`
- `joinRoom { code, playerName, token } → { ok } | { error: ROOM_FULL|NO_ROOM|NAME_TAKEN }`
- `rejoin { playerId, code }` (localStorage `monopoly.pid`) for refresh.
- `startGame { code }` (host only)
- `rollDice { code }` — server validates `isMyTurn`, animates 1s, moves token stepwise, resolves tile, returns actions available: `[BUY, AUCTION, PAY_RENT, DRAW, PAY_TAX, GO_TO_JAIL, NOTHING]`
- `buyProperty { code }`, `passProperty`, `endTurn { code }`, `payJailFee`, `mortgage { tile }`, `tradeOffer { to, give, receive }`, `tradeRespond { accept }`, `declareBankrupt`
- Server broadcasts: `roomState`, `yourTurn` (vibrate via `navigator.vibrate`), `gameOver`.

All mutations validated: turn ownership, sufficient funds, tile ownership, game phase.

---

## 7. Use Cases (detailed)

### UC-01 Create Room (Host)
**Actor:** Host **Pre:** network reachable **Flow:** 1. Open `/` → “Host on this screen” → enter name → Create → server generates `K7Q2XD` → redirect `/host/K7Q2XD` showing QR + `http://<lan-ip>:5173/play/K7Q2XD` + lobby list. **Alt:** copy link to WhatsApp group.

### UC-02 Join from Phone
**Actor:** Player **Flow:** 1. Scan QR / enter code on `/` → enter name + pick token (🚗🎩🐶⛵👒🐱🎈🤖) → Lobby “waiting…” → host sees avatar join with sound. **Errors:** room full (8 max) → suggest spectate; duplicate name → auto-suffix `(2)`.

### UC-03 Start Game
**Actor:** Host **Pre:** 2-8 players **Flow:** Host presses Start → server shuffles order, gives $1500, places all on GO → board animates deal, phones vibrate “Game started”. Turn banner on TV: “Siva's turn — roll on your phone”.

### UC-04 Roll Dice & Move (core loop)
**Actor:** Current player on phone **Flow:** 1. Phone shows glowing **ROLL** button (others see disabled). 2. Tap → dice tumble on TV + phone (Framer Motion). 3. Token glides step-by-step with tick sound. 4. Landing tile card pops on TV + action sheet on player phone. **Rules:** doubles → “Roll again”; 3rd double → Jail.

### UC-05 Buy / Pass / Pay Rent
Landing on unowned property → owner-candidate phone shows **Buy $X / Pass** (15s timer, TV countdown ring). Buy → cash flies animation, color badge on board. Pass → next turn (V1: no auction, to keep pace — auction in V2). Landing on owned → auto-deduct rent, flying `-$` feed, owner `+$`. Insufficient → must mortgage/trade or go bankrupt.

### UC-06 Chance / Community Chest
Draw → card flips center-board (“Advance to GO”, “Pay $50”, “Get out of Jail”). Applied atomically, logged.

### UC-07 Jail
Go To Jail tile / 3 doubles → token teleports. On turn phone shows **Pay $50 & Roll / Just End Turn**. V1: max 2 turns, then auto-pay.

### UC-08 Manage Properties (phone)
Tabs: **Cash | Properties | Trade**. Property rows show color dot, rent, mortgage toggle, houses (if full set). All actions confirmed with swipe/double-tap to avoid mis-taps.

### UC-09 Trade
Offer: select my properties + cash ↔ their properties + cash → they get push card Accept/Decline (30s). TV shows “Siva ↔ Anu negotiating…”. On accept server swaps atomically.

### UC-10 Bankruptcy & Win
If cash < 0 after all actions → **Declare Bankruptcy** → properties to bank (V1) or creditor, token greys out. Last solvent player → confetti + trophy on TV + rematch button.

### UC-11 Disconnect / Reconnect
Socket drop → player marked `offline` (grey). Turn auto-skips after 30s if offline. Refresh → `localStorage` pid auto-rejoins same seat. Host refresh → room persists in server memory (V2: Redis).

### UC-12 Spectate & Share
Anyone with link + `?spectate` sees board read-only. Host “Copy invite” for late joiners (allowed until someone wins if <8 players).

---

## 8. Screens / UX

**Landing `/`:** hero with 3D-ish dice, two big cards: [📺 Host Game] [📱 Join Game + code input], how-it-works strip (1 Create → 2 Scan → 3 Roll on phone).

**Host `/host/:code`:** top bar (code big, players, copy invite), 11x11 board (corners + color bands), center: dice + turn banner + last event, right rail: leaderboard + feed + QR lobby overlay pre-start.

**Phone `/play/:code`:** sticky header (avatar, cash, position), context action area (ROLL / BUY / END TURN large), tabs Properties/Trade/Log, offline banner, haptics.

**Design tokens:** `bg #0B1020, card rgba(255,255,255,.06) blur, accent gold, success emerald, danger rose, radius 16-20px, font Inter/Space Grotesk`.

---

## 9. Build Order (V1 roadmap)

- [x] M0 Scaffolding (this repo) + lobby + QR + realtime state
- [x] M1 Movement + dice + buy/pass + rent + GO + tax + jail-basic + bankruptcy + win
- [x] M2 Chance/Chest deck + doubles + mortgage + houses-lite
- [x] M3 Trades + auctions + houses/hotels + sounds + PWA install
- [x] M4 Turn timers + offline skip + bankruptcy auctions + rematch + snapshots + `npm test`
- [ ] V2 Full even-build trading of houses, Redis, Postgres history, bots

---

## 10. Run Locally (party mode)

```bash
npm install        # from root (uses npm.cmd on Windows if PS blocks ps1)
npm run dev        # client :5173 + server :3001
# Host:  http://localhost:5173/host/<CODE>  (project to TV)
# Phones: http://<YOUR-LAN-IP>:5173/play/<CODE>  e.g. http://192.168.1.5:5173
```

Find LAN IP: `ipconfig` (Windows) → IPv4 Address.

---

*This doc is the contract. M0–M4 are implemented: host/join/roll/buy/rent/win plus trades, auctions, houses/hotels, turn timers, bankruptcy auctions, rematch, snapshots, and sounds/PWA.*
