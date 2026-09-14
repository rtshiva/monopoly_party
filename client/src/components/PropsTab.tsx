import { BOARD, COLOR_HEX, TOKENS, fullSetOf, tilePrice } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { TileArt } from './TileArt';
import type { ClaimEmit } from './ClaimPanel';

interface Props {
  room: RoomState;
  me: Player;
  emit: ClaimEmit;
}

/** Phone properties tab: portfolio strip, per-deed mortgage/build/sell, roster. */
export function PropsTab({ room, me, emit }: Props) {
  // Deed portfolio value: prices + houses/hotel investment.
  const totalVal = me.properties.reduce((s, i) => {
    const t = BOARD[i];
    return s + tilePrice(i) + (room.buildings[i] ?? 0) * (t.kind === 'property' ? t.houseCost : 0);
  }, 0);
  return (
    <>
      {me.properties.length > 0 && (
        <div className="glass mt-2 rounded-2xl p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">🏠 Your Properties ({me.properties.length})</span>
            <span className="text-xs text-white/60">Total Value: <b className="font-mono text-emerald-300">${totalVal}</b></span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {me.properties.map((i) => (
              <div key={i} className="flex shrink-0 items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
                <TileArt tile={i} size={34} />
                <div className="text-xs"><div className="font-bold">{BOARD[i].name}</div>
                  <div className="font-mono text-emerald-300">${tilePrice(i)}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 space-y-2">
      {me.properties.length === 0 && <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">No deeds yet — land on streets and hit BUY.</div>}
      {me.properties.map((i) => {
        const t = BOARD[i];
        const price = t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility' ? t.price : 0;
        const color = t.kind === 'property' ? COLOR_HEX[t.color] : '#666';
        const level = room.buildings[i] ?? 0;
        const mort = me.mortgaged.includes(i);
        const set = fullSetOf(i);
        const isFull = set.length > 0 && set.every((x) => me.properties.includes(x));
        // Mirror the server rule (rentFor): unmortgaged full set at level 0
        // charges double base; mortgaged deeds collect nothing.
        const bonus = t.kind === 'property' && isFull && !mort && set.every((x) => !me.mortgaged.includes(x));
        const rentNow = t.kind === 'property' ? (mort ? '—' : level > 0 ? t.rent[Math.min(Math.floor(level) + 1, 6)] : bonus ? t.rent[0] * 2 : t.rent[0]) : '—';
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
                {isFull && set.some((x) => (room.buildings[x] ?? 0) > 0) && (
                  <button onClick={() => emit('sellAllHouses', { tile: i })}
                    className="flex-1 rounded-xl bg-amber-300/20 px-2 py-1.5 text-xs font-bold text-amber-200">Sell all in set</button>
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
            <span>{TOKENS[p.token]} {p.name}{p.isBot ? ' 🤖' : ''} {p.bankrupt ? '💀' : ''} {!p.connected ? '(📴)' : ''}</span>
            <span className="font-mono">${p.cash} · {p.properties.length} deeds</span>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
