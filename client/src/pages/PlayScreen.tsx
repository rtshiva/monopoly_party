import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Socket } from 'socket.io-client';
import { freshSocket } from '../socket';
import { mePlayer, loadControl, useGame } from '../store';
import { SwitchTab } from '../components/SwitchTab';
import { DicePair } from '../components/DiceFace';
import { ConnPill } from '../components/ConnPill';
import { TradeTab } from '../components/TradeTab';
import { TurnCountdown } from '../components/TurnCountdown';
import { isMuted, setMuted, sndBuy, sndCash, sndError, sndRoll, sndWin } from '../sound';
import { BOARD, COLOR_HEX, TOKENS } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';

export function PlayScreen() {
  const { code = '' } = useParams();
  const [sp] = useSearchParams();
  const { room, setRoom, playerId, setPlayerId, controlKey } = useGame();
  const [rolling, setRolling] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'props' | 'log' | 'trade' | 'switch'>('props');
  const [mutedUi, setMutedUi] = useState(isMuted());
  const prevCash = useRef<number | null>(null);
  const wonRef = useRef(false);
  const sockRef = useRef<Socket | null>(null);
  const [sockState, setSockState] = useState<Socket | null>(null);

  const upCode = code.toUpperCase();
  // State (freshly switched seats) wins over the URL, which goes stale after a switch.
  const pid = playerId || sp.get('pid') || localStorage.getItem('monopoly.pid') || '';
  const key = controlKey || loadControl(pid);

  useEffect(() => {
    const s = freshSocket();
    sockRef.current = s;
    setSockState(s);
    let alive = true;
    if (pid) {
      s.emit('rejoin', { code: upCode, playerId: pid, key: controlKey || loadControl(pid) }, (res: { ok: boolean; error?: string; room: never }) => {
        if (!alive) return;
        if (res?.ok) { setRoom(res.room as never); setPlayerId(pid); localStorage.setItem('monopoly.pid', pid); }
        else if (res?.error === 'NO_CONTROL') setErr('🔀 This device no longer controls that seat — reclaim it in 🔀 Switch with the TV PIN.');
        else setErr('Session expired — rejoin from home with your code.');
      });
    } else {
      s.emit('watchRoom', { code: upCode }, (res: { ok: boolean; room: never }) => {
        if (!alive) return;
        if (res?.ok) setRoom(res.room as never);
      });
      setErr('No player session on this phone. Join from home first.');
    }
    s.on('roomState', (r) => { if (!alive) return; setRoom(r); setRolling(false); });
    s.on('evicted', () => {
      if (!alive) return;
      setErr('🔀 Another device took over this seat. Reclaim it in 🔀 Switch with the TV PIN.');
      setTab('switch');
    });
    return () => { alive = false; s.disconnect(); sockRef.current = null; setSockState(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upCode, pid]);

  const me = mePlayer(room, pid || playerId);
  const isMyTurn = !!room && !!me && room.status === 'playing' && !me.bankrupt && room.players[room.turnIndex % room.players.length]?.id === me.id;

  useEffect(() => {
    if (isMyTurn && navigator.vibrate) { try { navigator.vibrate(60); } catch { /* noop */ } }
  }, [isMyTurn]);

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

  function emit(ev: string, extra: Record<string, unknown> = {}, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void) {
    const s = sockRef.current;
    if (!s) return;
    setErr('');
    const timer = setTimeout(() => setErr('Server not responding — check connection'), 8000);
    s.emit(ev, { code: upCode, playerId: pid, key, ...extra }, (res: { ok: boolean; error?: string; controlKey?: string }) => {
      clearTimeout(timer);
      if (!res?.ok) { setErr(friendlyError(res?.error)); sndError(); }
      else onOk?.(res);
    });
  }
  const hasControl = !!key;

  if (!room || room.code !== upCode) return <div className="p-8 text-center text-white/60">Connecting to {upCode}…<br /><Link className="underline" to="/">← home</Link></div>;
  if (!me) return <div className="mx-auto max-w-md p-8 text-center"><div className="text-rose-200">{err || 'Not seated in this room.'}</div><Link to="/" className="mt-4 inline-block rounded-xl bg-white/10 px-4 py-2">Join with code {upCode}</Link></div>;

  const myTile = BOARD[me.position];
  const pending = room.pendingBuy != null ? { i: room.pendingBuy, t: BOARD[room.pendingBuy] } : null;
  const pendingPrice = pending && (pending.t.kind === 'property' || pending.t.kind === 'railroad' || pending.t.kind === 'utility') ? pending.t.price : 0;
  const pendingName = pending ? pending.t.name : '';
  const canBuy = !!(isMyTurn && pending && me.cash >= pendingPrice && pendingPrice > 0);
  const incomingCount = room.trades.filter((t) => t.toId === me.id).length;

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
      <AnimatePresence>
        {room.status === 'lobby' && <Banner key="lobby" text="⏳ Waiting for host to start… show this screen is ready!" />}
        {room.status === 'finished' && (
          <Banner key="win" gold text={room.winnerId === me.id ? '🏆 YOU WIN! 🎉' : `🏁 ${room.players.find((p) => p.id === room.winnerId)?.name} wins`} />
        )}
        {room.status === 'playing' && isMyTurn && <Banner key="turn" gold text="👉 YOUR TURN — roll the dice!" />}
        {room.status === 'playing' && isMyTurn && (
          <div className="mt-1 text-center"><TurnCountdown deadline={room.turnDeadline} className="rounded-full bg-amber-300/20 px-3 py-1 font-mono text-sm text-amber-200" /></div>
        )}
        {room.status === 'playing' && !isMyTurn && (
          <Banner key="wait" text={`⏳ ${room.players[room.turnIndex % room.players.length]?.name}'s turn — watch the TV`} />
        )}
        {room.status === 'paused' && (
          <Banner key="paused" text="⏸ Paused by host — hang tight, nothing moves until resume" />
        )}
      </AnimatePresence>

      {room.lastRoll && <div className="mt-2 text-center text-sm text-amber-200">🎲 {room.lastRoll}</div>}
      <div className="mt-2 flex justify-center"><DicePair d1={room.dice[0]} d2={room.dice[1]} rollKey={room.lastRoll} size={48} /></div>
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

      {/* actions */}
      {room.status === 'playing' && !me.bankrupt && (
        <div className="mt-3 space-y-2">
          {room.auction && <AuctionCard room={room} me={me} emit={emit} />}
          {isMyTurn && !me.hasRolled && (
            <motion.button whileTap={{ scale: 0.97 }} disabled={rolling}
              onClick={() => { sndRoll(); setRolling(true); emit('rollDice'); setTimeout(() => setRolling(false), 4000); }}
              className="btn-gold w-full rounded-2xl py-5 text-2xl disabled:opacity-60">
              {rolling ? '🎲 Rolling…' : '🎲 ROLL DICE'}
            </motion.button>
          )}
          {pending && isMyTurn && (
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
          {isMyTurn && me.hasRolled && room.pendingBuy == null && (
            <button onClick={() => emit('endTurn')} className="w-full rounded-2xl bg-sky-300 py-4 text-xl font-extrabold text-sky-950">End turn ➡️</button>
          )}
          {me.inJail && (
            <button onClick={() => emit('payJail')} className="w-full rounded-2xl bg-orange-300 py-3 font-extrabold text-orange-950">🔓 Pay $50 to leave jail</button>
          )}
          {me.inJail && me.jailCards > 0 && (
            <button onClick={() => emit('useJailCard')} className="w-full rounded-2xl bg-emerald-300 py-3 font-extrabold text-emerald-950">🃏 Use Get-Out-of-Jail-Free ({me.jailCards})</button>
          )}
          {me.cash < 0 && (
            <button onClick={() => { if (window.confirm('Declare bankruptcy and leave the game?')) emit('bankrupt'); }}
              className="w-full rounded-2xl bg-rose-500 py-3 font-extrabold">💀 Declare bankruptcy (${me.cash})</button>
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
          className={`flex-1 rounded-xl py-2 text-sm font-bold ${tab === 'trade' ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
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
        <div className="mt-2 space-y-2">
          {me.properties.length === 0 && <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">No deeds yet — land on streets and hit BUY.</div>}
          {me.properties.map((i) => {
            const t = BOARD[i];
            const price = t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility' ? t.price : 0;
            const color = t.kind === 'property' ? COLOR_HEX[t.color] : '#666';
            const level = room.buildings[i] ?? 0;
            const rentNow = t.kind === 'property' ? t.rent[Math.min(level, 5)] : '—';
            const mort = me.mortgaged.includes(i);
            const set = fullSetOf(i);
            const isFull = set.length > 0 && set.every((x) => me.properties.includes(x));
            const houseCost = t.kind === 'property' ? t.houseCost : 0;
            return (
              <div key={i} className="glass rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="h-8 w-2 rounded" style={{ background: color }} />
                  <div className="flex-1"><div className="font-bold">{t.name} {mort ? '(mortgaged)' : ''}</div>
                    <div className="text-xs text-white/60">${price} · rent ${rentNow}{level > 0 && <span className="ml-1">{level === 5 ? '🏨' : '🏠'.repeat(level)}</span>}</div></div>
                  <button onClick={() => emit('mortgage', { tile: i })} className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold">
                    {mort ? 'Unmortgage' : `Mortgage +$${Math.round(price / 2)}`}</button>
                </div>
                {t.kind === 'property' && !mort && (
                  <div className="mt-2 flex items-center gap-2">
                    {isFull && level < 5 && (
                      <button onClick={() => emit('buyHouse', { tile: i })}
                        className="flex-1 rounded-xl bg-emerald-300/90 px-2 py-1.5 text-xs font-extrabold text-emerald-950">
                        {level === 4 ? `🏨 Hotel $${houseCost}` : `🏠 House $${houseCost}`}</button>
                    )}
                    {level > 0 && (
                      <button onClick={() => emit('sellHouse', { tile: i })}
                        className="flex-1 rounded-xl bg-white/15 px-2 py-1.5 text-xs font-bold">Sell +${Math.floor(houseCost / 2)}</button>
                    )}
                    {!isFull && <div className="text-xs text-white/40">Full set unlocks houses</div>}
                  </div>
                )}
              </div>
            );
          })}
          <div className="glass rounded-2xl p-3 text-sm">
            <div className="font-bold">👥 Players</div>
            {room.players.map((p) => (
              <div key={p.id} className="flex justify-between py-0.5 text-white/75">
                <span>{TOKENS[p.token]} {p.name} {p.bankrupt ? '💀' : ''} {!p.connected ? '(📴)' : ''}</span>
                <span className="font-mono">${p.cash} · {p.properties.length} deeds</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {room.log.slice(0, 30).map((l) => (
            <div key={l.id} className="rounded-xl bg-black/25 px-3 py-1.5 text-sm text-white/80">{l.text}</div>
          ))}
        </div>
      )}

      <Link to={`/host/${upCode}`} className="fixed bottom-3 left-3 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur">📺 TV view</Link>
      <Link to="/" className="fixed bottom-3 right-3 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur">🏠 Home</Link>
    </div>
  );
}

function fullSetOf(tileIdx: number): number[] {
  const t = BOARD[tileIdx];
  if (!t || t.kind !== 'property') return [];
  return BOARD.map((x, i) => ({ x, i }))
    .filter(({ x }) => x.kind === 'property' && x.color === t.color)
    .map(({ i }) => i);
}

function friendlyError(code?: string): string {
  switch (code) {
    case 'NOT_YOUR_TURN': return 'Wait for your turn';
    case 'ALREADY_ROLLED': return 'You already rolled — end your turn';
    case 'ROLL_FIRST': return 'Roll first!';
    case 'NEGATIVE': return 'You are broke — mortgage or go bankrupt first';
    case 'NO_CASH': return 'Not enough cash';
    case 'STALE_OFFER': return 'That property is no longer available';
    case 'ALREADY_OWNED': return 'Already owned';
    case 'NOTHING_TO_PASS': return 'Nothing to pass';
    case 'BAD_TRADE': return 'Invalid trade — check deeds and cash';
    case 'NO_OFFER': return 'Offer expired or gone';
    case 'EXPIRED': return 'Offer expired';
    case 'TILE_LOCKED': return 'A property is locked in another offer';
    case 'NOT_YOUR_OFFER': return 'That offer is not yours to answer';
    case 'NO_AUCTION': return 'Auction already ended';
    case 'BID_TOO_LOW': return 'Bid higher than the top bid (min $10)';
    case 'HAS_HOUSES': return 'Sell houses first';
    case 'NOT_FULL_SET': return 'You need the full color set';
    case 'MAX_HOUSES': return 'Already a hotel here';
    case 'EVEN_BUILD': return 'Build evenly across the set';
    case 'MORTGAGED': return 'Unmortgage the set first';
    case 'NO_CARD': return 'No Get-Out-of-Jail-Free card — draw one from Chance/Chest';
    case 'BAD_PIN': return 'Wrong seat PIN — check the TV board';
    case 'NO_CONTROL': return 'This device no longer controls that seat — reclaim it in 🔀 Switch';
    case 'NOT_HOST': return 'Only the host device can do that';
    case 'BAD_SEAT': return 'That seat is unavailable';
    default: return code || 'Action failed';
  }
}

function AuctionCard({ room, me, emit }: { room: RoomState; me: Player; emit: (ev: string, extra?: Record<string, unknown>, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void) => void }) {
  const [amount, setAmount] = useState('');
  const a = room.auction!;
  const top = [...a.bids].sort((x, y) => y.amount - x.amount)[0];
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? '?';
  const minNext = Math.max(10, top ? top.amount + 1 : 10);
  function bid(v: number) {
    emit('auctionBid', { amount: v });
    setAmount('');
  }
  return (
    <div className="glass rounded-2xl border-amber-300/50 p-3 text-center">
      <div className="font-bold">🔨 Auction: {BOARD[a.tile]?.name}</div>
      <div className="text-sm text-white/70">{top ? <>Top: <b className="text-emerald-300">${top.amount}</b> ({nameOf(top.playerId)})</> : 'No bids yet — min $10'}</div>
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
      <div className="mt-1 text-xs text-white/50">Your cash: ${me.cash} · ends automatically</div>
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
