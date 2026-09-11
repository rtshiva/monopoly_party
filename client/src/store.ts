import { create } from 'zustand';
import type { RoomState } from '@monopoly/shared';

interface GameStore {
  room: RoomState | null;
  playerId: string | null;
  controlKey: string | null;
  deviceLabel: string;
  setRoom: (r: RoomState | null) => void;
  setPlayerId: (id: string | null) => void;
  setControlKey: (k: string | null) => void;
  setDeviceLabel: (d: string) => void;
}

function loadDeviceLabel(): string {
  try {
    const saved = localStorage.getItem('monopoly.device');
    if (saved) return saved;
  } catch { /* noop */ }
  return `Phone-${Math.floor(1000 + Math.random() * 9000)}`;
}

export const useGame = create<GameStore>((set) => ({
  room: null,
  playerId: null,
  controlKey: null,
  deviceLabel: typeof localStorage !== 'undefined' ? loadDeviceLabel() : 'Phone',
  setRoom: (room) => set({ room }),
  setPlayerId: (playerId) => set({ playerId }),
  setControlKey: (controlKey) => set({ controlKey }),
  setDeviceLabel: (deviceLabel) => {
    try { localStorage.setItem('monopoly.device', deviceLabel); } catch { /* noop */ }
    set({ deviceLabel });
  },
}));

export function mePlayer(room: RoomState | null, playerId: string | null) {
  if (!room || !playerId) return null;
  return room.players.find((p) => p.id === playerId) ?? null;
}

/** Control keys live per-seat in localStorage; rotation happens server-side. */
export function saveControl(pid: string, key: string) {
  try { localStorage.setItem(`monopoly.key.${pid}`, key); } catch { /* noop */ }
}

export function loadControl(pid: string | null): string | null {
  if (!pid) return null;
  try { return localStorage.getItem(`monopoly.key.${pid}`); } catch { return null; }
}

export function clearControl(pid: string | null) {
  if (!pid) return;
  try { localStorage.removeItem(`monopoly.key.${pid}`); } catch { /* noop */ }
}
