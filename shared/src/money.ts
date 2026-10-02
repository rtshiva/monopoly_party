/**
 * money.ts — Single-spelling money formulas shared by server, bots, and UI.
 *
 * Every cash movement in the game derives from these three helpers plus the
 * constants in types.ts. A second spelling of any of them once underquoted
 * players by ~8% — add new money math here, never inline. All pure.
 */
import { UNMORTGAGE_RATE } from './types.js';

/** Unmortgage fee for a deed price (60% rounded): server charge, bot brain, client quote. */
export function unmortgageFee(price: number): number {
  return Math.round(price * UNMORTGAGE_RATE);
}

/** Mortgage payout for a deed price (half rounded): server, net worth, bots, client quotes. */
export function mortgagePayout(price: number): number {
  return Math.round(price / 2);
}

/** House sell-back refund for a house cost (half floored): server unwind, set sell-off, client quote. */
export function houseRefund(houseCost: number): number {
  return Math.floor(houseCost / 2);
}
