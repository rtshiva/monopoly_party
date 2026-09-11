import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BOARD } from '@monopoly/shared';
import type { BoardStyle, Player, RoomState } from '@monopoly/shared';
import { ThemedBoard } from '../components/ThemedBoard';

const STYLES: BoardStyle[] = ['grandprix', 'city', 'coastal', 'mountain', 'dinosaur', 'space'];
const TOKEN_ORDER: Player['token'][] = ['car', 'dog', 'hat', 'ship'];

/**
 * Alignment test board: every tile owned, all house levels 1-5, mortgaged
 * deeds, stacked tokens, a pending buy, a live auction with bids, open
 * trades (tiles + cash + cards), a drawn card and jail states — everything
 * visible at once. Add ?calibrate=1 for red index outlines.
 */
function mockRoom(style: BoardStyle): RoomState {
  const buyable = BOARD.map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility')
    .map(({ i }) => i);
  const pending = buyable[buyable.length - 1];
  const auctionTile = buyable[buyable.length - 2];
  const owned = buyable.slice(0, -2);
  const names = ['Anu', 'Siva', 'Zed', 'Mia'];
  const players: Player[] = [0, 1, 2, 3].map((n) => ({
    id: `test-p${n}`,
    name: names[n],
    token: TOKEN_ORDER[n],
    cash: 1500 - n * 137,
    position: [0, 10, 10, 39][n],
    properties: owned.filter((_, k) => k % 4 === n),
    mortgaged: [],
    inJail: n === 2,
    jailTurns: n === 2 ? 1 : 0,
    jailCards: n,
    doubles: 0,
    bankrupt: false,
    connected: n !== 3,
    isHost: n === 0,
    hasRolled: n === 1,
    seatPin: ['1111', '2222', '3333', '4444'][n],
    controllerLabel: ['TV', 'Phone-A', 'Phone-B', null][n],
  }));
  const buildings: Record<number, number> = {};
  owned.forEach((tile, k) => {
    if (BOARD[tile].kind === 'property' && k % 3 !== 2) buildings[tile] = (k % 5) + 1;
  });
  owned
    .filter((t) => !(t in buildings))
    .slice(0, 2)
    .forEach((t) => players.find((p) => p.properties.includes(t))!.mortgaged.push(t));
  const now = Date.now();
  const p0 = players[0], p1 = players[1], p2 = players[2], p3 = players[3];
  return {
    code: 'TEST',
    status: 'playing',
    players,
    turnIndex: 1,
    dice: [3, 4],
    lastRoll: 'Siva rolled 3+4=7',
    lastCard: { kind: 'chance', text: 'Chance: Bank pays you $100', at: now },
    pendingBuy: pending,
    trades: [
      {
        id: 'test-t1', fromId: p0.id, toId: p1.id,
        giveTiles: p0.properties.slice(0, 1), giveCash: 50, giveCards: 0,
        wantTiles: p1.properties.slice(0, 1), wantCash: 0, wantCards: 0,
        createdAt: now, expiresAt: now + 60000,
      },
      {
        id: 'test-t2', fromId: p2.id, toId: p3.id,
        giveTiles: [], giveCash: 0, giveCards: 1,
        wantTiles: [], wantCash: 25, wantCards: 0,
        createdAt: now, expiresAt: now + 60000,
      },
    ],
    auction: {
      id: 'test-a1', tile: auctionTile, startedBy: p0.id,
      bids: [
        { playerId: p0.id, amount: 120, at: now - 9000 },
        { playerId: p1.id, amount: 200, at: now - 3000 },
      ],
      endsAt: now + 25000,
    },
    buildings,
    turnDeadline: now + 45000,
    auctionQueue: [],
    lastActivity: now,
    pausedAt: null,
    boardStyle: style,
    log: [
      { id: 'l1', text: '🎲 Siva → Tennessee', at: now },
      { id: 'l2', text: '✅ Siva bought Tennessee for $180', at: now },
    ],
    winnerId: null,
    turnCount: 12,
  };
}

export function BoardTest() {
  const { style = 'grandprix' } = useParams();
  const valid = (STYLES as string[]).includes(style) ? (style as BoardStyle) : 'grandprix';
  const room = useMemo(() => mockRoom(valid), [valid]);
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 lg:px-6">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Link to="/" className="underline">← home</Link>
        <span className="text-white/60">Board test: every marker on. Add <code>?calibrate=1</code> for red outlines.</span>
        <span className="ml-auto flex gap-1">
          {STYLES.map((s) => (
            <Link key={s} to={`/board-test/${s}`} className={`rounded-lg px-2 py-1 text-xs font-bold ${s === valid ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>{s}</Link>
          ))}
        </span>
      </div>
      <ThemedBoard room={room} />
    </div>
  );
}
