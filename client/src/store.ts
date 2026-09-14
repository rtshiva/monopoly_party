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

// ---------------------------------------------------------------------------
// Seat sessions — which player-id belongs to which room on this browser.
//
// History: this used to be a single global `monopoly.pid` + `monopoly.code`
// pair, so two tabs in two rooms overwrote each other and a refresh could
// resurrect the *other* tab's room ("each window shows a different code").
// Now sessions are stored per room code, plus a per-tab identity in
// sessionStorage (which is scoped to one tab by design) that always wins
// for the tab it belongs to. Resolution order in sessionPidFor() is:
//   1. this tab's identity (only if it was saved for the requested room),
//   2. the per-room map (covers refreshes and "rejoin recent" buttons),
//   3. legacy globals, only if their saved code matches the requested room.
// ---------------------------------------------------------------------------

export interface SavedSession { pid: string; updatedAt: number }

const SESSIONS_KEY = 'monopoly.sessions';
const TAB_PID_KEY = 'monopoly.tab.pid';
const TAB_CODE_KEY = 'monopoly.tab.code';
const MAX_SESSIONS = 10;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readSessionMap(): Record<string, SavedSession> {
  let map: Record<string, SavedSession> = {};
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, SavedSession>;
      if (parsed && typeof parsed === 'object') map = parsed;
    }
  } catch { /* corrupted JSON: start fresh below */ }
  // One-time migration of the legacy single-slot globals.
  try {
    const legacyCode = (localStorage.getItem('monopoly.code') || '').toUpperCase();
    const legacyPid = localStorage.getItem('monopoly.pid') || '';
    if (legacyCode && legacyPid && !map[legacyCode]) {
      map[legacyCode] = { pid: legacyPid, updatedAt: Date.now() };
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(map));
    }
  } catch { /* noop */ }
  return map;
}

/** Remember that this browser holds `pid` in `code`. Call on join/host/claim/rejoin. */
export function saveSession(code: string, pid: string) {
  const up = (code || '').toUpperCase();
  if (!up || !pid) return;
  try {
    const map = readSessionMap();
    map[up] = { pid, updatedAt: Date.now() };
    const trimmed = Object.entries(map)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_SESSIONS);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(Object.fromEntries(trimmed)));
    // Legacy globals kept in sync for older cached clients; not read anymore.
    localStorage.setItem('monopoly.pid', pid);
    localStorage.setItem('monopoly.code', up);
  } catch { /* noop */ }
  try {
    sessionStorage.setItem(TAB_PID_KEY, pid);
    sessionStorage.setItem(TAB_CODE_KEY, up);
  } catch { /* noop */ }
}

/** Best-known player id for `code` on this browser/tab, or null. */
export function sessionPidFor(code: string): string | null {
  const up = (code || '').toUpperCase();
  if (!up) return null;
  try {
    if (sessionStorage.getItem(TAB_CODE_KEY) === up) {
      return sessionStorage.getItem(TAB_PID_KEY);
    }
  } catch { /* noop */ }
  try {
    return readSessionMap()[up]?.pid ?? null;
  } catch { return null; }
}

/** Recent sessions, newest first — for "rejoin recent games" lists. */
export function recentSessions(limit = 4): Array<{ code: string; pid: string; updatedAt: number }> {
  try {
    return Object.entries(readSessionMap())
      .map(([code, s]) => ({ code, pid: s.pid, updatedAt: s.updatedAt }))
      .filter((s) => Date.now() - s.updatedAt < SESSION_TTL_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  } catch { return []; }
}

/** Forget the saved seat for `code` (release, or proven-expired session). */
export function clearSession(code: string, pid?: string | null) {
  const up = (code || '').toUpperCase();
  if (!up) return;
  try {
    const map = readSessionMap();
    if (map[up] && (!pid || map[up].pid === pid)) delete map[up];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(map));
  } catch { /* noop */ }
  try {
    if (sessionStorage.getItem(TAB_CODE_KEY) === up &&
      (!pid || sessionStorage.getItem(TAB_PID_KEY) === pid)) {
      sessionStorage.removeItem(TAB_PID_KEY);
      sessionStorage.removeItem(TAB_CODE_KEY);
    }
  } catch { /* noop */ }
}

/**
 * Wipe all saved seats/sessions on this browser ("start fresh" button).
 * Per-seat control keys are left alone: without a session pointing at them
 * they are inert, and a tab mid-game keeps working until refresh.
 */
export function clearAllSessions() {
  try {
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem('monopoly.pid');
    localStorage.removeItem('monopoly.code');
  } catch { /* noop */ }
  try {
    sessionStorage.removeItem(TAB_PID_KEY);
    sessionStorage.removeItem(TAB_CODE_KEY);
  } catch { /* noop */ }
}
