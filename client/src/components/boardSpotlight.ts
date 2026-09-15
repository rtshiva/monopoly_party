import { BOARD, fullSetOf } from "@monopoly/shared";
import type { RoomState } from "@monopoly/shared";

export interface SpotlightEvent {
  id: string;
  kind: "rent" | "go" | "monopoly" | "jail" | "tax" | "auction" | "win" | "card";
  title: string;
  detail: string;
  badge: string;
  themeColor: string;
}

/**
 * Parses the latest room state and log to extract a high-impact spotlight event for the TV center stage.
 * Returns null if the most recent event is ordinary or already seen.
 */
export function extractSpotlightEvent(room: RoomState | null): SpotlightEvent | null {
  if (!room) return null;

  // 1. Victory / Game over spotlight
  if (room.status === "finished" && room.winnerId) {
    const winner = room.players.find((p) => p.id === room.winnerId);
    return {
      id: "win-" + room.winnerId + "-" + room.rev,
      kind: "win",
      title: "🏆 VICTORY!",
      detail: (winner?.name ?? "Player") + " wins the game!",
      badge: "👑 CHAMPION",
      themeColor: "border-amber-400 bg-amber-500/20 text-amber-200 shadow-amber-500/50",
    };
  }

  // 2. Urgent Auction Countdown (when auction is active and in its final 10s)
  if (room.auction) {
    const secs = Math.max(0, Math.round((room.auction.endsAt - Date.now()) / 1000));
    if (secs <= 10) {
      const topBid = [...room.auction.bids].sort((a, b) => b.amount - a.amount)[0];
      const bidderName = topBid ? room.players.find((p) => p.id === topBid.playerId)?.name : null;
      return {
        id: "auction-" + room.auction.id + "-" + secs,
        kind: "auction",
        title: "🔨 AUCTION CLIMAX!",
        detail: topBid ? "Top bid: $" + topBid.amount + " by " + bidderName : "Going once, going twice... No bids!",
        badge: secs + "s LEFT",
        themeColor: "border-orange-500 bg-orange-500/20 text-orange-200 shadow-orange-500/50",
      };
    }
  }

  // 3. Inspect recent log entry
  const latest = room.log[0];
  if (!latest) return null;

  const text = latest.text;

  // Monopoly set completion: "✅ Bob bought Baltic Ave for $60" or "🔨 Bob won Baltic Ave for $60"
  const buyMatch = text.match(/[✅🔨] (.*?) (?:bought|won) (.*?) for \$/);
  if (buyMatch) {
    const [, buyerName, propName] = buyMatch;
    const buyer = room.players.find((p) => p.name === buyerName);
    const tileIdx = BOARD.findIndex((t) => t.name.toLowerCase() === propName.toLowerCase());
    if (buyer && tileIdx >= 0) {
      const set = fullSetOf(tileIdx);
      if (set.length > 0 && set.every((x) => buyer.properties.includes(x))) {
        const colorName = BOARD[tileIdx].kind === 'property' ? BOARD[tileIdx].color : 'group';
        return {
          id: "monopoly-" + latest.id,
          kind: "monopoly",
          title: "🎉 MONOPOLY COMPLETE!",
          detail: `${buyer.name} assembled the complete ${colorName.toUpperCase()} set! 🏠`,
          badge: "SET UNLOCKED",
          themeColor: "border-purple-500 bg-purple-500/25 text-purple-200 shadow-purple-500/50",
        };
      }
    }
  }

  // Rent payment: "💸 Bob paid $150 rent to Alice (St. Charles Place)"
  const rentMatch = text.match(/💸 (.*?) paid \$(\d+) rent to (.*?) \((.*?)\)/);
  if (rentMatch) {
    const [, payer, amount, owner, prop] = rentMatch;
    return {
      id: "log-" + latest.id,
      kind: "rent",
      title: "💸 RENT PAID!",
      detail: payer + " paid $" + amount + " to " + owner,
      badge: prop,
      themeColor: "border-rose-500 bg-rose-500/20 text-rose-200 shadow-rose-500/50",
    };
  }

  // Passed GO: "💰 Bob passed GO +$200"
  const goMatch = text.match(/💰 (.*?) passed GO \+\$(\d+)/);
  if (goMatch) {
    const [, player, amount] = goMatch;
    return {
      id: "log-" + latest.id,
      kind: "go",
      title: "🏁 PASSED GO!",
      detail: player + " collected $" + amount + " salary",
      badge: "+$200 CASH",
      themeColor: "border-emerald-400 bg-emerald-500/20 text-emerald-200 shadow-emerald-500/50",
    };
  }

  // Sent to jail: "🚔 Bob → JAIL"
  const jailMatch = text.match(/🚔 (.*?) → JAIL/);
  if (jailMatch) {
    const [, player] = jailMatch;
    return {
      id: "log-" + latest.id,
      kind: "jail",
      title: "🚨 ARRESTED!",
      detail: player + " was sent straight to Jail!",
      badge: "DO NOT PASS GO",
      themeColor: "border-blue-500 bg-blue-500/20 text-blue-200 shadow-blue-500/50",
    };
  }

  // Tax paid: "🧾 Bob paid $100 tax"
  const taxMatch = text.match(/🧾 (.*?) paid \$(\d+) tax/);
  if (taxMatch) {
    const [, player, amount] = taxMatch;
    return {
      id: "log-" + latest.id,
      kind: "tax",
      title: "🧾 TAX ASSESSMENT",
      detail: player + " paid $" + amount + " to the bank",
      badge: "-$" + amount,
      themeColor: "border-amber-400 bg-amber-500/20 text-amber-200 shadow-amber-500/50",
    };
  }

  return null;
}
