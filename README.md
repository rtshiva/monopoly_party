# Monopoly Party — Shared Screen + Phone Controllers

Modern, beautiful Monopoly web app. TV/laptop shows the board, phones are private controllers.

> Full design + use cases: see **[DESIGN.md](./DESIGN.md)**

## Tech
- **Client:** Vite + React + TS + Tailwind v4 + Framer Motion + Socket.IO client + QRCode
- **Server:** Node + Express + Socket.IO (authoritative game state)
- **Shared:** single TS game core (`board`, `engine`, `types`) used by both

## Quick start (party mode)

```bash
# Windows PowerShell: if npm.ps1 is blocked, use npm.cmd
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

- Host screen: `http://localhost:5173/` → **Host Game** → project to TV
- Phones (same Wi-Fi): `http://<YOUR-LAN-IP>:5173/play/<CODE>` or scan QR on host screen
  - Find LAN IP with `ipconfig` → IPv4 Address (e.g. `192.168.1.5`)
  - Dev needs **both** `:5173` (page) and `:3001` (game server) reachable from phones — allow through firewall.
- Prod single-port: `npm run build` then `npm run start` → everything on `:3001`
  (`http://<YOUR-LAN-IP>:3001/`). QR codes adapt automatically.

## Scripts
| cmd | what |
|-----|------|
| `npm run dev` | runs server :3001 + client :5173 together |
| `npm run build` | builds shared → server → client |
| `npm run start` | serves built client + API/WS from server :3001 |
| `npm test` | builds shared+server, boots an isolated server, runs the regression suite |

Server snapshots rooms to `server/data/` on every broadcast (restart-safe) and
expires dead rooms on a timer. The suite uses its own port + snapshot file, so it
is safe to run alongside dev.

## Seats & switching
Each seat has a secret control key (this device only, never broadcast) and a
4-digit PIN shown on the TV board. Lose your phone or share a tablet? Claim any
seat from any device with its TV PIN — takeovers rotate the key + PIN and are
announced on every screen, and every screen always shows which device controls
which seat. After a server restart, reclaim seats with the TV PINs.

## Roles
- `/` — landing (Host or Join)
- `/host/:code` — shared TV board, leaderboard, feed, QR lobby
- `/play/:code` — phone controller (roll, buy, properties, end turn)

## Rules (playable today)
Start $1500, GO +$200, doubles = extra roll (3rd → jail), jail pay $50 or wait, buy/pass (pass → 30s auction), rent auto (full sets + house/hotel tiers), tax, chance/chest-lite, mortgage 50%, player trades (properties + cash, 60s offers), houses/hotels with even build, 60s turns with auto-resolve (15s for offline seats), bankrupt deeds go to bank auction, rematch from the TV screen, sounds + PWA, last-player-wins.
