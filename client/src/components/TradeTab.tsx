import { useState } from 'react';
import { BOARD, TOKENS } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';

interface Props {
  room: RoomState;
  me: Player;
  emit: (ev: string, extra?: Record<string, unknown>) => void;
}

export function TradeTab({ room, me, emit }: Props) {
  const others = room.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const [toId, setToId] = useState('');
  const to = others.find((p) => p.id === toId) ?? others[0] ?? null;
  const [give, setGive] = useState<number[]>([]);
  const [want, setWant] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState('0');
  const [wantCash, setWantCash] = useState('0');

  const incoming = room.trades.filter((t) => t.toId === me.id);
  const outgoing = room.trades.filter((t) => t.fromId === me.id);
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? '?';
  const tileName = (i: number) => BOARD[i]?.name ?? `#${i}`;
  const toggle = (list: number[], set: (n: number[]) => void, t: number) =>
    set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  const secsLeft = (exp: number) => Math.max(0, Math.round((exp - Date.now()) / 1000));

  function send() {
    if (!to) return;
    emit('tradeOffer', {
      to: to.id,
      giveTiles: give,
      giveCash: Math.max(0, Math.floor(Number(giveCash) || 0)),
      wantTiles: want,
      wantCash: Math.max(0, Math.floor(Number(wantCash) || 0)),
    });
    setGive([]); setWant([]); setGiveCash('0'); setWantCash('0');
  }

  return (
    <div className="mt-2 space-y-3">
      {incoming.length > 0 && (
        <div className="space-y-2">
          {incoming.map((t) => (
            <div key={t.id} className="glass rounded-2xl border-amber-300/50 p-3">
              <div className="font-bold">🤝 {nameOf(t.fromId)} offers you <span className="text-xs text-white/50">({secsLeft(t.expiresAt)}s left)</span></div>
              <div className="mt-1 text-sm">Gives: <b>{t.giveTiles.map(tileName).join(', ') || '—'}</b>{t.giveCash > 0 && <b> + ${t.giveCash}</b>}</div>
              <div className="text-sm">Wants: <b>{t.wantTiles.map(tileName).join(', ') || '—'}</b>{t.wantCash > 0 && <b> + ${t.wantCash}</b>}</div>
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
                {t.giveCash > 0 && ` + $${t.giveCash}`} for {t.wantTiles.map(tileName).join(', ') || '—'}
                {t.wantCash > 0 && ` + $${t.wantCash}`} <span className="text-white/50">({secsLeft(t.expiresAt)}s)</span></div>
              <button onClick={() => emit('tradeCancel', { tradeId: t.id })}
                className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold">Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-2xl p-3">
        <div className="font-bold">✏️ New offer</div>
        {others.length === 0 && <div className="mt-1 text-sm text-white/50">No one to trade with yet.</div>}
        {others.length > 0 && to && (
          <>
            <label className="mt-2 block text-sm">Trade with
              <select value={to.id} onChange={(e) => { setToId(e.target.value); setWant([]); }}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 outline-none">
                {others.map((p) => (
                  <option key={p.id} value={p.id}>{TOKENS[p.token]} {p.name} (${p.cash})</option>
                ))}
              </select>
            </label>
            <div className="mt-2 text-sm font-bold">You give (your deeds):</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {me.properties.length === 0 && <span className="text-xs text-white/50">No deeds</span>}
              {me.properties.map((i) => (
                <button key={i} type="button" onClick={() => toggle(give, setGive, i)}
                  className={`rounded-lg px-2 py-1 text-xs font-bold ${give.includes(i) ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
                  {tileName(i)}</button>
              ))}
            </div>
            <label className="mt-2 block text-sm">+ cash you pay: $
              <input value={giveCash} onChange={(e) => setGiveCash(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric" className="mt-1 w-32 rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 font-mono outline-none" />
            </label>
            <div className="mt-2 text-sm font-bold">You want ({to.name}'s deeds):</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {to.properties.length === 0 && <span className="text-xs text-white/50">They own nothing</span>}
              {to.properties.map((i) => (
                <button key={i} type="button" onClick={() => toggle(want, setWant, i)}
                  className={`rounded-lg px-2 py-1 text-xs font-bold ${want.includes(i) ? 'bg-sky-300 text-sky-950' : 'bg-white/10'}`}>
                  {tileName(i)}</button>
              ))}
            </div>
            <label className="mt-2 block text-sm">+ cash you ask: $
              <input value={wantCash} onChange={(e) => setWantCash(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric" className="mt-1 w-32 rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 font-mono outline-none" />
            </label>
            <button onClick={send}
              disabled={(give.length === 0 && want.length === 0 && (Number(giveCash) || 0) === 0 && (Number(wantCash) || 0) === 0)}
              className="mt-3 w-full rounded-xl bg-amber-300 py-3 font-extrabold text-black disabled:opacity-40">
              Send offer to {to.name} 🤝</button>
          </>
        )}
      </div>
    </div>
  );
}
