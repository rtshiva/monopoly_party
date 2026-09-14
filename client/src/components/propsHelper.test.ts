import { describe, expect, it } from 'vitest';
import { getSetProgress } from './propsHelper';
import type { Player, RoomState } from '@monopoly/shared';

function mockPlayer(id: string, name: string, properties: number[]): Player {
  return {
    id,
    name,
    token: 'car',
    cash: 1500,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    hasRolled: false,
    doubles: 0,
    properties,
    mortgaged: [],
    isHost: false,
    isBot: false,
    connected: true,
    seatPin: '1234',
    controllerLabel: null,
  };
}

function mockRoom(players: Player[]): RoomState {
  return {
    code: 'TEST',
    status: 'playing',
    turnIndex: 0,
    dice: [1, 1],
    lastRoll: null,
    lastCard: null,
    pendingBuy: null,
    trades: [],
    auction: null,
    buildings: {},
    turnDeadline: null,
    auctionQueue: [],
    lastActivity: Date.now(),
    pausedAt: null,
    boardStyle: 'classic',
    log: [],
    winnerId: null,
    turnCount: 1,
    rollingId: null,
    rev: 1,
    players,
  };
}

describe('getSetProgress', () => {
  it('reports pending unowned deeds in color set', () => {
    // Tile 39 is Boardwalk (Dark blue). Tile 37 is Park Place.
    const p1 = mockPlayer('p1', 'Alice', [39]);
    const room = mockRoom([p1]);

    const prog = getSetProgress(39, room, p1);
    expect(prog.total).toBe(2);
    expect(prog.owned).toBe(1);
    expect(prog.isComplete).toBe(false);
    expect(prog.pending).toEqual([
      { tile: 37, name: 'Park Place', ownerName: null },
    ]);
  });

  it('reports pending deed owned by opponent', () => {
    const p1 = mockPlayer('p1', 'Alice', [39]);
    const p2 = mockPlayer('p2', 'Bob', [37]);
    const room = mockRoom([p1, p2]);

    const prog = getSetProgress(39, room, p1);
    expect(prog.total).toBe(2);
    expect(prog.owned).toBe(1);
    expect(prog.isComplete).toBe(false);
    expect(prog.pending).toEqual([
      { tile: 37, name: 'Park Place', ownerName: 'Bob' },
    ]);
  });

  it('reports completed monopoly', () => {
    const p1 = mockPlayer('p1', 'Alice', [37, 39]);
    const room = mockRoom([p1]);

    const prog = getSetProgress(39, room, p1);
    expect(prog.total).toBe(2);
    expect(prog.owned).toBe(2);
    expect(prog.isComplete).toBe(true);
    expect(prog.pending).toEqual([]);
  });

  it('calculates railroad sets', () => {
    // Railroads: 5, 15, 25, 35
    const p1 = mockPlayer('p1', 'Alice', [5, 15]);
    const p2 = mockPlayer('p2', 'Bob', [25]);
    const room = mockRoom([p1, p2]);

    const prog = getSetProgress(5, room, p1);
    expect(prog.total).toBe(4);
    expect(prog.owned).toBe(2);
    expect(prog.isComplete).toBe(false);
    expect(prog.pending).toEqual([
      { tile: 25, name: 'B&O RR', ownerName: 'Bob' },
      { tile: 35, name: 'Short Line', ownerName: null },
    ]);
  });
});
