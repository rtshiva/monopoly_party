import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Socket } from 'socket.io-client';
import { emitWithAck, freshSocket } from '../socket';
import { loadControl, saveControl, useGame, saveSession, sessionPidFor } from '../store';
import { ThemedBoard } from '../components/ThemedBoard';
import { ClaimPanel } from '../components/ClaimPanel';
import { ConnPill } from '../components/ConnPill';
import { DebugPanel } from '../components/DebugPanel';
import { debugEnabled } from '../debug';
import { TOKENS, applyRoomDelta, netWorth } from '@monopoly/shared';
import type { RoomDelta, RoomState } from '@monopoly/shared';
import { usePlayerCashDeltas } from '../components/CashFloats';
import { getVolume, isMuted, sndBuy, sndCash, sndError, sndWin } from '../sound';
import { ConfettiCanvas } from '../components/ConfettiCanvas';
import { TvTradeSpotlight } from '../components/TvTradeSpotlight';
import { isHighContrast } from '../accessibility';
import { EndgameStats } from '../components/EndgameStats';
import { announceLogEvent, isAnnouncerEnabled } from '../announcer';
import { HostToolbar } from '../components/HostToolbar';
import { HostLeaderboard } from '../components/HostLeaderboard';
import { HostAuctionPanel } from '../components/HostAuctionPanel';
import { HostLobbyCard } from '../components/HostLobbyCard';

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
  const [announcerUi, setAnnouncerUi] = useState(isAnnouncerEnabled());
  const floats = usePlayerCashDeltas(room);

  // Trigger TV audio effects and speech announcer on key events if unmuted
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

        if (announcerUi && !mutedUi) {
          announceLogEvent(latest.text);
        }
      }
    }
    prevRevRef.current = room.rev;
  }, [room?.rev, room?.log, announcerUi, mutedUi]);
  const hideChrome = chromeHidden && activePlay;
  // Shown when this browser doesn't hold the host key (fresh window, or the
  // key moved elsewhere). The board itself always works — only the buttons
  // below need the key.
  const [needLogin, setNeedLogin] = useState(false);
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
      <HostToolbar
        room={room}
        joinURL={joinURL}
        amHost={amHost}
        hideChrome={hideChrome}
        mutedUi={mutedUi}
        setMutedUi={setMutedUi}
        volumeUi={volumeUi}
        setVolumeUi={setVolumeUi}
        contrastUi={contrastUi}
        setContrastUi={setContrastUi}
        announcerUi={announcerUi}
        setAnnouncerUi={setAnnouncerUi}
        hostAction={hostAction}
      />

      {room.auction && <HostAuctionPanel room={room} />}
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
        <HostLobbyCard
          room={room}
          joinURL={joinURL}
          hostId={pid}
          hostKey={loadControl(pid)}
          onAuthLost={() => setNeedLogin(true)}
        />
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
          <HostLeaderboard
            room={room}
            sorted={sorted}
            floats={floats}
            amHost={amHost}
            hostSeat={hostSeat}
            onKick={(targetId) => hostAction('kickPlayer', { targetId })}
          />
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
