import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Socket } from 'socket.io-client';
import { freshSocket } from '../socket';
import { mePlayer, loadControl, saveControl, useGame, saveSession, sessionPidFor, clearControl, clearSession } from '../store';
import { ClaimPanel } from '../components/ClaimPanel';
import { SwitchTab } from '../components/SwitchTab';
import { ActivityFeed } from '../components/ActivityFeed';
import { DicePair } from '../components/DiceFace';
import { HoldToRollButton } from '../components/HoldToRollButton';
import { ConnPill } from '../components/ConnPill';
import { TradeTab } from '../components/TradeTab';
import { minNextBid, nameOf, outbidBy, topBid } from '../auctionNotify';
import { PropsTab } from '../components/PropsTab';
import { resolveDiceFaces } from '../components/diceResolve';
import { friendlyError } from '../friendlyError';
import { DebugPanel } from '../components/DebugPanel';
import { debugEnabled, dlogc } from '../debug';
import { TurnCountdown } from '../components/TurnCountdown';
import { isMuted, setMuted, sndBuy, sndCash, sndError, sndRoll, sndTick, sndWin } from '../sound';
import { BOARD, GO_SALARY, TOKENS, applyRoomDelta, ownerOf, rentFor, tilePrice } from '@monopoly/shared';
import { TileArt } from '../components/TileArt';
import type { Player, RoomDelta, RoomState } from '@monopoly/shared';

export function PlayScreen() {
  const { code = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const { room, setRoom, playerId, setPlayerId, controlKey, setControlKey } = useGame();
  const [rolling, setRolling] = useState(false);
  const [preview, setPreview] = useState<[number, number] | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'props' | 'log' | 'trade' | 'switch'>('props');
  const [mutedUi, setMutedUi] = useState(isMuted());
  // Pending ack-timeout ids: cleared as acks land, and all dropped on
  // unmount so a late timer can't setErr on a dead screen.
  const ackTimers = useRef<Set<number>>(new Set());
  const prevCash = useRef<number | null>(null);
  const wonRef = useRef(false);
  // Two-tap bankruptcy confirm (replaces window.confirm): first tap arms,
  // second fires. Disarms when the cash/turn situation changes underneath.
  const [armBankrupt, setArmBankrupt] = useState(false);
  const diceTripRef = useRef('');
  const sockRef = useRef<Socket | null>(null);
  const [sockState, setSockState] = useState<Socket | null>(null);
  // Hold-to-roll presence timers (TV wobble); cleaned up on unmount.
  const rollStartTimer = useRef<number | null>(null);
  const rollStartedRef = useRef(false);
  // Tracks the live transport. Starts false: a cached room from an earlier
  // visit must never look playable before the first fresh sync lands.
  const [sockUp, setSockUp] = useState(false);

  const upCode = code.toUpperCase();
  // State (freshly switched seats) wins over the URL, which goes stale after a switch.
  // Storage fallback is scoped per room (tab identity, then per-room map), so a
  // refresh never picks up another tab's seat from a different room.
  const pid = playerId || sp.get('pid') || sessionPidFor(upCode) || '';
  const key = controlKey || loadControl(pid);
  useEffect(() => { setArmBankrupt(false); }, [room?.turnCount, pid, playerId, room ? mePlayer(room, pid)?.cash : null]);

  // A kicked seat vanishes from players entirely (bankrupt seats stay put).
  // Drop the stale identity so the no-seat view + claim flow take over
  // instead of rejoin retries against a seat that no longer exists.
  useEffect(() => {
    if (room && room.code === upCode && playerId && !room.players.some((p) => p.id === playerId)) {
      clearSession(room.code, playerId);
      clearControl(playerId);
      setPlayerId(null);
      setControlKey(null);
    }
  }, [room, upCode, playerId, setPlayerId, setControlKey]);

  useEffect(() => {
    const s = freshSocket();
    sockRef.current = s;
    setSockState(s);
    let alive = true;
    // (Re)join the socket.io room and pull fresh state. Runs on EVERY
    // (re)connect — initial mount included (socket.io always connects
    // asynchronously, so one path covers both). Without this, an
    // auto-reconnected socket never rejoins the room, stops receiving
    // roomState, and freezes on a stale turn — showing a phantom
    // "YOUR TURN" while the game moved on.
    // Reads identity fresh from the store so reconnects survive seat switches.
    const sync = () => {
      if (!alive) return;
      const { playerId: freshPid, controlKey: freshKey } = useGame.getState();
      const syncPid = freshPid || sp.get('pid') || sessionPidFor(upCode) || '';
      if (syncPid) {
        s.emit('rejoin', { code: upCode, playerId: syncPid, key: freshKey || loadControl(syncPid) }, (res: { ok: boolean; error?: string; room: never }) => {
          if (!alive) return;
          if (res?.ok) { setRoom(res.room as never); setPlayerId(syncPid); saveSession(upCode, syncPid); setPreview(null); }
          else if (res?.error === 'NO_CONTROL') setErr('🔀 This device no longer controls that seat — reclaim it in 🔀 Switch with the TV PIN.');
          else { clearSession(upCode, syncPid); setErr('Session expired — rejoin from home with your code.'); }
        });
      } else {
        s.emit('watchRoom', { code: upCode }, (res: { ok: boolean; room: never }) => {
          if (!alive) return;
          if (res?.ok) setRoom(res.room as never);
        });
        setErr('No player session on this phone. Join from home first.');
      }
    };
    // Single sync path: socket.io connects asynchronously, so 'connect'
    // fires for the initial mount as well as every reconnect.
    s.on('connect', () => { if (!alive) return; setSockUp(true); sync(); });
    s.on('disconnect', () => { if (alive) setSockUp(false); });
    s.on('roomState', (r) => { if (!alive) return; setRoom(r); setRolling(false); setPreview(null); setSockUp(true); });
    // Delta fast-path: apply onto the cached rev when it lines up, otherwise
    // ignore — the full roomState arriving alongside will resync us.
    s.on('roomDelta', (d: RoomDelta) => {
      if (!alive) return;
      const cur = useGame.getState().room;
      const merged = applyRoomDelta(cur, d);
      if (merged) { setRoom(merged); setRolling(false); setPreview(null); setSockUp(true); }
      else dlogc('delta-skip', `base=${d.baseRev} have=${cur?.rev ?? '—'} rev=${d.rev}`);
    });
    s.on('evicted', () => {
      if (!alive) return;
      dlogc('evicted', 'another device took this seat');
      setErr('🔀 Another device took over this seat. Reclaim it in 🔀 Switch with the TV PIN.');
      setTab('switch');
    });
    return () => {
      alive = false;
      ackTimers.current.forEach((t) => clearTimeout(t));
      ackTimers.current.clear();
      if (rollStartTimer.current != null) { clearTimeout(rollStartTimer.current); rollStartTimer.current = null; }
      rollStartedRef.current = false;
      s.disconnect(); sockRef.current = null; setSockState(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upCode, pid]);

  const me = mePlayer(room, pid || playerId);
  const isMyTurn = !!room && !!me && room.status === 'playing' && !me.bankrupt && room.players[room.turnIndex % room.players.length]?.id === me.id;
  // Local expiry: the server resolve lands ~0.5s+ after turnDeadline, and a
  // tap in that gap would still be honored. Expire the action UI the moment
  // the clock hits zero; the next snapshot (new turnCount/deadline) resets.
  const [timeUp, setTimeUp] = useState(false);
  useEffect(() => { setTimeUp(false); }, [room?.turnCount, room?.turnDeadline, room?.turnIndex]);
  const canAct = isMyTurn && !timeUp;
  // Hammer down: bidding runs without roll pressure — roll and end-turn wait
  // for the gavel (buy/pass/mortgage/bids stay available). The server rejects
  // stale taps with AUCTION_LIVE; hiding the buttons keeps it honest up front.
  const auctionLive = room?.status === 'playing' && room?.auction != null;
  const canRoll = canAct && !auctionLive;

  useEffect(() => {
    if (isMyTurn && navigator.vibrate) { try { navigator.vibrate(60); } catch { /* noop */ } }
  }, [isMyTurn]);

  // Buzz on NEW incoming offers (count increase only — not every render),
  // and toast briefly when an auction closes under us.

  const cashNow = mePlayer(room, pid || playerId)?.cash;
  useEffect(() => {
    if (cashNow == null) return;
    if (prevCash.current != null && cashNow > prevCash.current) sndCash();
    prevCash.current = cashNow;
  }, [cashNow]);

  useEffect(() => {
    if (room?.status === 'finished' && room.winnerId && room.winnerId === pid && !wonRef.current) {
      wonRef.current = true;
      sndWin();
    }
    if (room?.status !== 'finished') wonRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.winnerId]);

  function emit(ev: string, extra: Record<string, unknown> = {}, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void, onErr?: (code?: string) => void) {
    const s = sockRef.current;
    if (!s) return;
    setErr('');
    const timer = window.setTimeout(() => {
      ackTimers.current.delete(timer);
      setErr('Server not responding — check connection');
    }, 8000);
    ackTimers.current.add(timer);
    s.emit(ev, { code: upCode, playerId: pid, key, ...extra }, (res: { ok: boolean; error?: string; controlKey?: string }) => {
      clearTimeout(timer);
      ackTimers.current.delete(timer);
      if (!res?.ok) {
        setErr(friendlyError(res?.error)); sndError(); onErr?.(res?.error);
        dlogc('ack-error', `${ev} → ${res?.error || 'reject'} (rev ${useGame.getState().room?.rev ?? '—'})`);
      }
      else onOk?.(res);
    });
  }
  const hasControl = !!key;

  // Whether this phone is actively shaking right now. The dice preview is
  // only allowed to render while shaking (or while the commit is in flight);
  // otherwise the authoritative server dice win, so a stray post-commit tick
  // can never leave fantasy faces on screen next to the true result.
  const [shaking, setShaking] = useState(false);
  const shakingRef = useRef(false);

  // Tripwire for the dice-mismatch class of bug: a live preview that the
  // render gate is suppressing means ticks outlived the commit — exactly what
  // to paste into a bug report.
  useEffect(() => {
    if (!room || preview == null) return;
    if (!(shaking || rolling)) {
      const sig = `${room.rev}:${preview[0]},${preview[1]}:${room.dice[0]},${room.dice[1]}`;
      if (diceTripRef.current !== sig) {
        diceTripRef.current = sig;
        dlogc('dice-mismatch', `preview=[${preview}] suppressed, server=[${room.dice}] rev=${room.rev}`);
      }
    }
  }, [room, preview, shaking, rolling]);

  // Hold-to-roll presence: tell the room we're shaking (TV + others wobble).
  // Debounced 300ms so quick taps never flash the TV; fire-and-forget, the
  // server validates turn/control and auto-clears on roll/timeout/disconnect.
  function holdPresence(holding: boolean) {
    shakingRef.current = holding;
    setShaking(holding);
    if (holding) {
      if (rollStartTimer.current != null) return;
      rollStartTimer.current = window.setTimeout(() => {
        rollStartTimer.current = null;
        rollStartedRef.current = true;
        sockRef.current?.emit('rollStart', { code: upCode, playerId: pid, key });
      }, 300);
    } else {
      if (rollStartTimer.current != null) { clearTimeout(rollStartTimer.current); rollStartTimer.current = null; }
      if (rollStartedRef.current) {
        rollStartedRef.current = false;
        sockRef.current?.emit('rollStop', { code: upCode, playerId: pid, key });
      }
    }
  }

  if (!room || room.code !== upCode) return <div className="p-8 text-center text-white/60">Connecting to {upCode}…<br /><Link className="underline" to="/">← home</Link></div>;
  if (!me) return (
    <div className="mx-auto max-w-md px-3 pb-16 pt-4">
      <div className="glass rounded-2xl p-4 text-center">
        <div className="text-3xl">🎪</div>
        <div className="font-display mt-1 text-lg font-bold">No seat on this device yet</div>
        <div className="mt-1 text-sm text-white/60">
          New here? <Link to="/" className="underline">Join with the TV code</Link> for a fresh seat.
          Returning on another browser? Claim your seat below with its TV PIN.
        </div>
      </div>
      {err && <div className="mt-2 rounded-xl bg-rose-500/20 px-3 py-2 text-center text-sm text-rose-200">{err}</div>}
      <ClaimPanel
        room={room}
        emit={emit}
        onClaimed={(newPid, newKey) => {
          saveControl(newPid, newKey);
          saveSession(room.code, newPid);
          setControlKey(newKey);
          setPlayerId(newPid);
          // Keep the URL in sync: a refresh must reload THIS seat, not the
          // ?pid= the page was opened with.
          setSp({ pid: newPid }, { replace: true });
        }}
      />
      <div className="mt-3 text-center"><Link to="/" className="rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur">🏠 Home</Link></div>
    </div>
  );

  const myTile = BOARD[me.position];
  const pending = room.pendingBuy != null ? { i: room.pendingBuy, t: BOARD[room.pendingBuy] } : null;
  const pendingPrice = pending && (pending.t.kind === 'property' || pending.t.kind === 'railroad' || pending.t.kind === 'utility') ? pending.t.price : 0;
  const pendingName = pending ? pending.t.name : '';
  const canBuy = !!(isMyTurn && pending && me.cash >= pendingPrice && pendingPrice > 0);
  const incomingCount = room.trades.filter((t) => t.toId === me.id).length;

  // Buzz on NEW incoming offers (count increase only — not every render),
  // and toast briefly when an auction closes under us.
  const prevIncoming = useRef(0);
  const prevAuctionId = useRef<string | null>(null);
  const [auctionToast, setAuctionToast] = useState(false);
  useEffect(() => {
    if (incomingCount > prevIncoming.current && navigator.vibrate) {
      try { navigator.vibrate([40, 40, 40]); } catch { /* noop */ }
    }
    prevIncoming.current = incomingCount;
  }, [incomingCount]);
  useEffect(() => {
    const id = room?.auction?.id ?? null;
    if (prevAuctionId.current && !id) {
      setAuctionToast(true);
      const t = setTimeout(() => setAuctionToast(false), 5000);
      prevAuctionId.current = id;
      return () => clearTimeout(t);
    }
    prevAuctionId.current = id;
  }, [room?.auction?.id]);

  // Current-position card data (mockup "Current Position" panel).
  const ownerId = ownerOf(room, me.position);
  const ownerName = ownerId ? room.players.find((p) => p.id === ownerId)?.name ?? null : null;
  const isMine = me.properties.includes(me.position);
  const tileRent = (myTile.kind === 'property' || myTile.kind === 'railroad' || myTile.kind === 'utility')
    ? rentFor(room, me.position, room.dice[0] + room.dice[1]) : 0;
  const tileDetail = myTile.kind === 'tax' ? `Pay $${myTile.amount}`
    : myTile.kind === 'chance' ? 'Draw a Chance card'
    : myTile.kind === 'chest' ? 'Draw a Community Chest card'
    : myTile.kind === 'gotojail' ? 'Go straight to Jail'
    : myTile.kind === 'jail' ? (me.inJail ? 'Serving time' : 'Just visiting')
    : myTile.kind === 'go' ? `Collect $${GO_SALARY} salary`
    : myTile.kind === 'parking' ? 'Rest — nothing happens'
    : null;
  return (
    <div className="mx-auto max-w-md px-3 pb-28 pt-4">
      {/* header */}
      <div className="glass flex items-center gap-3 rounded-2xl p-3">
        <div className="text-3xl">{TOKENS[me.token]}</div>
        <div className="flex-1">
          <div className="font-bold">🎮 {me.name} <span className="ml-1 rounded bg-white/10 px-1 font-mono text-xs">{room.code}</span></div>
          <div className="text-xs text-white/60">📍 {myTile.name} · {me.inJail ? '🔒 In jail' : 'Free'} · {hasControl ? 'controlling' : 'NOT controlling'}</div>
        </div>
        <div className={`font-mono text-xl font-extrabold ${me.cash < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>${me.cash}</div>
        <button type="button" title={mutedUi ? 'Unmute sounds' : 'Mute sounds'}
          onClick={() => { const m = !mutedUi; setMuted(m); setMutedUi(m); }}
          className="rounded-xl bg-white/10 px-2 py-1 text-lg">{mutedUi ? '🔇' : '🔊'}</button>
      </div>

      {/* turn banner */}
      <ConnPill sock={sockState} />
      {debugEnabled() && <DebugPanel />}
      <AnimatePresence>
        {room.status === 'lobby' && <Banner key="lobby" text="⏳ Waiting for host to start… show this screen is ready!" />}
        {room.status === 'finished' && (
          <Banner key="win" gold text={room.winnerId === me.id ? '🏆 YOU WIN! 🎉' : `🏁 ${room.players.find((p) => p.id === room.winnerId)?.name} wins`} />
        )}
        {room.status === 'playing' && !sockUp && <Banner key="sync" text="🔄 Reconnecting — turn status syncing with the server…" />}
        {room.status === 'playing' && sockUp && isMyTurn && !timeUp && (
          <div key="turn" className="mt-3 rounded-2xl bg-amber-300 p-4 text-center text-black">
            <div className="font-display text-xl font-extrabold">🎲 Your Turn, {me.name}!</div>
            <div className="text-sm font-semibold opacity-80">Roll the dice to move · Turn #{room.turnCount}</div>
          </div>
        )}
        {room.status === 'playing' && sockUp && isMyTurn && !timeUp && (
          <div className="mt-1 text-center"><TurnCountdown deadline={room.turnDeadline} onZero={() => setTimeUp(true)} className="rounded-full bg-amber-300/20 px-3 py-1 font-mono text-sm text-amber-200" /></div>
        )}
        {room.status === 'playing' && sockUp && isMyTurn && timeUp && (
          <Banner key="timeup" text="⏰ Time! Resolving your turn…" />
        )}
        {room.status === 'playing' && sockUp && isMyTurn && !timeUp && auctionLive && (
          <Banner key="auctionwait" text="🔨 Auction in progress — bidding open, your roll waits for the gavel" />
        )}
        {room.status === 'playing' && sockUp && !isMyTurn && (
          <Banner key="wait" text={(() => {
            const roller = room.rollingId && room.rollingId !== me.id
              ? room.players.find((p) => p.id === room.rollingId)?.name : null;
            return roller
              ? `🎲 ${roller} is shaking the dice…`
              : `⏳ ${room.players[room.turnIndex % room.players.length]?.name}'s turn (#${room.turnCount}) — watch the TV`;
          })()} />
        )}
        {room.status === 'paused' && (
          <Banner key="paused" text="⏸ Paused by host — hang tight, nothing moves until resume" />
        )}
      </AnimatePresence>

  {room.lastRoll && <div className="mt-2 text-center text-sm text-amber-200">🎲 {room.lastRoll}</div>}
  <div className="mt-2 flex justify-center">
    <DicePair d1={resolveDiceFaces(preview, shaking || rolling, room.dice)[0]} d2={resolveDiceFaces(preview, shaking || rolling, room.dice)[1]} rollKey={room.lastRoll} size={48} shuffling={(shaking || rolling) && preview != null} />
  </div>
      <AnimatePresence>
        {room.lastCard && (
          <motion.div
            key={room.lastCard.at}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto mt-2 max-w-xs rounded-2xl border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-center text-sm text-amber-100"
          >
            {room.lastCard.kind === 'chance' ? '🃏' : '🎁'} {room.lastCard.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* current position */}
      <div className="glass mt-2 flex items-center gap-3 rounded-2xl p-3">
        <TileArt tile={me.position} size={56} />
        <div className="flex-1">
          <div className="text-xs text-white/50">Current Position</div>
          <div className="font-bold">📍 {myTile.name}</div>
          {(myTile.kind === 'property' || myTile.kind === 'railroad' || myTile.kind === 'utility') ? (
            <div className="text-xs text-white/60">
              Price ${tilePrice(me.position)} · Rent ${tileRent} · Owner {isMine ? 'You' : (ownerName ?? '—')}
            </div>
          ) : (
            <div className="text-xs text-white/60">{tileDetail}</div>
          )}
        </div>
        {isMine ? (
          <span className="rounded-lg bg-sky-300/20 px-2 py-1 text-xs font-bold text-sky-200">🏠 Your Property</span>
        ) : room.pendingBuy === me.position && isMyTurn ? (
          <span className="rounded-lg bg-amber-300/20 px-2 py-1 text-xs font-bold text-amber-200">🏷️ For Sale</span>
        ) : ownerName ? (
          <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white/70">{ownerName}'s</span>
        ) : null}
      </div>

      {/* quick actions */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {([
          ['🏠', 'Properties', 'props'],
          ['🤝', 'Trade', 'trade'],
          ['🔨', 'Build', 'props'],
          ['🏦', 'Mortgage', 'props'],
        ] as const).map(([icon, label, target]) => (
          <button key={label} type="button" onClick={() => setTab(target)}
            className={`rounded-2xl py-2.5 text-xs font-bold ${tab === target ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
            <span className="block text-lg">{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* actions */}
      {room.status === 'playing' && !me.bankrupt && (
        <div className="mt-3 space-y-2">
          {room.auction && <AuctionCard room={room} me={me} emit={emit} />}
          {auctionToast && !room.auction && (
            <div className="glass rounded-2xl border-emerald-300/40 p-3 text-center text-sm font-bold text-emerald-200">
              🔨 Auction closed — see who won in 📜 Feed</div>
          )}
          {/* Doubles bonus survives Buy/Pass server-side (doubles stays > 0),
              so the button stays up for the bonus roll alongside End turn. */}
          {canRoll && (!me.hasRolled || me.doubles > 0) && (
            <HoldToRollButton
              disabled={!sockUp}
              committing={rolling}
              bonus={me.hasRolled && me.doubles > 0}
              onHoldChange={holdPresence}
              onTick={() => {
                // Stray ticks after release (leaked interval, second press
                // racing the result) must not resurrect the preview — the
                // render gate below would hide it anyway, but skipping here
                // also avoids phantom vibrates and wasted renders.
                if (!shakingRef.current) return;
                setPreview([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]); sndTick();
              }}
              onCommit={() => {
                sndRoll(); setRolling(true);
                // On reject (e.g. stale tap after the turn moved on) reset
                // immediately instead of hanging on "Rolling…" for 4s.
                emit('rollDice', {}, undefined, () => { setRolling(false); setPreview(null); });
                setTimeout(() => { setRolling(false); setPreview(null); }, 4000);
              }}
            />
          )}
          {pending && canAct && (
            <div className="glass rounded-2xl border-amber-300/50 p-4 text-center">
              <div className="font-bold">🏷️ For sale: {pendingName} — ${pendingPrice}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button disabled={!canBuy} onClick={() => emit('buyProperty', {}, sndBuy)}
                  className="rounded-xl bg-emerald-300 py-3 font-extrabold text-emerald-950 disabled:opacity-40">
                  {canBuy ? `BUY $${pendingPrice}` : 'Not enough cash'}</button>
                <button onClick={() => emit('passProperty')} className="rounded-xl bg-white/15 py-3 font-bold">Pass</button>
              </div>
            </div>
          )}
          {canRoll && me.hasRolled && room.pendingBuy == null && (
            <button onClick={() => emit('endTurn')} className="w-full rounded-2xl bg-sky-300 py-4 text-xl font-extrabold text-sky-950">End turn ➡️</button>
          )}
          {me.inJail && (
            <button onClick={() => emit('payJail')} className="w-full rounded-2xl bg-orange-300 py-3 font-extrabold text-orange-950">🔓 Pay $50 to leave jail</button>
          )}
          {me.inJail && me.jailCards > 0 && (
            <button onClick={() => emit('useJailCard')} className="w-full rounded-2xl bg-emerald-300 py-3 font-extrabold text-emerald-950">🃏 Use Get-Out-of-Jail-Free ({me.jailCards})</button>
          )}
          {me.cash < 0 && (
            <button
              onClick={() => {
                if (armBankrupt) { setArmBankrupt(false); emit('bankrupt'); }
                else setArmBankrupt(true);
              }}
              className={`w-full rounded-2xl py-3 font-extrabold ${armBankrupt ? 'bg-rose-600 text-white' : 'bg-rose-500'}`}>
              {armBankrupt ? `⚠️ Tap again — leave the game? ($${me.cash})` : `💀 Declare bankruptcy ($${me.cash})`}</button>
          )}
        </div>
      )}
      {me.bankrupt && <div className="mt-3 rounded-2xl bg-white/10 p-4 text-center">💀 You're out — spectate on TV!</div>}

      {err && <div className="mt-2 rounded-xl bg-rose-500/20 px-3 py-2 text-center text-sm text-rose-200">{err}</div>}

      {/* tabs */}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setTab('props')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold ${tab === 'props' ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
          🏠 Props ({me.properties.length})</button>
        <button type="button" onClick={() => setTab('trade')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold ${tab === 'trade' ? 'bg-amber-300 text-black' : incomingCount > 0 ? 'animate-pulse bg-amber-300/30 text-amber-100' : 'bg-white/10'}`}>
          🤝 Trade{incomingCount > 0 ? ` (${incomingCount})` : ''}</button>
        <button type="button" onClick={() => setTab('log')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold ${tab === 'log' ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
          📜 Feed</button>
        <button type="button" onClick={() => setTab('switch')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold ${tab === 'switch' ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
          🔀 Switch</button>
      </div>

      {tab === 'switch' ? (
        <SwitchTab room={room} me={me} pid={pid} hasControl={hasControl} emit={emit} />
      ) : tab === 'trade' ? (
        <TradeTab room={room} me={me} emit={emit} />
      ) : tab === 'props' ? (
        <PropsTab room={room} me={me} emit={emit} />
      ) : (
        <ActivityFeed room={room} live={sockUp} />
      )}

      <Link to={`/host/${upCode}`} className="fixed bottom-3 left-3 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur">📺 TV view</Link>
      <Link to="/" className="fixed bottom-3 right-3 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur">🏠 Home</Link>
    </div>
  );
}

function AuctionCard({ room, me, emit }: { room: RoomState; me: Player; emit: (ev: string, extra?: Record<string, unknown>, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void) => void }) {
  const [amount, setAmount] = useState('');
  const a = room.auction!;
  const top = topBid(a);
  const minNext = minNextBid(a);
  const outbid = outbidBy(a, me.id);
  function bid(v: number) {
    // Keep the typed amount when the server rejects (e.g. outbid mid-tap) —
    // clearing it destroys the user's work for no reason.
    emit('auctionBid', { amount: v }, () => setAmount(''));
  }
  return (
    <div className="glass rounded-2xl border-amber-300/50 p-3 text-center">
      <div className="flex items-center justify-center gap-2 font-bold">🔨 Auction: {BOARD[a.tile]?.name}
        <TurnCountdown deadline={a.endsAt} className="rounded-full bg-amber-300/20 px-2 py-0.5 font-mono text-xs text-amber-200" />
      </div>
      <div className="text-sm text-white/70">{top ? <>Top: <b className="text-emerald-300">${top.amount}</b> ({nameOf(room, top.playerId)})</> : 'No bids yet — min $10'}</div>
      {outbid && (
        <div className="mt-1 rounded-xl bg-rose-500/20 px-2 py-1 text-sm font-bold text-rose-200">
          Outbid by {nameOf(room, outbid)} — bid ${minNext}+ to retake!</div>
      )}
      <div className="mt-2 flex gap-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          inputMode="numeric" placeholder={`${minNext}`} className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-mono outline-none" />
        <button onClick={() => bid(Math.max(minNext, Number(amount) || 0))}
          className="rounded-xl bg-amber-300 px-4 py-2 font-extrabold text-black">Bid</button>
      </div>
      <div className="mt-2 flex gap-2">
        {[10, 50].map((d) => (
          <button key={d} type="button" onClick={() => bid(Math.max(minNext, (top?.amount ?? 0) + d))}
            className="flex-1 rounded-xl bg-white/10 py-1.5 text-xs font-bold">+${d} (${Math.max(minNext, (top?.amount ?? 0) + d)})</button>
        ))}
      </div>
      <div className="mt-1 text-xs text-white/50">Your cash: ${me.cash} · highest bid wins at zero</div>
    </div>
  );
}

function Banner({ text, gold = false }: { text: string; gold?: boolean }) {
  return (
    <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
      className={`mt-3 rounded-2xl px-4 py-3 text-center font-bold ${gold ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
      {text}
    </motion.div>
  );
}
