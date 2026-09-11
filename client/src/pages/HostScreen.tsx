import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import type { Socket } from 'socket.io-client';
import { emitWithAck, freshSocket } from '../socket';
import { loadControl, saveControl, useGame } from '../store';
import { MazeBoard } from '../components/MazeBoard';
import { CircuitBoard } from '../components/CircuitBoard';
import { ClaimPanel } from '../components/ClaimPanel';
import { ConnPill } from '../components/ConnPill';
import { BOARD, TOKENS } from '@monopoly/shared';

export function HostScreen() {
  const { code = '' } = useParams();
  const [sp] = useSearchParams();
  const { room, setRoom } = useGame();
  const [err, setErr] = useState('');
  const upCode = code.toUpperCase();
  const [pid, setPid] = useState(() => sp.get('pid') || localStorage.getItem('monopoly.pid') || '');
  const [sockState, setSockState] = useState<Socket | null>(null);

  const joinURL = useMemo(() => {
    // Phones need a reachable host. Preserve protocol + current port so the QR
    // works both in dev (:5173) and prod single-port (:3001). On desktops
    // showing "localhost", replace with your LAN IP (see hint below).
    const { protocol, hostname, port } = window.location;
    const base = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    return `${base}/play/${upCode}`;
  }, [upCode]);

  useEffect(() => {
    const s = freshSocket();
    setSockState(s);
    let alive = true;
    // The dashboard is a pure spectator view: it never takes a seat, so a
    // takeover elsewhere can never "evict" this screen. Host powers below
    // work whenever this browser holds the host key.
    s.emit('watchRoom', { code: upCode }, (res: { ok: boolean; room: RoomState }) => {
      if (!alive) return;
      if (res?.ok) setRoom(res.room);
      else setErr('Room not found. Create one from the home page.');
    });
    s.on('roomState', (r) => { if (alive) setRoom(r); });
    return () => { alive = false; s.disconnect(); setSockState(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upCode]);

  if (err) return <div className="p-10 text-center text-rose-200">{err}</div>;
  if (!room || room.code !== upCode) {
    return <div className="p-10 text-center text-white/60">Loading board {upCode}… (start server with <code>npm run dev</code>)</div>;
  }

  const sorted = [...room.players].sort((a, b) => b.cash - a.cash);
  const hostSeat = room.players.find((p) => p.isHost);
  const amHost = !!hostSeat && hostSeat.id === pid;
  // Shown when this browser doesn't hold the host key (fresh window, or the
  // key moved elsewhere). The board itself always works — only the buttons
  // below need the key.
  const [needLogin, setNeedLogin] = useState(false);
  const roomCode: string = room.code;

  async function hostAction(ev: 'pauseGame' | 'resumeGame' | 'kickPlayer' | 'setBoardStyle', extra: Record<string, unknown> = {}) {
    if (!pid) { setErr('Host seat not held on this screen.'); return; }
    try {
      const res = await emitWithAck<{ ok: boolean; error?: string }>(ev, { code: roomCode, playerId: pid, key: loadControl(pid), ...extra });
      if (!res?.ok) {
        if (res?.error === 'NOT_HOST') {
          setNeedLogin(true);
          setErr('Host controls moved to another device — reclaim them in 🔑 Host login below.');
        } else setErr('Host action failed.');
      } else setNeedLogin(false);
    } catch {
      setErr('Server not responding — is it running?');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-display text-xl font-bold">🎲 MONOPOLY PARTY <span className="ml-2 rounded-lg bg-amber-300 px-2 py-1 font-mono text-black">{room.code}</span></div>
        <button onClick={() => navigator.clipboard?.writeText(joinURL)} className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20">📋 Copy invite link</button>
        <div className="ml-auto text-sm text-white/60">{room.status === 'lobby' ? '🟡 Lobby — waiting for players' : room.status === 'playing' ? '🟢 Playing' : room.status === 'paused' ? '⏸ Paused' : '🏁 Finished'}</div>
      </div>

      {amHost && (room.status === 'playing' || room.status === 'paused') && (
        <div className="glass mt-3 flex items-center gap-3 rounded-2xl p-3">
          <span className="font-bold">🔧 Host</span>
          {room.status === 'playing' ? (
            <button onClick={() => hostAction('pauseGame')} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">⏸ Pause game</button>
          ) : (
            <button onClick={() => hostAction('resumeGame')} className="btn-gold rounded-xl px-4 py-2 text-sm">▶️ Resume game</button>
          )}
          <span className="text-xs text-white/50">Pause freezes turns, auctions and the clock.</span>
        </div>
      )}

      {amHost && (
        <div className="glass mt-3 flex items-center gap-2 rounded-2xl p-3">
          <span className="font-bold">🎨 Board</span>
          {(['maze', 'circuit'] as const).map((s) => (
            <button
              key={s}
              onClick={() => hostAction('setBoardStyle', { style: s })}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${room.boardStyle === s ? 'bg-amber-300 text-black' : 'bg-white/10'}`}
            >
              {s === 'maze' ? '🌀 Maze' : '🏁 Circuit'}
            </button>
          ))}
          <span className="text-xs text-white/50">Switches live on every screen.</span>
        </div>
      )}

      {room.auction && <AuctionPanel room={room} />}
      <ConnPill sock={sockState} />

      {(!amHost || needLogin) && (
        <div className="glass mt-3 rounded-3xl p-5">
          <div className="font-display text-lg font-bold">🔑 Host login</div>
          <div className="mt-1 text-sm text-white/60">
            On another browser? Claim the host seat with its TV PIN to run this screen. Takeovers are announced everywhere.
            {hostSeat?.controllerLabel && <> Currently held by <b>📱{hostSeat.controllerLabel}</b> — the board above keeps working regardless.</>}
          </div>
          <ClaimPanel
            room={room}
            seats={room.players.filter((p) => p.isHost)}
            emit={(ev, extra, onOk) => {
              emitWithAck<{ ok: boolean; error?: string; controlKey?: string }>(ev, { code: upCode, ...extra })
                .then((res) => {
                  if (!res?.ok) setErr(res?.error === 'BAD_PIN' ? 'Wrong seat PIN — check the TV board.' : 'Claim failed.');
                  onOk?.(res);
                })
                .catch(() => setErr('Server not responding — is it running?'));
            }}
            onClaimed={(newPid, newKey) => {
              saveControl(newPid, newKey);
              try { localStorage.setItem('monopoly.pid', newPid); } catch { /* noop */ }
              setPid(newPid);
              setNeedLogin(false);
            }}
          />
        </div>
      )}

      {room.status === 'lobby' && (
        <div className="glass mt-3 flex flex-col items-center gap-4 rounded-3xl p-5 md:flex-row">
          <div className="rounded-2xl bg-white p-3"><QRCodeSVG value={joinURL} size={150} /></div>
          <div className="flex-1 text-center md:text-left">
            <div className="font-display text-lg font-bold">Phones: scan to join 👇</div>
            <div className="mt-1 break-all font-mono text-amber-200">{joinURL}</div>
            <div className="mt-1 text-sm text-white/60">Same Wi-Fi required. If this shows <code>localhost</code>, open the same page via your LAN IP (e.g. http://192.168.1.5:5173). Find it with <code>ipconfig</code>.</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
              {room.players.map((p) => (
                <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">{TOKENS[p.token]} {p.name}</span>
              ))}
            </div>
            <StartButton code={room.code} count={room.players.length} hostId={pid} hostKey={loadControl(pid)} />
          </div>
        </div>
      )}

      {room.status === 'finished' && (
        <div className="glass mt-3 flex flex-col items-center gap-3 rounded-3xl p-5 text-center md:flex-row md:text-left">
          <div className="flex-1">
            <div className="font-display text-lg font-bold">🏆 {room.players.find((p) => p.id === room.winnerId)?.name} wins the game!</div>
            <div className="text-sm text-white/60">Same players, fresh $1500, shuffled order.</div>
          </div>
          <RematchButton code={room.code} count={room.players.length} hostId={pid} hostKey={loadControl(pid)} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {room.boardStyle === 'circuit' ? <CircuitBoard room={room} /> : <MazeBoard room={room} />}
        </motion.div>
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-4">
            <div className="font-display font-bold">🏆 Leaderboard</div>
            <div className="mt-2 space-y-2">
              {sorted.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${p.bankrupt ? 'bg-white/5 opacity-50' : 'bg-white/10'}`}>
                  <span className="w-6 font-bold">{i + 1}</span>
                  <span className="text-xl">{TOKENS[p.token]}</span>
                  <span className="flex-1 truncate font-semibold">{p.name} {p.bankrupt ? '(💀)' : ''} {!p.connected ? '(📴)' : p.controllerLabel ? `📱${p.controllerLabel}` : ''}</span>
                  {!p.bankrupt && <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-200" title="Seat takeover PIN">PIN {p.seatPin}</span>}
                  <span className={`font-mono font-bold ${p.cash < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>${p.cash}</span>
                  {amHost && hostSeat && p.id !== hostSeat.id && !p.bankrupt && (
                    <button title={`Remove ${p.name} (deeds go to auction)`} onClick={() => {
                      if (window.confirm(`Remove ${p.name} from the game? Their deeds go to bank auction.`)) hostAction('kickPlayer', { targetId: p.id });
                    }} className="rounded-lg bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-200">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {(room.status === 'playing' || room.status === 'paused') && (
            <div className="glass rounded-2xl p-4 text-center">
              <div className="font-display text-sm font-bold">📱 Join / reclaim a seat</div>
              <div className="mx-auto mt-2 w-fit rounded-xl bg-white p-2"><QRCodeSVG value={joinURL} size={90} /></div>
              <div className="mt-1 break-all font-mono text-xs text-amber-200">{joinURL}</div>
              <div className="mt-1 text-xs text-white/50">New phone — even the host's? Scan to open the table, then claim your seat with its PIN.</div>
            </div>
          )}
          <div className="glass rounded-2xl p-4">
            <div className="font-display font-bold">📜 Live feed</div>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">
              {room.log.map((l) => (
                <div key={l.id} className="rounded-lg bg-black/20 px-2 py-1 text-white/80">{l.text}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type RoomState = import('@monopoly/shared').RoomState;

function AuctionPanel({ room }: { room: RoomState }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const a = room.auction!;
  const secs = Math.max(0, Math.round((a.endsAt - Date.now()) / 1000));
  const top = [...a.bids].sort((x, y) => y.amount - x.amount)[0];
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? '?';
  return (
    <div className="glass mt-3 rounded-3xl border-amber-300/50 p-4 text-center">
      <div className="font-display text-lg font-bold">🔨 Auction: {BOARD[a.tile]?.name} <span className="ml-2 rounded-lg bg-amber-300 px-2 py-0.5 font-mono text-sm text-black">{secs}s</span></div>
      <div className="mt-1 text-sm text-white/70">
        {top ? <>Top bid <b className="text-emerald-300">${top.amount}</b> by <b>{nameOf(top.playerId)}</b> ({a.bids.length} bid{a.bids.length === 1 ? '' : 's'})</> : 'No bids yet — open your phone to bid!'}
      </div>
    </div>
  );
}

function RematchButton({ code, count, hostId, hostKey }: { code: string; count: number; hostId: string; hostKey: string | null }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setMsg('');
          if (!hostId || !hostKey) { setMsg('Host seat not held on this screen — reclaim it from a phone with the TV PIN.'); setBusy(false); return; }
          try {
            const res = await emitWithAck<{ ok: boolean; error?: string }>('startGame', { code, playerId: hostId, key: hostKey });
            if (!res?.ok) setMsg(res?.error === 'NOT_HOST' ? 'This screen no longer holds the host seat.' : 'Could not restart (need 2+ players)');
          } catch {
            setMsg('Server not responding — is it running?');
          }
          setBusy(false);
        }}
        className="btn-gold rounded-2xl px-6 py-3 text-lg disabled:opacity-40"
      >
        {busy ? 'Restarting…' : `🔄 Rematch (${count} players)`}
      </button>
      {msg && <div className="mt-1 text-sm text-rose-200">{msg}</div>}
    </div>
  );
}

function StartButton({ code, count, hostId, hostKey }: { code: string; count: number; hostId: string; hostKey: string | null }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3">
      <button
        disabled={count < 2 || busy}
        onClick={async () => {
          setBusy(true); setMsg('');
          if (!hostId || !hostKey) { setMsg('Host seat not held on this screen — reclaim it from a phone with the TV PIN.'); setBusy(false); return; }
          try {
            const res = await emitWithAck<{ ok: boolean; error?: string }>('startGame', { code, playerId: hostId, key: hostKey });
            if (!res?.ok) setMsg(res?.error === 'NEED_2' ? 'Need at least 2 players to start' : res?.error === 'NOT_HOST' ? 'This screen no longer holds the host seat.' : 'Could not start game');
          } catch {
            setMsg('Server not responding — is it running?');
          }
          setBusy(false);
        }}
        className="btn-gold rounded-2xl px-6 py-3 text-lg disabled:opacity-40"
      >
        {count < 2 ? `Waiting for players (${count}/8)…` : busy ? 'Starting…' : `Start game with ${count} players 🚀`}
      </button>
      {msg && <div className="mt-1 text-sm text-rose-200">{msg}</div>}
    </div>
  );
}
