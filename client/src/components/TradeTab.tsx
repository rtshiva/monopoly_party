import { useEffect, useState } from 'react';
import { BOARD, TOKENS, tilePrice } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import type { ClaimEmit } from './ClaimPanel';
import { TileArt } from './TileArt';

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

  function deedChips(mine: number[], selected: number[], toggleFn: (t: number) => void) {
    if (mine.length === 0) return <div className="py-1 text-xs text-white/50">No deeds</div>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {mine.map((i) => {
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
          return (
            <button key={i} type="button" disabled={blocked && !on} onClick={() => toggleFn(i)} title={setBuilt ? 'Sell all houses in this set first' : locked ? 'In another open offer' : tileName(i)}
              className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1 text-xs font-bold ${on ? 'border-amber-300 bg-amber-300/20' : 'border-white/10 bg-white/5'} ${blocked && !on ? 'opacity-40' : ''}`}>
              <TileArt tile={i} size={26} />
              <span>{tileName(i)}{setBuilt ? ' 🏠🔒' : ''}<br /><span className="font-mono text-emerald-300">${tilePrice(i)}</span></span>
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
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => emit('tradeRespond', { tradeId: t.id, accept: true })}
                  className="rounded-xl bg-emerald-300 py-2 font-extrabold text-emerald-950">Accept</button>
                <button onClick={() => emit('tradeRespond', { tradeId: t.id, accept: false })}
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
                <div className="mt-1">{deedChips(me.properties, give, (t) => toggle(give, setGive, t))}</div>
                <div className="mt-2 text-xs font-bold text-white/60">Cash</div>
                <div className="mt-1">{cashStepper(giveCash, setGiveCash)}</div>
                <div className="mt-2">{stepper('🃏 Cards', me.jailCards, giveCards, setGiveCards)}</div>
              </div>
              <div className="rounded-2xl border border-sky-300/30 bg-sky-300/5 p-2">
                <div className="mb-1 text-sm font-bold text-sky-300">📥 You Get</div>
                <div className="text-xs font-bold text-white/60">Properties</div>
                <div className="mt-1">{deedChips(to.properties, want, (t) => toggle(want, setWant, t))}</div>
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
                <div className={`mt-2 rounded-xl px-3 py-2 text-center font-bold ${fair ? 'bg-emerald-300/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>
                  {fair ? 'This looks like a fair trade!' : `Off by $${Math.abs(diff)} — consider adjusting.`}
                  <div className="text-xs font-normal opacity-80">
                    Value difference: ${Math.abs(diff)} {diff !== 0 && (diff < 0 ? '(in your favor)' : '(in their favor)')} · 🃏 cards carry no face value
                  </div>
                </div>
              </div>
            )}

            <button onClick={send} disabled={!hasOffer}
              className="mt-3 w-full rounded-xl bg-amber-300 py-3 font-extrabold text-black disabled:opacity-40">
              Send offer to {to.name} 🤝</button>
          </>
        )}
      </div>
    </div>
  );
}
