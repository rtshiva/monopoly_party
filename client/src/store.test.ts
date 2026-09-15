import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { Player, RoomState } from '@monopoly/shared';

// Provide global localStorage and sessionStorage mocks for Node test environment
const localStore: Record<string, string> = {};
const sessionStore: Record<string, string> = {};

function createStorageMock(store: Record<string, string>) {
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { for (const k in store) delete store[k]; },
    removeItem: (key: string) => { delete store[key]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

(globalThis as unknown as { localStorage: ReturnType<typeof createStorageMock> }).localStorage = createStorageMock(localStore);
(globalThis as unknown as { sessionStorage: ReturnType<typeof createStorageMock> }).sessionStorage = createStorageMock(sessionStore);

// Dynamic import after globals are set
const {
  mePlayer,
  saveControl,
  loadControl,
  clearControl,
  saveSession,
  sessionPidFor,
  recentSessions,
  clearSession,
  clearAllSessions,
  useGame,
} = await import('./store');

describe('Game Store & Session Persistence', () => {
  beforeEach(() => {
    for (const k in localStore) delete localStore[k];
    for (const k in sessionStore) delete sessionStore[k];
    useGame.setState({ room: null, playerId: null, controlKey: null });
  });

  afterAll(() => {
    for (const k in localStore) delete localStore[k];
    for (const k in sessionStore) delete sessionStore[k];
  });

  describe('mePlayer', () => {
    it('returns player when matching playerId exists in room', () => {
      const mockP: Partial<Player> = { id: 'p1', name: 'Alice' };
      const mockRoom = { players: [mockP as Player] } as RoomState;
      expect(mePlayer(mockRoom, 'p1')).toBe(mockP);
    });

    it('returns null when player not found or room is null', () => {
      expect(mePlayer(null, 'p1')).toBeNull();
      const mockRoom = { players: [{ id: 'p2', name: 'Bob' }] } as unknown as RoomState;
      expect(mePlayer(mockRoom, 'p1')).toBeNull();
      expect(mePlayer(mockRoom, null)).toBeNull();
    });
  });

  describe('Control Key Management', () => {
    it('saves, loads, and clears control keys by player id', () => {
      expect(loadControl('p_123')).toBeNull();
      saveControl('p_123', 'secret_key_abc');
      expect(loadControl('p_123')).toBe('secret_key_abc');
      clearControl('p_123');
      expect(loadControl('p_123')).toBeNull();
    });

    it('handles null or empty player id safely', () => {
      expect(loadControl(null)).toBeNull();
      clearControl(null);
    });
  });

  describe('Session Storage & Resolution', () => {
    it('saves session in both localStorage map and sessionStorage for tab', () => {
      saveSession('ABCD', 'player_1');
      expect(sessionPidFor('ABCD')).toBe('player_1');
      expect(sessionPidFor('abcd')).toBe('player_1'); // case-insensitive
    });

    it('prioritizes active tab session over other room session', () => {
      saveSession('ROOM1', 'pid_tab_1');
      // Emulate another room saved into localStorage map
      saveSession('ROOM2', 'pid_tab_2');

      // Requesting ROOM2 matches current tab
      expect(sessionPidFor('ROOM2')).toBe('pid_tab_2');
      // Requesting ROOM1 still resolves from localStorage map even if tab switched
      expect(sessionPidFor('ROOM1')).toBe('pid_tab_1');
    });

    it('returns recent sessions sorted newest first', () => {
      const now = Date.now();
      localStore['monopoly.sessions'] = JSON.stringify({
        R1: { pid: 'p1', updatedAt: now - 3000 },
        R2: { pid: 'p2', updatedAt: now - 2000 },
        R3: { pid: 'p3', updatedAt: now - 1000 },
      });

      const recents = recentSessions();
      expect(recents.length).toBe(3);
      expect(recents[0].code).toBe('R3');
      expect(recents[1].code).toBe('R2');
      expect(recents[2].code).toBe('R1');
    });

    it('clears specific session without affecting others', () => {
      saveSession('CODE1', 'p1');
      saveSession('CODE2', 'p2');

      clearSession('CODE1', 'p1');
      expect(sessionPidFor('CODE1')).toBeNull();
      expect(sessionPidFor('CODE2')).toBe('p2');
    });

    it('clearAllSessions clears all saved sessions', () => {
      saveSession('CODE1', 'p1');
      saveSession('CODE2', 'p2');

      clearAllSessions();
      expect(sessionPidFor('CODE1')).toBeNull();
      expect(sessionPidFor('CODE2')).toBeNull();
      expect(recentSessions().length).toBe(0);
    });

    it('migrates legacy single-slot globals into sessions map', () => {
      localStore['monopoly.code'] = 'LEGACY';
      localStore['monopoly.pid'] = 'legacy_p1';

      expect(sessionPidFor('LEGACY')).toBe('legacy_p1');
    });
  });

  describe('Zustand useGame store', () => {
    it('updates room, playerId, and controlKey reactively', () => {
      const state1 = useGame.getState();
      expect(state1.room).toBeNull();
      expect(state1.playerId).toBeNull();

      useGame.getState().setPlayerId('player_99');
      useGame.getState().setControlKey('key_99');
      const fakeRoom = { code: 'TEST' } as unknown as RoomState;
      useGame.getState().setRoom(fakeRoom);

      const state2 = useGame.getState();
      expect(state2.playerId).toBe('player_99');
      expect(state2.controlKey).toBe('key_99');
      expect(state2.room).toBe(fakeRoom);
    });
  });
});
