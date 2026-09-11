import { create } from 'zustand';
import type { RoomState } from '@monopoly/shared';

interface GameStore {
  room: RoomState | null;
  playerId: string | null;
  setRoom: (r: RoomState | null) => void;
  setPlayerId: (id: string | null) => void;
}

export const useGame = create<GameStore>((set) => ({
  room: null,
  playerId: null,
  setRoom: (room) => set({ room }),
  setPlayerId: (playerId) => set({ playerId }),
}));

export function mePlayer(room: RoomState | null, playerId: string | null) {
  if (!room || !playerId) return null;
  return room.players.find((p) => p.id === playerId) ?? null;
}
