import { useEffect, useState } from 'react';
import { BOARD, TOKENS, tilePrice } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import type { ClaimEmit } from './ClaimPanel';
import { TileArt } from './TileArt';
import { getSetProgress } from './propsHelper';
import { haptic } from '../haptics';

interface Props {
  room: RoomState;
  me: Player;
  emit: ClaimEmit;
}

const MAX_CASH = 100000; // mirrors server MAX_TRADE_CASH

export function TradeTab({ room, me, emit }: Props) {
  // Bots don't negotiate — offers to/from them are rejected server-side.
  const others = room.players.filter((p) => p.id !== me.id && !p.bankrupt && !p.isBot);
  const [toId, setToId] = useState('');
  const to = others.find((p) => p.id === toId) ?? others[0] ?? null;
  const [give, setGive] = useState<number[]>([]);
  const [want, setWant] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [wantCash, setWantCash] = useState(0);
  const [giveCards, setGiveCards] = useState(0);
  const [wantCards, setWantCards] = useState(0);

  const incoming = room.trades.filter((t) => t.toId === me.id);
  const outgoing = room.trades.filter((t) => t.fromId === me.id);
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? '?';
  const tileName = (i: number) => BOARD[i]?.name ?? `#${i}`;
  const toggle = (list: number[], set: (n: number[]) => void, t: number) =>
    set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  const secsLeft = (exp: number) => Math.max(0, Math.round((exp - Date.now()) / 1000));

  // Re-render every second so the offer expiry countdowns tick down live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  function resetForm() {
    setGive([]); setWant([]); setGiveCash(0); setWantCash(0); setGiveCards(0); setWantCards(0);
  }

  function send() {
    if (!to) return;
    // Reset the draft only once the server accepts: a reject (stale cash,
    // locked tile, …) keeps the form intact instead of wiping the user's work.
    emit('tradeOffer', {
      to: to.id,
      giveTiles: give,
      giveCash,
      giveCards,
      wantTiles: want,
      wantCash,
      wantCards,
    }, (res) => { if (res?.ok) resetForm(); });
  }

  // Fairness meter (client-side estimate from deed prices + cash; jail-free
  // cards have no face value and are excluded — noted under the verdict).
  const giveVal = give.reduce((s, t) => s + tilePrice(t), 0) + giveCash;
  const getVal = want.reduce((s, t) => s + tilePrice(t), 0) + wantCash;
  const diff = giveVal - getVal;
  const fairTol = Math.max(50, Math.round(Math.max(giveVal, getVal) * 0.1));
  const hasOffer = give.length > 0 || want.length > 0 || giveCash > 0 || wantCash > 0 || giveCards > 0 || wantCards > 0;
  const fair = Math.abs(diff) <= fairTol;

  function stepper(label: string, mine: number, value: number, set: (n: number) => void) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="flex-1">{label} <span className="text-white/50">(you hold {mine} 🃏)</span></span>
        <button type="button" onClick={() => set(Math.max(0, value - 1))} className="rounded-lg bg-white/10 px-2 py-1 font-bold">−</button>
        <span className="w-6 text-center font-mono font-bold">{value}</span>
        <button type="button" onClick={() => set(Math.min(mine, 20, value + 1))} className="rounded-lg bg-white/10 px-2 py-1 font-bold">+</button>
      </div>
    );
  }

  function cashStepper(value: number, set: (n: number) => void) {
    const step = (d: number) => set(Math.min(MAX_CASH, Math.max(0, value + d)));
    return (
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => step(-10)} className="flex-1 rounded-lg bg-white/10 py-1.5 font-bold">−</button>
        <span className="min-w-16 flex-1 text-center font-mono font-bold">${value}</span>
        <button type="button" onClick={() => step(10)} className="flex-1 rounded-lg bg-white/10 py-1.5 font-bold">+</button>
        <button type="button" onClick={() => step(100)} className="rounded-lg bg-white/10 px-2 py-1.5 text-xs font-bold">+100</button>
      </div>
    );
  }

  function deedChips(tiles: number[], selected: number[], toggleFn: (t: number) => void, forPlayer: Player) {
    if (tiles.length === 0) return <div className="py-1 text-xs text-white/50">No deeds</div>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {tiles.map((i) => {
          const on = selected.includes(i);
          const locked = room.trades.some((t) => t.giveTiles.includes(i) || t.wantTiles.includes(i));
          // Strict set rule (mirrors server setHasBuildings): any building
          // anywhere in the color set locks every deed in that set.
          const t = BOARD[i];
          const set = t?.kind === 'property'
            ? BOARD.map((x, idx) => ({ x, idx })).filter(({ x }) => x.kind === 'property' && x.color === t.color).map(({ idx }) => idx)
            : [];
          const setBuilt = set.some((s) => (room.buildings[s] ?? 0) > 0);
          const blocked = (locked && !on) || setBuilt;

          const progress = getSetProgress(i, room, me);
          const isMyChip = forPlayer.id === me.id;
          let badge: { text: string; cls: string } | null = null;
          if (progress.total > 1) {
            if (isMyChip) {
              if (progress.isComplete) {
                badge = { text: '⚠️ Breaks Set', cls: 'bg-rose-500/25 text-rose-200 border-rose-500/40' };
              } else if (progress.owned > 1) {
                badge = { text: `${progress.owned}/${progress.total}`, cls: 'bg-white/10 text-white/70 border-white/20' };
              }
            } else {
              // What I would receive from them:
              if (progress.owned + 1 === progress.total) {
                badge = { text: '⭐ Completes Set!', cls: 'bg-emerald-400/25 text-emerald-200 border-emerald-400/40' };
              } else if (progress.owned > 0) {
                badge = { text: `Set ${progress.owned + 1}/${progress.total}`, cls: 'bg-amber-300/25 text-amber-200 border-amber-300/40' };
              }
            }
          }

          return (
            <button key={i} type="button" disabled={blocked && !on} onClick={() => toggleFn(i)} title={setBuilt ? 'Sell all houses in this set first' : locked ? 'In another open offer' : tileName(i)}
              className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1 text-xs font-bold ${on ? 'border-amber-300 bg-amber-300/20' : 'border-white/10 bg-white/5'} ${blocked && !on ? 'opacity-40' : ''}`}>
              <TileArt tile={i} size={26} />
              <div className="text-left">
                <div className="flex items-center gap-1">
                  <span>{tileName(i)}{setBuilt ? ' 🏠🔒' : ''}</span>
                  {badge && (
                    <span className={`rounded px-1 py-0.2 text-[9px] font-bold border ${badge.cls}`}>
                      {badge.text}
                    </span>
                  )}
                </div>
                <span className="font-mono text-emerald-300">${tilePrice(i)}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {incoming.length > 0 && (
        <div className="space-y-2">
          {incoming.map((t) => (
            <div key={t.id} className="glass rounded-2xl border-amber-300/50 p-3">
              <div className="font-bold">🤝 {nameOf(t.fromId)} offers you <span className="text-xs text-white/50">({secsLeft(t.expiresAt)}s left)</span></div>
              <div className="mt-1 text-sm">Gives: <b>{t.giveTiles.map(tileName).join(', ') || '—'}</b>{t.giveCash > 0 && <b> + ${t.giveCash}</b>}{t.giveCards > 0 && <b> + 🃏×{t.giveCards}</b>}</div>
              <div className="text-sm">Wants: <b>{t.wantTiles.map(tileName).join(', ') || '—'}</b>{t.wantCash > 0 && <b> + ${t.wantCash}</b>}{t.wantCards > 0 && <b> + 🃏×{t.wantCards}</b>}</div>
              {(() => {
                const incGive = t.wantTiles.reduce((s, x) => s + tilePrice(x), 0) + t.wantCash;
                const incGet = t.giveTiles.reduce((s, x) => s + tilePrice(x), 0) + t.giveCash;
                const incTol = Math.max(50, Math.round(Math.max(incGive, incGet) * 0.1));
                return <FairnessBar giveVal={incGive} getVal={incGet} fairTol={incTol} />;
              })()}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => { haptic([30, 50, 30]); emit('tradeRespond', { tradeId: t.id, accept: true }); }}
                  className="rounded-xl bg-emerald-300 py-2 font-extrabold text-emerald-950">Accept</button>
                <button onClick={() => { haptic(25); emit('tradeRespond', { tradeId: t.id, accept: false }); }}
                  className="rounded-xl bg-white/15 py-2 font-bold">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="space-y-2">
          {outgoing.map((t) => (
            <div key={t.id} className="glass flex items-center gap-2 rounded-2xl p-3 text-sm">
              <div className="flex-1">⏳ To <b>{nameOf(t.toId)}</b>: {t.giveTiles.map(tileName).join(', ') || '—'}
                {t.giveCash > 0 && ` + $${t.giveCash}`}{t.giveCards > 0 && ` + 🃏×${t.giveCards}`} for {t.wantTiles.map(tileName).join(', ') || '—'}
                {t.wantCash > 0 && ` + $${t.wantCash}`}{t.wantCards > 0 && ` + 🃏×${t.wantCards}`} <span className="text-white/50">({secsLeft(t.expiresAt)}s)</span></div>
              <button onClick={() => emit('tradeCancel', { tradeId: t.id })}
                className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold">Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-2xl p-3">
        <div className="font-display font-bold">🤝 New offer {to && <>to <b>{to.name}</b></>}</div>
        {others.length === 0 && <div className="mt-1 text-sm text-white/50">No one to trade with yet.</div>}
        {others.length > 0 && to && (
          <>
            <label className="mt-2 block text-sm">Trade with
              <select value={to.id} onChange={(e) => { setToId(e.target.value); setWant([]); setWantCards(0); }}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 outline-none">
                {others.map((p) => (
                  <option key={p.id} value={p.id}>{TOKENS[p.token]} {p.name} (${p.cash})</option>
                ))}
              </select>
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-2">
                <div className="mb-1 text-sm font-bold text-emerald-300">📤 You Give</div>
                <div className="text-xs font-bold text-white/60">Properties</div>
                <div className="mt-1">{deedChips(me.properties, give, (t) => toggle(give, setGive, t), me)}</div>
                <div className="mt-2 text-xs font-bold text-white/60">Cash</div>
                <div className="mt-1">{cashStepper(giveCash, setGiveCash)}</div>
                <div className="mt-2">{stepper('🃏 Cards', me.jailCards, giveCards, setGiveCards)}</div>
              </div>
              <div className="rounded-2xl border border-sky-300/30 bg-sky-300/5 p-2">
                <div className="mb-1 text-sm font-bold text-sky-300">📥 You Get</div>
                <div className="text-xs font-bold text-white/60">Properties</div>
                <div className="mt-1">{deedChips(to.properties, want, (t) => toggle(want, setWant, t), to)}</div>
                <div className="mt-2 text-xs font-bold text-white/60">Cash</div>
                <div className="mt-1">{cashStepper(wantCash, setWantCash)}</div>
                <div className="mt-2">{stepper('🃏 Cards', to.jailCards, wantCards, setWantCards)}</div>
              </div>
            </div>

            {hasOffer && (
              <div className="mt-2 rounded-2xl bg-black/25 p-3 text-sm">
                <div className="font-bold">⚖️ Offer Summary</div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>You give<b className="font-mono"> ${giveVal}</b>
                    {give.map((t) => <div key={t} className="text-xs text-white/60">• {tileName(t)} (${tilePrice(t)})</div>)}
                    {giveCash > 0 && <div className="text-xs text-white/60">• ${giveCash} cash</div>}
                  </div>
                  <div>You get<b className="font-mono"> ${getVal}</b>
                    {want.map((t) => <div key={t} className="text-xs text-white/60">• {tileName(t)} (${tilePrice(t)})</div>)}
                    {wantCash > 0 && <div className="text-xs text-white/60">• ${wantCash} cash</div>}
                  </div>
                </div>
                <FairnessBar giveVal={giveVal} getVal={getVal} fairTol={fairTol} />
              </div>
            )}

            <button onClick={() => { haptic(30); send(); }} disabled={!hasOffer}
              className="mt-3 w-full rounded-xl bg-amber-300 py-3 font-extrabold text-black disabled:opacity-40">
              Send offer to {to.name} 🤝</button>
          </>
        )}
      </div>
    </div>
  );
}

function FairnessBar({ giveVal, getVal, fairTol }: { giveVal: number; getVal: number; fairTol: number }) {
  const total = giveVal + getVal;
  if (total === 0) return null;
  const givePct = Math.min(95, Math.max(5, Math.round((giveVal / total) * 100)));
  const diff = giveVal - getVal;
  const absDiff = Math.abs(diff);
  const fair = absDiff <= fairTol;
  const favor = diff < 0 ? 'In your favor' : diff > 0 ? 'In their favor' : 'Even trade';

  let statusBg = 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30';
  let barColor = 'bg-emerald-400';
  if (!fair) {
    if (absDiff > fairTol * 2) {
      statusBg = 'bg-rose-500/20 text-rose-200 border-rose-500/30';
      barColor = 'bg-rose-400';
    } else {
      statusBg = 'bg-amber-400/15 text-amber-200 border-amber-400/30';
      barColor = 'bg-amber-400';
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {/* Visual balance bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10 border border-white/10">
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white/40 z-10" />
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${givePct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-white/60">
        <span>Give: <b className="font-mono text-white/80">${giveVal}</b> ({givePct}%)</span>
        <span className="font-semibold text-white/80">{fair ? '⚖️ Balanced' : favor}</span>
        <span>Get: <b className="font-mono text-white/80">${getVal}</b> ({100 - givePct}%)</span>
      </div>
      <div className={`rounded-xl border px-3 py-1.5 text-center text-xs font-bold ${statusBg}`}>
        {fair ? '✅ Fair trade' : `⚠️ Skewed by $${absDiff} (${favor})`}
        <div className="text-[10px] font-normal opacity-80">
          Deed face values + cash · 🃏 cards carry no fixed value
        </div>
      </div>
    </div>
  );
}
