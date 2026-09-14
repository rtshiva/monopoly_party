import { BOARD, fullSetOf } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';

export interface PendingDeed {
  tile: number;
  name: string;
  ownerName: string | null;
}

export interface SetProgress {
  total: number;
  owned: number;
  isComplete: boolean;
  pending: PendingDeed[];
}

export const RAILROAD_TILES = [5, 15, 25, 35] as const;
export const UTILITY_TILES = [12, 28] as const;

/**
 * Calculates set completion status and lists missing deeds (with their owner if taken). Pure.
 */
export function getSetProgress(tileIdx: number, room: RoomState, me: Player): SetProgress {
  const t = BOARD[tileIdx];
  let set: readonly number[] = [];
  if (t?.kind === 'property') {
    set = fullSetOf(tileIdx);
  } else if (t?.kind === 'railroad') {
    set = RAILROAD_TILES;
  } else if (t?.kind === 'utility') {
    set = UTILITY_TILES;
  }

  const owned = set.filter((x) => me.properties.includes(x)).length;
  const isComplete = set.length > 0 && owned === set.length;

  const pending: PendingDeed[] = set
    .filter((x) => !me.properties.includes(x))
    .map((x) => {
      const owner = room.players.find((p) => !p.bankrupt && p.properties.includes(x));
      return {
        tile: x,
        name: BOARD[x]?.name ?? `Tile ${x}`,
        ownerName: owner ? owner.name : null,
      };
    });

  return {
    total: set.length,
    owned,
    isComplete,
    pending,
  };
}
