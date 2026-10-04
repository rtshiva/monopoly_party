/**
 * testFixtures.ts — Minimal RoomState/Player factories for component tests.
 * Real BOARD tiles/prices flow through (no mocked economy), so money display
 * pins exercise the same constants the server charges.
 */
import type { Player, RoomState } from '@monopoly/shared';

let seq = 0;

export function mkTestPlayer(patch: Partial<Player> = {}): Player {
  const i = seq++;
  return {
    id: `p${i}`,
    name: `P${i}`,
    token: 'car',
    cash: 1500,
    position: 0,
    properties: [],
    mortgaged: [],
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    doubles: 0,
    bankrupt: false,
    connected: true,
    isHost: i === 0,
    isBot: false,
    hasRolled: false,
    seatPin: '0000',
    controllerLabel: null,
    ...patch,
  };
}

export function mkTestRoom(patch: Partial<RoomState> = {}, players?: Player[]): RoomState {
  return {
    code: 'TEST',
    status: 'playing',
    players: players ?? [mkTestPlayer({}), mkTestPlayer({})],
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
    rev: 0,
    ...patch,
  };
}
