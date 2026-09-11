import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { emitWithAck } from '../socket';
import { saveControl, useGame } from '../store';
import type { TokenKind } from '@monopoly/shared';
import { TOKENS } from '@monopoly/shared';

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

  // Live lobby browser: poll the server for open tables (stateless, cheap).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await emitWithAck<{ ok: boolean; rooms: OpenRoom[] }>('listRooms', {});
        if (alive && res?.ok) setTables(res.rooms);
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

  async function host() {
    setBusy(true); setErr('');
    try {
      const res = await emitWithAck<{ ok: boolean; code: string; playerId: string; controlKey: string; room: never }>(
        'createRoom', { playerName: name || 'Host', token, deviceLabel });
      if (res?.ok) {
        localStorage.setItem('monopoly.pid', res.playerId);
        localStorage.setItem('monopoly.code', res.code);
        rememberIdentity();
        saveControl(res.playerId, res.controlKey);
        setControlKey(res.controlKey);
        setPlayerId(res.playerId); setRoom(res.room as never);
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
    setBusy(true); setErr('');
    try {
      const res = await emitWithAck<{ ok: boolean; error?: string; code: string; playerId: string; controlKey: string; room: never }>(
        'joinRoom', { code: roomCode.toUpperCase().trim(), playerName: name || 'Player', token, deviceLabel });
      if (res?.ok) {
        localStorage.setItem('monopoly.pid', res.playerId);
        localStorage.setItem('monopoly.code', res.code);
        rememberIdentity();
        saveControl(res.playerId, res.controlKey);
        setControlKey(res.controlKey);
        setPlayerId(res.playerId); setRoom(res.room as never);
        nav(`/play/${res.code}?pid=${res.playerId}`);
      } else {
        setErr(res?.error === 'NO_ROOM' ? 'Room not found. Check the code.' : res?.error === 'ROOM_FULL' ? 'Room is full (8 max).' : res?.error === 'GAME_OVER' ? 'That game already finished — ask host for a new room.' : 'Join failed — is server running?');
      }
    } catch {
      setErr('Server not responding — is it running on :3001?');
    }
    setBusy(false);
  }

  const lastGame = (() => {
    const c = loadSaved('monopoly.code');
    const p = loadSaved('monopoly.pid');
    return c && p ? { code: c, pid: p } : null;
  })();
  const waiting = tables.filter((t) => t.status === 'lobby');
  const live = tables.filter((t) => t.status === 'playing');

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

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">📺 Host on this screen</h2>
          <p className="mt-1 text-sm text-white/60">Use a laptop / TV browser. You'll get a QR for phones.</p>
          <label className="mt-4 block text-sm">Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Siva" maxLength={16}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-lg outline-none focus:border-amber-300" />
          </label>
          <div className="mt-3 text-sm">Pick token
            <div className="mt-2 grid grid-cols-8 gap-2">
              {tokenList.map((t) => (
                <button key={t} type="button" onClick={() => setToken(t)}
                  className={`rounded-xl border p-2 text-2xl ${token === t ? 'border-amber-300 bg-amber-300/20' : 'border-white/10 bg-white/5'}`}>{TOKENS[t]}</button>
              ))}
            </div>
          </div>
          <button disabled={busy} onClick={host}
            className="btn-gold mt-5 w-full rounded-2xl px-4 py-4 text-lg disabled:opacity-50">{busy ? 'Creating…' : 'Create room + show board'}</button>
        </div>

        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">📱 Join from phone</h2>
          <p className="mt-1 text-sm text-white/60">Enter the 6-letter code shown on the TV.</p>
          <form onSubmit={join}>
            <label className="mt-4 block text-sm">Room code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="K7Q2XD" maxLength={6}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-mono text-2xl tracking-[0.3em] outline-none focus:border-amber-300" />
            </label>
            <button disabled={busy} type="submit" className="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-4 text-lg font-extrabold text-emerald-950 disabled:opacity-50">
              {busy ? 'Joining…' : 'Join game'}
            </button>
          </form>
          <div className="mt-3 text-center text-xs text-white/40">Same Wi-Fi as the host · no install needed</div>
        </div>
      </div>

      {(lastGame || waiting.length > 0 || live.length > 0) && (
        <div className="glass mt-4 rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">🎪 Open tables <span className="text-sm font-normal text-white/50">— no code needed</span></h2>
          <div className="mt-1 text-xs text-white/50">Join takes a fresh seat. Already playing on another browser? Open the table, then reclaim your seat with its TV PIN.</div>
          {lastGame && (
            <button disabled={busy} onClick={() => nav(`/play/${lastGame.code}?pid=${lastGame.pid}`)}
              className="btn-gold mt-3 w-full rounded-2xl px-4 py-3 disabled:opacity-50">↩️ Rejoin last game ({lastGame.code})</button>
          )}
          {waiting.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-bold text-white/70">⏳ Waiting to start</div>
              <div className="mt-1 space-y-2">
                {waiting.map((t) => (
                  <div key={t.code} className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2">
                    <div className="flex-1"><span className="font-mono font-bold">{t.code}</span> <span className="text-sm text-white/60">· {t.hostName}'s table · {t.players}/{t.max}</span></div>
                    <button onClick={() => nav(`/play/${t.code}`)}
                      className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold" title="Open without joining — claim an existing seat inside">Open ›</button>
                    <button disabled={busy} onClick={() => doJoin(t.code)}
                      className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-extrabold text-emerald-950 disabled:opacity-50">Join</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {live.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-bold text-white/70">🔴 Live now (spectate)</div>
              <div className="mt-1 space-y-2">
                {live.map((t) => (
                  <div key={t.code} className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2">
                    <div className="flex-1"><span className="font-mono font-bold">{t.code}</span> <span className="text-sm text-white/60">· {t.hostName}'s table · {t.players}/{t.max}</span></div>
                    <button onClick={() => nav(`/host/${t.code}`)}
                      className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">Watch</button>
                  </div>
                ))}
              </div>
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
    </div>
  );
}
