import { describe, it, expect } from 'vitest';
import { computeGameAwards } from './statsHelper';
import type { RoomState, Player } from '@monopoly/shared';

describe('statsHelper', () => {
  const mockPlayers: Player[] = [
    {
      id: 'p1',
      name: 'Alice',
      token: 'hat',
      cash: 1200,
      position: 0,
      properties: [1, 3], // 2 properties
      mortgaged: [],
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      doubles: 0,
      bankrupt: false,
      connected: true,
      isHost: true,
      isBot: false,
      hasRolled: false,
      seatPin: '1234',
      controllerLabel: null,
    },
    {
      id: 'p2',
      name: 'Bob',
      token: 'car',
      cash: 400,
      position: 10,
      properties: [6], // 1 property
      mortgaged: [],
      inJail: true,
      jailTurns: 1,
      jailCards: 0,
      doubles: 0,
      bankrupt: false,
      connected: true,
      isHost: false,
      isBot: true,
      hasRolled: false,
      seatPin: '5678',
      controllerLabel: null,
    },
  ];

  const mockRoom: RoomState = {
    code: 'TESTROOM',
    rev: 10,
    status: 'finished',
    winnerId: 'p1',
    boardStyle: 'classic',
    turnIndex: 1,
    turnCount: 20,
    turnDeadline: 0,
    rollingId: null,
    dice: [3, 4],
    lastRoll: '3+4',
    lastCard: null,
    auction: null,
    auctionQueue: [],
    lastActivity: Date.now(),
    pausedAt: null,
    pendingBuy: null,
    buildings: { 1: 2, 3: 1 },
    trades: [],
    players: mockPlayers,
    log: [
      { id: '1', text: 'Bob went to JAIL', at: 1000 },
      { id: '2', text: 'Bob paid $80 rent to Alice on Mediterranean Ave', at: 2000 },
      { id: '3', text: 'Alice wins the game!', at: 3000 },
    ],
  };

  it('computes player net worth, buildings count and rent logs', () => {
    const { stats, awards } = computeGameAwards(mockRoom);

    expect(stats.length).toBe(2);
    const alice = stats.find((s) => s.id === 'p1');
    const bob = stats.find((s) => s.id === 'p2');

    expect(alice?.propertiesCount).toBe(2);
    expect(alice?.buildingsCount).toBe(3); // 2 + 1
    expect(alice?.rentsCollected).toBe(80);
    expect(alice?.rentsPaid).toBe(0);

    expect(bob?.rentsPaid).toBe(80);
    expect(bob?.timesJailed).toBe(1);

    expect(awards.some((a) => a.title === 'Match MVP & Winner' && a.winnerName === 'Alice')).toBe(true);
    expect(awards.some((a) => a.title === 'Biggest Landlord' && a.winnerName === 'Alice')).toBe(true);
    expect(awards.some((a) => a.title === 'Rent Baron' && a.winnerName === 'Alice')).toBe(true);
    expect(awards.some((a) => a.title === 'Unluckiest Roller' && a.winnerName === 'Bob')).toBe(true);
    expect(awards.some((a) => a.title === 'Trouble Magnet' && a.winnerName === 'Bob')).toBe(true);
  });
});
