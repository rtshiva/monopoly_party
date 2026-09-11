import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { freshSocket } from '../socket';
import { useGame } from '../store';
import type { TokenKind } from '@monopoly/shared';
import { TOKENS } from '@monopoly/shared';

const tokenList = Object.keys(TOKENS) as TokenKind[];

export function Landing() {
  const nav = useNavigate();
  const { setRoom, setPlayerId } = useGame();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState<TokenKind>('car');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function withTimeout(ms: number, onTimeout: () => void) {
    return setTimeout(onTimeout, ms);
  }

  async function host() {
    setBusy(true); setErr('');
    const s = freshSocket();
    let finished = false;
    const finish = (ok: boolean) => { if (!finished) { finished = true; clearTimeout(timer); s.disconnect(); setBusy(false); if (!ok) setErr('Could not create room (is server running on :3001?)'); } };
    const timer = withTimeout(8000, () => finish(false));
    s.emit('createRoom', { playerName: name || 'Host', token }, (res: { ok: boolean; code: string; playerId: string; room: never }) => {
      if (res?.ok) {
        finished = true; clearTimeout(timer);
        localStorage.setItem('monopoly.pid', res.playerId);
        localStorage.setItem('monopoly.code', res.code);
        setPlayerId(res.playerId); setRoom(res.room as never);
        s.disconnect(); setBusy(false);
        nav(`/host/${res.code}?pid=${res.playerId}`);
      } else finish(false);
    });
  }

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim()) { setErr('Enter a room code'); return; }
    setBusy(true); setErr('');
    const s = freshSocket();
    let finished = false;
    const timer = withTimeout(8000, () => { if (!finished) { finished = true; s.disconnect(); setBusy(false); setErr('Server not responding — is it running on :3001?'); } });
    s.emit('joinRoom', { code: code.toUpperCase().trim(), playerName: name || 'Player', token }, (res: { ok: boolean; error?: string; code: string; playerId: string; room: never }) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (res?.ok) {
        localStorage.setItem('monopoly.pid', res.playerId);
        localStorage.setItem('monopoly.code', res.code);
        setPlayerId(res.playerId); setRoom(res.room as never);
        s.disconnect(); setBusy(false);
        nav(`/play/${res.code}?pid=${res.playerId}`);
      } else {
        s.disconnect(); setBusy(false);
        setErr(res?.error === 'NO_ROOM' ? 'Room not found. Check the code.' : res?.error === 'ROOM_FULL' ? 'Room is full (8 max).' : res?.error === 'GAME_OVER' ? 'That game already finished — ask host for a new room.' : 'Join failed — is server running?');
      }
    });
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
