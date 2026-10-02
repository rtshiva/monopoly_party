/**
 * deeds.ts — Pure deed mutations: mortgage, unmortgage, build, sell.
 *
 * Handlers validate first (same contract as applyTradeSwap in trade.js):
 * ownership, funds, sets, and locks are checked before these run, so the
 * functions below only move money, deeds, and building levels. No I/O.
 */
import { BOARD, houseRefund, mortgagePayout, unmortgageFee } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';

function deedPrice(tile: number): number {
  const t = BOARD[tile] as { price: number } | undefined;
  return typeof t?.price === 'number' ? t.price : 0;
}

/** Mortgage a validated deed: payout + flag. Returns the payout. */
export function applyMortgage(room: RoomState, me: Player, tile: number): number {
  void room;
  const payout = mortgagePayout(deedPrice(tile));
  me.cash += payout;
  me.mortgaged.push(tile);
  return payout;
}

/** Unmortgage a validated deed: fee + unflag. Returns the fee. */
export function applyUnmortgage(room: RoomState, me: Player, tile: number): number {
  void room;
  const fee = unmortgageFee(deedPrice(tile));
  me.cash -= fee;
  me.mortgaged = me.mortgaged.filter((x) => x !== tile);
  return fee;
}

/** Build one house level on a validated tile. Returns the new level + cost. */
export function applyBuildHouse(room: RoomState, me: Player, tile: number): { level: number; cost: number } {
  const t = BOARD[tile];
  const cost = t && t.kind === 'property' ? t.houseCost : 0;
  const level = (room.buildings[tile] ?? 0) + 1;
  me.cash -= cost;
  room.buildings[tile] = level;
  return { level, cost };
}

/** Sell one house level from a validated tile. Returns the new level + refund. */
export function applySellHouse(room: RoomState, me: Player, tile: number): { level: number; refund: number } {
  const t = BOARD[tile];
  const refund = t && t.kind === 'property' ? houseRefund(t.houseCost) : 0;
  const level = room.buildings[tile] ?? 0;
  if (level <= 1) delete room.buildings[tile];
  else room.buildings[tile] = level - 1;
  me.cash += refund;
  return { level: level - 1, refund };
}
