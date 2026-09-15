import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { emitWithAck } from '../socket';
import { clearAllSessions, clearSession, recentSessions, saveControl, saveSession, useGame } from '../store';
import { ClaimPanel, type ClaimEmit } from '../components/ClaimPanel';
import { ThemeSelect } from '../components/ThemeSelect';
import type { BoardStyle, RoomState, TokenKind } from '@monopoly/shared';
import { DEFAULT_BOARD_STYLE, TOKENS } from '@monopoly/shared';

const tokenList = Object.keys(TOKENS) as TokenKind[];

interface OpenRoom { code: string; status: string; players: number; max: number; hostName: string }

function loadSaved(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

export function Landing() {
  const nav = useNavigate();
  const { setRoom, setPlayerId, setControlKey, deviceLabel } = useGame();
  const [name, setName] = useState(() => loadSaved('monopoly.name'));
  const [code, setCode] = useState('');
  const [token, setToken] = useState<TokenKind>(() => {
    const t = loadSaved('monopoly.token');
    return (tokenList as string[]).includes(t) ? (t as TokenKind) : 'car';
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tables, setTables] = useState<OpenRoom[]>([]);
  const [boardTheme, setBoardThemeState] = useState<BoardStyle>(
    () => loadSaved('monopoly.theme') || DEFAULT_BOARD_STYLE,
  );
  // Sticky default: remember the host's last pick on this browser.
  function setBoardTheme(s: string) {
    setBoardThemeState(s);
    try { localStorage.setItem('monopoly.theme', s); } catch { /* noop */ }
  }
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roomCache, setRoomCache] = useState<Record<string, RoomState>>({});
  // Bumps to refresh the history list after clearing it.
  const [, setHistTick] = useState(0);
  // True once the server has answered at least one lobby poll. Until then we
  // can't tell live rooms from ended ones, so recent seats stay unfiltered.
  const [lobbyLive, setLobbyLive] = useState(false);

  // Live lobby browser: poll the server for open tables (stateless, cheap).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await emitWithAck<{ ok: boolean; rooms: OpenRoom[] }>('listRooms', {});
        if (alive && res?.ok) { setTables(res.rooms); setLobbyLive(true); }
      } catch { /* offline: keep the last list */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  function rememberIdentity() {
    try {
      localStorage.setItem('monopoly.name', name);
      localStorage.setItem('monopoly.token', token);
    } catch { /* noop */ }
  }

  // Shared seat-adoption after a successful host/join ack: persist identity,
  // take control, and load the room. Navigation differs per caller.
  function adoptSeat(code: string, pid: string, key: string, room: RoomState | null) {
    saveSession(code, pid);
    rememberIdentity();
    saveControl(pid, key);
    setControlKey(key);
    setPlayerId(pid);
    setRoom(room);
  }

  // Expand a table row into an inline seat-login panel (no navigation needed).
  // Always refetches on expand: seat PINs rotate on every claim, so a cached
  // panel would show dead PINs and a stale roster.
  async function toggleSeats(code: string) {
    if (expanded === code) { setExpanded(null); return; }
    setExpanded(code);
    try {
      const res = await emitWithAck<{ ok: boolean; room: RoomState }>('watchRoom', { code });
      if (res?.ok) setRoomCache((m) => ({ ...m, [code]: res.room }));
    } catch { /* offline: panel shows a loading note */ }
  }

  function claimEmit(code: string): ClaimEmit {
    return (ev, extra, onOk) => {
      emitWithAck<{ ok: boolean; error?: string; controlKey?: string }>(ev, { code, ...extra })
        .then((res) => {
          if (!res?.ok) setErr(res?.error === 'BAD_PIN' ? `Wrong PIN for ${code} — check the TV board.` : 'Login failed.');
          onOk?.(res);
        })
        .catch(() => setErr('Server not responding — is it running?'));
    };
  }

  function afterClaim(code: string, newPid: string, newKey: string) {
    saveControl(newPid, newKey);
    saveSession(code, newPid);
    setControlKey(newKey);
    setPlayerId(newPid);
    setRoom(roomCache[code] ?? null);
    nav(`/play/${code}?pid=${newPid}`);
  }

  async function host() {
    setBusy(true); setErr('');
    try {
      const res = await emitWithAck<{ ok: boolean; code: string; playerId: string; controlKey: string; room: never }>(
        'createRoom', { playerName: name || 'Host', token, deviceLabel, style: boardTheme });
      if (res?.ok) {
        adoptSeat(res.code, res.playerId, res.controlKey, res.room as never);
        nav(`/host/${res.code}?pid=${res.playerId}`);
      } else {
        setErr('Could not create room (is server running on :3001?)');
      }
    } catch {
      setErr('Could not create room (is server running on :3001?)');
    }
    setBusy(false);
  }

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    await doJoin(code.trim());
  }

  async function doJoin(roomCode: string) {
    if (!roomCode) { setErr('Enter a room code'); return; }
    if (!name.trim()) { setErr('Enter your name above first — no anonymous Players!'); return; }
    setBusy(true); setErr('');
    try {
      const res = await emitWithAck<{ ok: boolean; error?: string; code: string; playerId: string; controlKey: string; room: never }>(
        'joinRoom', { code: roomCode.toUpperCase().trim(), playerName: name.trim(), token, deviceLabel });
      if (res?.ok) {
        adoptSeat(res.code, res.playerId, res.controlKey, res.room as never);
        nav(`/play/${res.code}?pid=${res.playerId}`);
      } else {
        setErr(res?.error === 'NO_ROOM' ? 'Room not found. Check the code.' : res?.error === 'ROOM_FULL' ? 'Room is full (8 max).' : res?.error === 'GAME_OVER' ? 'That game already finished — ask host for a new room.' : 'Join failed — is server running?');
      }
    } catch {
      setErr('Server not responding — is it running on :3001?');
    }
    setBusy(false);
  }

  // Seats this browser held recently, newest first — per room, so two tabs in
  // two rooms never steal each other's rejoin target. Refreshes on every
  // lobby poll render.
  // Single-room households: the server list is newest-activity-first, so the
  // newest table is waiting[0]. Recent seats for rooms that are gone from the
  // server (ended / server restarted) are hidden once the lobby is live —
  // otherwise dead gold buttons outrank the actual latest table.
  const recents = recentSessions();
  const waiting = tables.filter((t) => t.status === 'lobby');
  const live = tables.filter((t) => t.status === 'playing');
  const liveCodes = new Set(tables.map((t) => t.code));
  const freshRecents = lobbyLive ? recents.filter((s) => liveCodes.has(s.code)) : recents;

  // Validated rejoin: confirm the room still exists before navigating, so a
  // stale seat button can never strand anyone on a dead table. Expired seats
  // are forgotten and the user is pointed at the latest table instead.
  async function rejoinRecent(code: string, pid: string) {
    setBusy(true); setErr('');
    try {
      const res = await emitWithAck<{ ok: boolean; room: RoomState }>('watchRoom', { code });
      if (res?.ok) {
        saveSession(code, pid);
        setRoom(res.room);
        setPlayerId(pid);
        nav(`/play/${code}?pid=${pid}`);
      } else {
        clearSession(code, pid);
        setErr(`${code} has ended — join the latest table below.`);
      }
    } catch {
      setErr('Server not responding — is it running?');
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-10">
      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
        <div className="text-6xl">🎲</div>
        <h1 className="font-display mt-2 text-4xl font-bold lg:text-6xl">MONOPOLY <span className="text-amber-300">PARTY</span></h1>
        <p className="mx-auto mt-3 max-w-xl text-white/70">
          Project the board on your <b>TV</b>. Everyone joins from their <b>phone</b> — roll dice, buy streets, mortgage and trade from your pocket.
        </p>
      </motion.div>

      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/60">
        <span className="rounded-full bg-white/10 px-3 py-1">1 · Host creates room</span>
        <span>→</span>
        <span className="rounded-full bg-white/10 px-3 py-1">2 · Phones scan QR</span>
        <span>→</span>
        <span className="rounded-full bg-white/10 px-3 py-1">3 · Roll on phone</span>
      </div>

      <div className="glass mt-8 rounded-3xl p-6">
        <h2 className="font-display text-xl font-bold">🧑 Your player identity <span className="text-sm font-normal text-white/50">— used whether you host or join</span></h2>
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <label className="block text-sm">Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Siva" maxLength={16}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-lg outline-none focus:border-amber-300" />
          </label>
          <div className="text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Pick token & avatar</span>
              <span className="text-xs text-white/50">{TOKENS[token]} selected</span>
            </div>
            <div className="mt-1.5 grid grid-cols-8 gap-2">
              {tokenList.map((t) => {
                const isSelected = token === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setToken(t);
                      try { localStorage.setItem('monopoly.token', t); } catch { /* noop */ }
                    }}
                    title={`Play as ${t}`}
                    className={`rounded-2xl border p-2 text-2xl transition-all transform active:scale-95 ${
                      isSelected
                        ? 'border-amber-300 bg-amber-300/25 shadow-[0_0_14px_rgba(252,211,77,0.35)] scale-105'
                        : 'border-white/10 bg-white/5 hover:bg-white/15 hover:border-white/25 hover:scale-105'
                    }`}
                  >
                    {TOKENS[t]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {waiting.length >= 1 && (
        <div className="glass mt-4 rounded-3xl border-amber-300/40 p-6 text-center">
          <div className="text-sm text-white/60">
            🎪 Latest table waiting — no code needed{' '}
            {waiting.length > 1 && (
              <span className="ml-1 rounded-full bg-amber-300/20 px-2 py-0.5 text-xs font-bold text-amber-200">newest of {waiting.length}</span>
            )}
          </div>
          <div className="font-display mt-1 text-2xl font-bold">{waiting[0].hostName}'s table <span className="font-mono text-lg text-amber-300">{waiting[0].code}</span></div>
          <div className="mt-1 text-sm text-white/60">{waiting[0].players}/{waiting[0].max} seated</div>
          {!name.trim() ? (
            <div className="mx-auto mt-3 flex max-w-md gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name to join" maxLength={16}
                className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-lg outline-none focus:border-amber-300" />
              <button disabled={busy} onClick={() => doJoin(waiting[0].code)}
                className="rounded-2xl bg-emerald-300 px-6 py-3 text-lg font-extrabold text-emerald-950 disabled:opacity-50">Join</button>
            </div>
          ) : (
            <button disabled={busy} onClick={() => doJoin(waiting[0].code)}
              className="mx-auto mt-3 block w-full max-w-md rounded-2xl bg-emerald-300 px-4 py-4 text-xl font-extrabold text-emerald-950 disabled:opacity-50">
              {busy ? 'Joining…' : `Join as ${name.trim()} ${TOKENS[token]}`}
            </button>
          )}
          <div className="mt-2 text-xs text-white/50">Someone else? Expand Login › on the table below.</div>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">📺 Host on this screen</h2>
          <p className="mt-1 text-sm text-white/60">Use a laptop / TV browser. You'll get a QR for phones.</p>
          <ThemeSelect value={boardTheme} onPick={setBoardTheme} />
          <button disabled={busy} onClick={host}
            className="btn-gold mt-5 w-full rounded-2xl px-4 py-4 text-lg disabled:opacity-50">{busy ? 'Creating…' : 'Create room + show board'}</button>
        </div>

        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">📱 Join from phone</h2>
          <p className="mt-1 text-sm text-white/60">Enter the 6-letter code shown on the TV. {name.trim() ? <>You'll join as <b>{name.trim()}</b> {TOKENS[token]}.</> : <>Set your name above first.</>}</p>
          <form onSubmit={join}>
            <label className="mt-4 block text-sm">Room code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="K7Q2XD" maxLength={6}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-mono text-2xl tracking-[0.3em] outline-none focus:border-amber-300" />
            </label>
            {waiting.length > 0 && code !== waiting[0].code && (
              <button type="button" onClick={() => setCode(waiting[0].code)}
                className="mt-2 w-full rounded-xl bg-amber-300/15 px-3 py-2 text-sm font-bold text-amber-200">
                ✨ Latest table: <span className="font-mono">{waiting[0].code}</span> ({waiting[0].hostName}'s) — tap to fill
              </button>
            )}
            <button disabled={busy} type="submit" className="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-4 text-lg font-extrabold text-emerald-950 disabled:opacity-50">
              {busy ? 'Joining…' : 'Join game'}
            </button>
          </form>
          <div className="mt-3 text-center text-xs text-white/40">Same Wi-Fi as the host · no install needed</div>
        </div>
      </div>

      {(freshRecents.length > 0 || waiting.length > 0 || live.length > 0) && (
        <div className="glass mt-4 rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">🎪 Open tables <span className="text-sm font-normal text-white/50">— no code needed</span></h2>
          <div className="mt-1 text-xs text-white/50">Join takes a fresh seat{name.trim() ? <> as <b>{name.trim()}</b> {TOKENS[token]}</> : ' (set your name above first)'} · <b>Login ›</b> signs in as an existing seat with its TV PIN — same device or another browser.</div>
          {waiting.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-bold text-white/70">⏳ Waiting to start <span className="font-normal text-white/40">— newest first</span></div>
              <div className="mt-1 space-y-2">
                {waiting.map((t) => (
                  <TableRow
                    key={t.code}
                    t={t}
                    expanded={expanded === t.code}
                    onToggle={() => toggleSeats(t.code)}
                    action={(
                      <button disabled={busy} onClick={() => doJoin(t.code)}
                        className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-extrabold text-emerald-950 disabled:opacity-50">Join</button>
                    )}
                  >
                    {roomCache[t.code] ? (
                      <ClaimPanel room={roomCache[t.code]} emit={claimEmit(t.code)} onClaimed={(pid, key) => afterClaim(t.code, pid, key)} />
                    ) : (
                      <div className="py-2 text-center text-sm text-white/50">Loading seats…</div>
                    )}
                  </TableRow>
                ))}
              </div>
            </div>
          )}
          {live.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-bold text-white/70">🔴 Live now (spectate)</div>
              <div className="mt-1 space-y-2">
                {live.map((t) => (
                  <TableRow
                    key={t.code}
                    t={t}
                    expanded={expanded === t.code}
                    onToggle={() => toggleSeats(t.code)}
                    action={(
                      <button onClick={() => nav(`/host/${t.code}`)}
                        className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">Watch</button>
                    )}
                  >
                    {roomCache[t.code] ? (
                      <ClaimPanel room={roomCache[t.code]} emit={claimEmit(t.code)} onClaimed={(pid, key) => afterClaim(t.code, pid, key)} />
                    ) : (
                      <div className="py-2 text-center text-sm text-white/50">Loading seats…</div>
                    )}
                  </TableRow>
                ))}
              </div>
            </div>
          )}
          {freshRecents.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white/40">
                <span className="flex-1">↩️ Your older seats <span className="font-normal">— history on this browser, newest first</span></span>
                <button type="button"
                  onClick={() => { if (window.confirm('Forget all saved seats on this browser? You can still rejoin tables with their code.')) { clearAllSessions(); setHistTick((n) => n + 1); } }}
                  className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white/70 hover:bg-white/15">
                  🧹 Clear history</button>
              </div>
              {freshRecents.map((s) => (
                <button key={`${s.code}:${s.pid}`} disabled={busy}
                  onClick={() => rejoinRecent(s.code, s.pid)}
                  className="w-full rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white/80 hover:bg-white/15 disabled:opacity-50">
                  ↩️ Rejoin {s.code}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <div className="mx-auto mt-4 max-w-md rounded-2xl border border-rose-300/40 bg-rose-500/15 px-4 py-3 text-center text-rose-200">{err}</div>}

      <div className="mt-8 grid gap-3 text-sm md:grid-cols-3">
        {[
          ['🖥️ Shared screen', 'Board, dice, leaderboard, event feed. No secret info leaks.'],
          ['📲 Phone controller', 'Big ROLL / BUY buttons, private cash + properties, haptics.'],
          ['⚡ Live & fair', 'Server rolls dice + enforces rules. Reconnect keeps your seat.'],
        ].map(([h, b]) => (
          <div key={h} className="glass rounded-2xl p-4"><div className="font-bold">{h}</div><div className="mt-1 text-white/60">{b}</div></div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 text-xs text-white/50">
        <Link to="/board-test/classic" className="flex items-center gap-1.5 font-bold hover:text-amber-200 transition-colors">
          <span>🎨 Custom Theme Studio</span>
        </Link>
        <span>·</span>
        <span>LAN Party Monopoly</span>
      </div>
    </div>
  );
}

/** One open-table row: Join/Watch for fresh entry, expandable inline seat login. */
function TableRow({ t, action, expanded, onToggle, children }: {
  t: OpenRoom; action: ReactNode; expanded: boolean; onToggle: () => void; children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex-1"><span className="font-mono text-base font-bold">{t.code}</span> <span className="text-sm text-white/60">· {t.hostName}'s table · {t.players}/{t.max}</span></div>
        <button onClick={onToggle} title="Log in as an existing seat with its TV PIN"
          className={`rounded-xl px-4 py-2 text-sm font-bold ${expanded ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
          {expanded ? 'Hide ^' : 'Login ›'}</button>
        {action}
      </div>
      {expanded && <div className="mt-2 border-t border-white/10 pt-1">{children}</div>}
    </div>
  );
}
