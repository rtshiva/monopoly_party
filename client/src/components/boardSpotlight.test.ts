import { describe, expect, it } from "vitest";
import { extractSpotlightEvent } from "./boardSpotlight";
import type { RoomState } from "@monopoly/shared";

function baseRoom(): RoomState {
  return {
    code: "TEST12",
    status: "playing",
    rev: 1,
    turnCount: 5,
    turnIndex: 0,
    turnDeadline: Date.now() + 60000,
    boardStyle: "classic",
    dice: [3, 4],
    lastRoll: "Bob rolled 7",
    rollingId: null,
    pendingBuy: null,
    winnerId: null,
    auction: null,
    auctionQueue: [],
    buildings: {},
    trades: [],
    lastCard: null,
    lastActivity: Date.now(),
    pausedAt: null,
    players: [
      { id: "p1", name: "Alice", token: "hat", position: 0, cash: 1500, properties: [], mortgaged: [], inJail: false, jailTurns: 0, jailCards: 0, doubles: 0, hasRolled: false, isHost: true, isBot: false, connected: true, seatPin: "1234", bankrupt: false, controllerLabel: null },
      { id: "p2", name: "Bob", token: "car", position: 5, cash: 1500, properties: [], mortgaged: [], inJail: false, jailTurns: 0, jailCards: 0, doubles: 0, hasRolled: false, isHost: false, isBot: false, connected: true, seatPin: "5678", bankrupt: false, controllerLabel: null },
    ],
    log: [],
  };
}

describe("extractSpotlightEvent", () => {
  it("returns null for empty log and calm room", () => {
    const r = baseRoom();
    expect(extractSpotlightEvent(r)).toBeNull();
  });

  it("extracts rent payment spotlight", () => {
    const r = baseRoom();
    r.log = [{ id: "l1", at: Date.now(), text: "💸 Bob paid $150 rent to Alice (St. Charles Place)", tone: "money", cat: "money" }];
    const ev = extractSpotlightEvent(r);
    expect(ev).not.toBeNull();
    expect(ev?.kind).toBe("rent");
    expect(ev?.title).toBe("💸 RENT PAID!");
    expect(ev?.detail).toBe("Bob paid $150 to Alice");
    expect(ev?.badge).toBe("St. Charles Place");
  });

  it("extracts pass GO salary", () => {
    const r = baseRoom();
    r.log = [{ id: "l2", at: Date.now(), text: "💰 Bob passed GO +$200", tone: "money", cat: "money" }];
    const ev = extractSpotlightEvent(r);
    expect(ev?.kind).toBe("go");
    expect(ev?.detail).toContain("Bob collected $200");
  });

  it("extracts arrest / jail event", () => {
    const r = baseRoom();
    r.log = [{ id: "l3", at: Date.now(), text: "🚔 Bob → JAIL", tone: "bad", cat: "move" }];
    const ev = extractSpotlightEvent(r);
    expect(ev?.kind).toBe("jail");
    expect(ev?.title).toBe("🚨 ARRESTED!");
  });

  it("extracts victory spotlight when finished", () => {
    const r = baseRoom();
    r.status = "finished";
    r.winnerId = "p1";
    const ev = extractSpotlightEvent(r);
    expect(ev?.kind).toBe("win");
    expect(ev?.detail).toContain("Alice wins the game!");
  });
});
