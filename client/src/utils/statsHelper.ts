import { BOARD, netWorth, type Player, type RoomState } from '@monopoly/shared';

export interface PlayerStats {
  id: string;
  name: string;
  cash: number;
  netWorth: number;
  propertiesCount: number;
  buildingsCount: number;
  mortgagedCount: number;
  rentsCollected: number;
  rentsPaid: number;
  timesJailed: number;
}

export interface SuperlativeAward {
  title: string;
  emoji: string;
  winnerName: string;
  description: string;
}

/**
 * Computes end-of-game wealth, activity breakdowns, and fun superlative awards
 * by parsing game state and action logs. Pure function, testable and robust.
 */
export function computeGameAwards(room: RoomState): {
  stats: PlayerStats[];
  awards: SuperlativeAward[];
} {
  const statsMap: Record<string, PlayerStats> = {};

  for (const p of room.players) {
    let buildingsCount = 0;
    for (const propIdx of p.properties) {
      buildingsCount += room.buildings[propIdx] ?? 0;
    }

    statsMap[p.id] = {
      id: p.id,
      name: p.name,
      cash: p.cash,
      netWorth: netWorth(p, room),
      propertiesCount: p.properties.length,
      buildingsCount,
      mortgagedCount: p.mortgaged.length,
      rentsCollected: 0,
      rentsPaid: 0,
      timesJailed: 0,
    };
  }

  // Parse feed logs for rent and jail superlatives
  // E.g.: "Alice paid $50 rent to Bob" or "went to JAIL"
  for (const l of room.log) {
    const text = l.text;
    if (text.includes('paid $') && text.includes('rent to')) {
      const match = text.match(/^(.*?) paid \$(\d+) rent to (.*?)(?: on .*)?$/);
      if (match) {
        const payerName = match[1].trim();
        const amount = parseInt(match[2], 10);
        const receiverName = match[3].trim();

        const payer = room.players.find((p) => p.name === payerName);
        const receiver = room.players.find((p) => p.name === receiverName);

        if (payer && statsMap[payer.id]) statsMap[payer.id].rentsPaid += amount;
        if (receiver && statsMap[receiver.id]) statsMap[receiver.id].rentsCollected += amount;
      }
    } else if (text.includes('JAIL') || text.includes('arrested') || text.includes('sent to jail')) {
      for (const p of room.players) {
        if (text.startsWith(p.name)) {
          statsMap[p.id].timesJailed += 1;
        }
      }
    }
  }

  const stats = Object.values(statsMap).sort((a, b) => b.netWorth - a.netWorth);

  // Derive Awards
  const awards: SuperlativeAward[] = [];

  // 1. Biggest Landlord (Most properties + buildings)
  const sortedLandlords = [...stats].sort(
    (a, b) => b.propertiesCount * 2 + b.buildingsCount - (a.propertiesCount * 2 + a.buildingsCount)
  );
  if (sortedLandlords[0] && (sortedLandlords[0].propertiesCount > 0 || sortedLandlords[0].buildingsCount > 0)) {
    awards.push({
      title: 'Biggest Landlord',
      emoji: '🏰',
      winnerName: sortedLandlords[0].name,
      description: `Held ${sortedLandlords[0].propertiesCount} properties & ${sortedLandlords[0].buildingsCount} buildings`,
    });
  }

  // 2. Rent Baron (Most rent collected)
  const sortedRentCollected = [...stats].sort((a, b) => b.rentsCollected - a.rentsCollected);
  if (sortedRentCollected[0] && sortedRentCollected[0].rentsCollected > 0) {
    awards.push({
      title: 'Rent Baron',
      emoji: '💰',
      winnerName: sortedRentCollected[0].name,
      description: `Collected $${sortedRentCollected[0].rentsCollected} in tenant rents`,
    });
  }

  // 3. Unluckiest Roller (Most rents paid or highest bankrupt loss)
  const sortedRentPaid = [...stats].sort((a, b) => b.rentsPaid - a.rentsPaid);
  if (sortedRentPaid[0] && sortedRentPaid[0].rentsPaid > 0) {
    awards.push({
      title: 'Unluckiest Roller',
      emoji: '💸',
      winnerName: sortedRentPaid[0].name,
      description: `Paid out $${sortedRentPaid[0].rentsPaid} landing on rivals' streets`,
    });
  }

  // 4. Trouble Magnet (Most visits to Jail)
  const sortedJailed = [...stats].sort((a, b) => b.timesJailed - a.timesJailed);
  if (sortedJailed[0] && sortedJailed[0].timesJailed > 0) {
    awards.push({
      title: 'Trouble Magnet',
      emoji: '🚔',
      winnerName: sortedJailed[0].name,
      description: `Locked behind bars ${sortedJailed[0].timesJailed} times`,
    });
  }

  // 5. Match Champion
  const winner = room.winnerId ? room.players.find((p) => p.id === room.winnerId) : stats[0];
  if (winner) {
    awards.unshift({
      title: 'Match MVP & Winner',
      emoji: '👑',
      winnerName: winner.name,
      description: `Finished with $${statsMap[winner.id]?.netWorth ?? winner.cash} total net worth`,
    });
  }

  return { stats, awards };
}
