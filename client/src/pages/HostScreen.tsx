import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Socket } from 'socket.io-client';
import { emitWithAck, freshSocket } from '../socket';
import { loadControl, saveControl, useGame, saveSession, sessionPidFor } from '../store';
import { ThemedBoard } from '../components/ThemedBoard';
import { ThemeSelect } from '../components/ThemeSelect';
import { ClaimPanel } from '../components/ClaimPanel';
import { ConnPill } from '../components/ConnPill';
import { DebugPanel } from '../components/DebugPanel';
import { debugEnabled } from '../debug';
import { BOARD, TOKENS, applyRoomDelta, netWorth } from '@monopoly/shared';
import type { RoomDelta, RoomState } from '@monopoly/shared';
import { getPlayerColor } from '../components/playerTokens';
import { CashFloatBadge, usePlayerCashDeltas } from '../components/CashFloats';
import { getVolume, isMuted, setMuted, setVolume, sndBuy, sndCash, sndError, sndRoll, sndWin } from '../sound';
import { ConfettiCanvas } from '../components/ConfettiCanvas';
import { TvTradeSpotlight } from '../components/TvTradeSpotlight';
import { isHighContrast, setHighContrast } from '../accessibility';
import { EndgameStats } from '../components/EndgameStats';

export function HostScreen() {
  const { code = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const { room, setRoom } = useGame();
  const [err, setErr] = useState('');
  const upCode = code.toUpperCase();
  const [pid, setPid] = useState(() => sp.get('pid') || sessionPidFor(upCode) || '');
  const [sockState, setSockState] = useState<Socket | null>(null);
  // Chrome (header, pickers, host buttons, invite) auto-hides once play
  // starts so the TV is all board; the floating button brings it back.
  const [chromeHidden, setChromeHidden] = useState(false);

  const joinURL = useMemo(() => {
    // Phones need a reachable host. Preserve protocol + current port so the QR
    // works both in dev (:5173) and prod single-port (:3001). On desktops
    // showing "localhost", replace with your LAN IP (see hint below).
    const { protocol, hostname, port } = window.location;
    const base = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    return `${base}/play/${upCode}`;
  }, [upCode]);

  useEffect(() => {
    if (room?.status === 'playing') setChromeHidden(true);
  }, [room?.status]);

  useEffect(() => {
    const s = freshSocket();
    setSockState(s);
    let alive = true;
    // The dashboard is a pure spectator view: it never takes a seat, so a
    // takeover elsewhere can never "evict" this screen. Host powers below
    // work whenever this browser holds the host key.
    // Re-watch on every transport reconnect: an auto-reconnected socket never
    // rejoined the room, so without this the TV board freezes on stale state.
    // Single sync path — socket.io connects asynchronously, so 'connect'
    // fires for the initial mount as well as every reconnect.
    const sync = () => {
      if (!alive) return;
      s.emit('watchRoom', { code: upCode }, (res: { ok: boolean; room: RoomState }) => {
        if (!alive) return;
        if (res?.ok) setRoom(res.room);
        else setErr('Room not found. Create one from the home page.');
      });
    };
    s.on('connect', sync);
    s.on('roomState', (r) => { if (alive) setRoom(r); });
    // Delta fast-path with full-state fallback (see PlayScreen).
    s.on('roomDelta', (d: RoomDelta) => {
      if (!alive) return;
      const merged = applyRoomDelta(useGame.getState().room, d);
      if (merged) setRoom(merged);
    });
    return () => { alive = false; s.disconnect(); setSockState(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upCode]);

  if (err) return <div className="p-10 text-center text-rose-200">{err}</div>;
  if (!room || room.code !== upCode) {
    return <div className="p-10 text-center text-white/60">Loading board {upCode}… (start server with <code>npm run dev</code>)</div>;
  }

  const sorted = [...room.players].sort((a, b) => {
    if (room.status === 'finished') {
      return netWorth(b, room) - netWorth(a, room);
    }
    return b.cash - a.cash;
  });
  const hostSeat = room.players.find((p) => p.isHost);
  const amHost = !!hostSeat && hostSeat.id === pid;
  const activePlay = room.status === 'playing' || room.status === 'paused';
  const [mutedUi, setMutedUi] = useState(isMuted());
  const [volumeUi, setVolumeUi] = useState(getVolume());
  const [contrastUi, setContrastUi] = useState(isHighContrast());
  const floats = usePlayerCashDeltas(room);

  // Trigger TV audio effects on key events if unmuted
  const prevRevRef = useRef<number | null>(null);
  useEffect(() => {
    if (!room || isMuted()) return;
    if (prevRevRef.current !== null && prevRevRef.current !== room.rev) {
      const latest = room.log[0];
      if (latest) {
        if (latest.text.includes('rent') || latest.text.includes('passed GO')) sndCash();
        else if (latest.text.includes('bought') || latest.text.includes('built')) sndBuy();
        else if (latest.text.includes('wins the game')) sndWin();
        else if (latest.text.includes('bankrupt') || latest.text.includes('JAIL')) sndError();
      }
    }
    prevRevRef.current = room.rev;
  }, [room?.rev, room?.log]);
  const hideChrome = chromeHidden && activePlay;
  // Shown when this browser doesn't hold the host key (fresh window, or the
  // key moved elsewhere). The board itself always works — only the buttons
  // below need the key.
  const [needLogin, setNeedLogin] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const roomCode: string = room.code;

  async function hostAction(ev: 'pauseGame' | 'resumeGame' | 'endGame' | 'kickPlayer' | 'setBoardStyle' | 'addBot', extra: Record<string, unknown> = {}) {
    if (!pid) { setErr('Host seat not held on this screen.'); return; }
    try {
      const res = await emitWithAck<{ ok: boolean; error?: string }>(ev, { code: roomCode, playerId: pid, key: loadControl(pid), ...extra });
      if (!res?.ok) {
        if (res?.error === 'NOT_HOST' || res?.error === 'NO_CONTROL') {
          setNeedLogin(true);
          setErr(res?.error === 'NO_CONTROL'
            ? 'This screen lost the host seat (server restarted or it was claimed elsewhere) — reclaim it in 🔑 Host login below.'
            : 'Host controls moved to another device — reclaim them in 🔑 Host login below.');
        } else if (res?.error === 'ROOM_FULL') {
          setErr('Table is full (8 max) — remove a seat before adding a bot.');
        } else if (res?.error === 'GAME_OVER') {
          setErr('That game already finished — start a new room for bots.');
        } else setErr('Host action failed.');
      } else setNeedLogin(false);
    } catch {
      setErr('Server not responding — is it running?');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 lg:px-6">
      {debugEnabled() && <DebugPanel />}
      {!hideChrome && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-display text-xl font-bold">🎲 MONOPOLY PARTY <span className="ml-2 rounded-lg bg-amber-300 px-2 py-1 font-mono text-black">{room.code}</span></div>
          <button onClick={() => navigator.clipboard?.writeText(joinURL)} className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20">📋 Copy invite link</button>
          <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold">
            <button
              type="button"
              title={mutedUi ? 'Unmute TV sounds' : 'Mute TV sounds'}
              onClick={() => { const m = !mutedUi; setMuted(m); setMutedUi(m); }}
              className="flex items-center gap-1.5 hover:text-amber-200 transition-colors"
            >
              <span>{mutedUi ? '🔇' : '🔊'}</span>
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={mutedUi ? 0 : volumeUi}
              title={`TV Sound Volume (${Math.round((mutedUi ? 0 : volumeUi) * 100)}%)`}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                setVolumeUi(val);
                if (val > 0 && mutedUi) {
                  setMuted(false);
                  setMutedUi(false);
                }
              }}
              className="w-16 h-1.5 accent-amber-300 rounded-lg cursor-pointer bg-white/20"
            />
          </div>
          <button
            type="button"
            title="Toggle TV Fullscreen"
            onClick={() => {
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen?.();
              } else {
                void document.exitFullscreen?.();
              }
            }}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 hover:bg-white/20"
          >
            <span>📺 Fullscreen</span>
          </button>
          <button
            type="button"
            title="Toggle high-contrast visibility mode for TV glare"
            onClick={() => {
              const next = !contrastUi;
              setHighContrast(next);
              setContrastUi(next);
            }}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 transition-colors ${
              contrastUi ? 'bg-amber-300 text-black font-extrabold shadow' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span>{contrastUi ? '☀️ High Contrast: ON' : '🌓 High Contrast'}</span>
          </button>
          <div className="ml-auto text-sm text-white/60">{room.status === 'lobby' ? '🟡 Lobby — waiting for players' : room.status === 'playing' ? '🟢 Playing' : room.status === 'paused' ? '⏸ Paused' : '🏁 Finished'}</div>
        </div>
      )}

      {amHost && (room.status === 'playing' || room.status === 'paused') && !hideChrome && (
        <div className="glass mt-3 flex items-center gap-3 rounded-2xl p-3 flex-wrap">
          <span className="font-bold">🔧 Host</span>
          {room.status === 'playing' ? (
            <button onClick={() => hostAction('pauseGame')} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold hover:bg-white/25">⏸ Pause game</button>
          ) : (
            <button onClick={() => hostAction('resumeGame')} className="btn-gold rounded-xl px-4 py-2 text-sm">▶️ Resume game</button>
          )}
          <button
            onClick={() => {
              if (window.confirm('End the game now and crown the winner by total assets?')) {
                hostAction('endGame');
              }
            }}
            className="rounded-xl bg-rose-500/25 border border-rose-400/40 text-rose-200 px-4 py-2 text-sm font-bold hover:bg-rose-500/40"
          >
            🏁 End game
          </button>
          <span className="text-xs text-white/50">Pause freezes turns and auctions. End game ranks players by total net worth.</span>
        </div>
      )}

      {amHost && (room.status === 'lobby' || room.status === 'playing') && !hideChrome && room.players.length < 8 && (
        <div className="glass mt-3 flex items-center gap-3 rounded-2xl p-3">
          <span className="font-bold">🤖 Bots</span>
          <button onClick={() => hostAction('addBot')} title="Add a computer player" className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">+ Add bot</button>
          <span className="text-xs text-white/50">Server-driven seat: rolls, buys, builds. Remove with ✕ below.</span>
        </div>
      )}

      {amHost && !hideChrome && (
        <ThemeSelect value={room.boardStyle} onPick={(style) => hostAction('setBoardStyle', { style })} />
      )}

      {room.auction && <AuctionPanel room={room} />}
      {room.status === 'playing' && room.trades.length > 0 && <TvTradeSpotlight room={room} />}
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
              saveSession(upCode, newPid);
              setPid(newPid);
              setSp({ pid: newPid }, { replace: true });
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
                <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">{TOKENS[p.token]} {p.name}{p.isBot ? ' 🤖' : ''}</span>
              ))}
            </div>
            <StartButton code={room.code} count={room.players.length} hostId={pid} hostKey={loadControl(pid)} onAuthLost={() => setNeedLogin(true)} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {room.status === 'finished' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <ConfettiCanvas />
            <div className="glass mt-3 flex flex-col items-center gap-3 rounded-3xl p-5 text-center md:flex-row md:text-left shadow-2xl">
              <div className="flex-1">
                <div className="font-display text-lg font-bold">🏆 {room.players.find((p) => p.id === room.winnerId)?.name} wins the game!</div>
                <div className="text-sm text-white/60">Same players, fresh $1500, shuffled order.</div>
              </div>
              <RematchButton code={room.code} count={room.players.length} hostId={pid} hostKey={loadControl(pid)} onAuthLost={() => setNeedLogin(true)} />
            </div>
            <EndgameStats room={room} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ThemedBoard room={room} />
        </motion.div>
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-display font-bold">🏆 Leaderboard</div>
              <button
                type="button"
                onClick={() => setShowPins((v) => !v)}
                title={showPins ? 'Hide takeover PINs from TV' : 'Show takeover PINs on TV'}
                className="rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20 transition-colors flex items-center gap-1"
              >
                <span>{showPins ? '👁️ Hide PINs' : '🔒 Show PINs'}</span>
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {sorted.map((p, i) => {
                const pOriginalIndex = room.players.findIndex((rp) => rp.id === p.id);
                const pColor = getPlayerColor(pOriginalIndex >= 0 ? pOriginalIndex : i);
                const isLeader = i === 0 && !p.bankrupt;
                const isDanger = !p.bankrupt && p.cash <= 150;
                const playerNet = netWorth(p, room);
                return (
                  <motion.div
                    key={p.id}
                    layout
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                    className={`relative flex items-center gap-2 rounded-xl px-3 py-2 border transition-all ${
                      p.bankrupt
                        ? 'bg-white/5 opacity-40 border-white/5'
                        : isLeader
                        ? 'bg-amber-300/10 border-amber-300/40 shadow-[0_0_12px_rgba(252,211,77,0.15)]'
                        : isDanger
                        ? 'bg-rose-500/10 border-rose-500/40 animate-pulse'
                        : 'bg-white/10 border-white/5'
                    }`}
                    style={{
                      borderLeftColor: pColor.hex,
                      borderLeftWidth: '4px',
                    }}
                  >
                    <CashFloatBadge items={floats[p.id]} />
                    <span className="w-5 text-xs font-bold flex items-center gap-1">
                      {isLeader ? '👑' : <span className="text-white/70">{i + 1}</span>}
                    </span>
                    <span
                      className="flex items-center justify-center w-7 h-7 rounded-full text-base border shadow-sm"
                      style={{
                        background: pColor.bgRgba,
                        borderColor: pColor.hex,
                        boxShadow: `0 0 6px ${pColor.glowRgba}`,
                      }}
                    >
                      {TOKENS[p.token]}
                    </span>
                    <span className="flex-1 truncate font-semibold">
                      {p.name}
                      {p.isBot ? ' 🤖' : ''} {p.bankrupt ? '(💀)' : ''}{' '}
                      {!p.connected ? '(📴)' : p.controllerLabel ? `📱${p.controllerLabel}` : ''}
                      {isDanger && <span className="ml-1 text-[10px] text-rose-300 font-bold">⚠️ LOW CASH</span>}
                    </span>
                    {!p.bankrupt && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-200" title="Seat takeover PIN">
                        {showPins ? `PIN ${p.seatPin}` : '••••'}
                      </span>
                    )}
                    <div className="text-right font-mono min-w-16">
                      <div className={`font-bold ${p.cash < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                        ${p.cash}
                      </div>
                      <div className="text-[10px] text-white/50" title="Total Net Worth (Cash + Deeds + Buildings)">
                        Net: ${playerNet}
                      </div>
                    </div>
                    {amHost && hostSeat && p.id !== hostSeat.id && !p.bankrupt && (
                      <button
                        title={`Remove ${p.name} (deeds go to auction)`}
                        onClick={() => {
                          if (window.confirm(`Remove ${p.name} from the game? Their deeds go to bank auction.`))
                            hostAction('kickPlayer', { targetId: p.id });
                        }}
                        className="rounded-lg bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-200"
                      >
                        ✕
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
          {(room.status === 'playing' || room.status === 'paused') && !hideChrome && (
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
                <div key={l.id} className="rounded-lg bg-black/20 px-2 py-1 text-white/80">
                  <span className="mr-1.5 font-mono text-xs text-white/40">
                    {new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>{l.text}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {activePlay && (
        <button
          onClick={() => setChromeHidden((v) => !v)}
          title={chromeHidden ? 'Show header and host controls' : 'Hide header and host controls'}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur hover:bg-white/20"
        >
          {chromeHidden ? '🎛️ Show controls' : '🎛️ Hide'}
        </button>
      )}
    </div>
  );
}

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
    <div className="glass mt-3 rounded-3xl border-2 border-amber-300/60 p-4 text-center shadow-[0_0_20px_rgba(251,191,36,0.2)]">
      <div className="flex items-center justify-center gap-3">
        <span className={`text-2xl ${secs <= 5 ? 'animate-bounce' : ''}`}>🔨</span>
        <div className="font-display text-lg font-bold">
          Auction: {BOARD[a.tile]?.name}
        </div>
        <div className="relative flex items-center justify-center w-8 h-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke={secs <= 5 ? '#f43f5e' : '#f59e0b'}
              strokeWidth="3.5"
              strokeDasharray={94.2}
              strokeDashoffset={94.2 * (1 - Math.min(1, secs / 30))}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <span className={`absolute font-mono text-xs font-black ${secs <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-200'}`}>
            {secs}
          </span>
        </div>
      </div>
      <div className="mt-1 text-sm text-white/80">
        {top ? <>Top bid <b className="text-emerald-300 font-mono">${top.amount}</b> by <b>{nameOf(top.playerId)}</b> ({a.bids.length} bid{a.bids.length === 1 ? '' : 's'})</> : 'No bids yet — open your phone to bid!'}
      </div>
      {(() => {
        const pastAuctions = room.log.filter((l) => l.text.toLowerCase().includes('auction'));
        if (pastAuctions.length === 0) return null;
        return (
          <div className="mt-2 pt-2 border-t border-white/10 text-left">
            <details className="group">
              <summary className="text-xs font-semibold text-amber-200/80 hover:text-amber-200 cursor-pointer flex items-center justify-between">
                <span>📜 Match Auction History ({pastAuctions.length})</span>
                <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
              </summary>
              <div className="mt-1.5 max-h-24 overflow-y-auto space-y-1 text-xs text-white/70">
                {pastAuctions.map((item) => (
                  <div key={item.id} className="rounded-lg bg-black/20 px-2 py-0.5">
                    • {item.text}
                  </div>
                ))}
              </div>
            </details>
          </div>
        );
      })()}
    </div>
  );
}

function RematchButton({ code, count, hostId, hostKey, onAuthLost }: { code: string; count: number; hostId: string; hostKey: string | null; onAuthLost: () => void }) {
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
            if (!res?.ok) {
              if (res?.error === 'NO_CONTROL') {
                onAuthLost();
                setMsg('This screen lost the host seat (server restarted or it was claimed elsewhere) — reclaim it in 🔑 Host login below, then rematch.');
              } else setMsg(res?.error === 'NOT_HOST' ? 'This screen no longer holds the host seat.' : 'Could not restart (need 2+ players)');
            }
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

function StartButton({ code, count, hostId, hostKey, onAuthLost }: { code: string; count: number; hostId: string; hostKey: string | null; onAuthLost: () => void }) {
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
            if (!res?.ok) {
              if (res?.error === 'NO_CONTROL') {
                onAuthLost();
                setMsg('This screen lost the host seat (server restarted or it was claimed elsewhere) — reclaim it in 🔑 Host login below, then start again.');
              } else setMsg(res?.error === 'NEED_2' ? 'Need at least 2 players to start' : res?.error === 'NOT_HOST' ? 'This screen no longer holds the host seat.' : 'Could not start game');
            }
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
