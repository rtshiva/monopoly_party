import { useState } from 'react';
import { BOARD, COLOR_HEX, DEFAULT_BOARD_STYLE, TOKENS, fullSetOf, tilePrice } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { TileArt } from './TileArt';
import type { ClaimEmit } from './ClaimPanel';
import { useDiscoveredThemes } from '../useThemes';
import { themeFor, type TileArtKey } from './boardThemes';
import { getSetProgress } from './propsHelper';
import { DeedModal } from './DeedModal';

interface Props {
  room: RoomState;
  me: Player;
  emit: ClaimEmit;
}

/** Phone properties tab: portfolio strip, per-deed mortgage/build/sell, roster. */
export function PropsTab({ room, me, emit }: Props) {
  const [filter, setFilter] = useState<'all' | 'build' | 'mortgaged'>('all');
  const [inspectTile, setInspectTile] = useState<number | null>(null);
  const discovered = useDiscoveredThemes();
  const theme = themeFor(room.boardStyle ?? DEFAULT_BOARD_STYLE, discovered);

  // Deed portfolio value: prices + houses/hotel investment.
  const totalVal = me.properties.reduce((s, i) => {
    const t = BOARD[i];
    return s + tilePrice(i) + (room.buildings[i] ?? 0) * (t.kind === 'property' ? t.houseCost : 0);
  }, 0);

  // Quick filter groups
  const buildable = me.properties.filter((i) => {
    const t = BOARD[i];
    if (t.kind !== 'property' || me.mortgaged.includes(i)) return false;
    const set = fullSetOf(i);
    return set.length > 0 && set.every((x) => me.properties.includes(x)) && (room.buildings[i] ?? 0) < 5;
  });
  const mortgaged = me.properties.filter((i) => me.mortgaged.includes(i));
  const visibleProps = filter === 'build' ? buildable : filter === 'mortgaged' ? mortgaged : me.properties;

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
              <button
                key={i}
                type="button"
                onClick={() => setInspectTile(i)}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5 transition-all hover:bg-white/15 active:scale-95 text-left"
              >
                <TileArt tile={i} size={34} />
                <div className="text-xs">
                  <div className="font-bold">{BOARD[i].name}</div>
                  <div className="font-mono text-emerald-300">${tilePrice(i)}</div>
                </div>
              </button>
            ))}
          </div>
          {(buildable.length > 0 || mortgaged.length > 0) && (
            <div className="mt-3 flex gap-1.5 border-t border-white/10 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`rounded-xl px-2.5 py-1 font-bold transition-colors ${filter === 'all' ? 'bg-amber-300 text-black shadow' : 'bg-white/10 text-white/70 hover:bg-white/15'}`}
              >
                All ({me.properties.length})
              </button>
              {buildable.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter('build')}
                  className={`rounded-xl px-2.5 py-1 font-bold transition-colors ${filter === 'build' ? 'bg-emerald-300 text-emerald-950 shadow' : 'bg-white/10 text-emerald-300 hover:bg-white/15'}`}
                >
                  🔨 Can Build ({buildable.length})
                </button>
              )}
              {mortgaged.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter('mortgaged')}
                  className={`rounded-xl px-2.5 py-1 font-bold transition-colors ${filter === 'mortgaged' ? 'bg-orange-300 text-orange-950 shadow' : 'bg-white/10 text-orange-300 hover:bg-white/15'}`}
                >
                  🏦 Mortgaged ({mortgaged.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 space-y-2">
      {me.properties.length === 0 && <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">No deeds yet — land on streets and hit BUY.</div>}
      {me.properties.length > 0 && visibleProps.length === 0 && (
        <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">
          No properties match this filter. <button type="button" onClick={() => setFilter('all')} className="underline text-amber-300">Show all</button>
        </div>
      )}
      {visibleProps.map((i) => {
        const t = BOARD[i];
        const price = t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility' ? t.price : 0;
        const color = t.kind === 'property' ? COLOR_HEX[t.color] : '#666';
        const level = room.buildings[i] ?? 0;
        const mort = me.mortgaged.includes(i);
        const set = fullSetOf(i);
        const isFull = set.length > 0 && set.every((x) => me.properties.includes(x));
        const bonus = t.kind === 'property' && isFull && !mort && set.every((x) => !me.mortgaged.includes(x));
        const rentNow = t.kind === 'property' ? (mort ? '—' : level > 0 ? t.rent[Math.min(Math.floor(level) + 1, 6)] : bonus ? t.rent[0] * 2 : t.rent[0]) : '—';
        const houseCost = t.kind === 'property' ? t.houseCost : 0;

        const artKey: TileArtKey | undefined = t.kind === 'property'
          ? (t.color !== 'none' ? t.color : undefined)
          : t.kind;
        const artUrl = artKey ? theme.tileArt?.[artKey] : undefined;
        const progress = getSetProgress(i, room, me);

        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-white/15 p-3 shadow-lg"
            style={{
              ...(artUrl
                ? { backgroundImage: `url("${artUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: 'rgba(255, 255, 255, 0.05)' }),
            }}
          >
            {/* Dark glass backdrop overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/80 to-black/85 backdrop-blur-[2px]" />

            <div className="relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-2 rounded-full shadow" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-1.5 truncate">
                    <span>{t.name}</span>
                    {mort && (
                      <span className="rounded bg-rose-500/30 border border-rose-400/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                        MORTGAGED
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/70">
                    ${price} · rent ${rentNow}
                    {level > 0 && (
                      <span className="ml-1.5 font-bold text-amber-200">
                        {level === 5 ? '🏨 Hotel' : `${level} 🏠`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInspectTile(i)}
                    title="Inspect title deed details"
                    className="rounded-xl bg-white/10 px-2 py-1.5 text-xs font-bold text-white/80 hover:bg-white/20 transition-colors"
                  >
                    🔍
                  </button>
                  <button
                    type="button"
                    onClick={() => emit('mortgage', { tile: i })}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                      mort ? 'bg-amber-300 text-black shadow' : 'bg-white/15 text-white hover:bg-white/20'
                    }`}
                  >
                    {mort ? 'Unmortgage' : `Mortgage +$${Math.round(price / 2)}`}
                  </button>
                </div>
              </div>

              {/* Set progress & missing deeds */}
              {progress.total > 1 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {progress.isComplete ? (
                    <span className="rounded-md bg-emerald-400/20 border border-emerald-400/30 px-2 py-0.5 font-bold text-emerald-200">
                      ⭐ Set Complete ({progress.owned}/{progress.total})
                    </span>
                  ) : (
                    <>
                      <span className="rounded-md bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 font-bold text-amber-200">
                        Set: {progress.owned}/{progress.total}
                      </span>
                      <span className="text-white/70 text-[11px]">
                        Need:{' '}
                        {progress.pending.map((p, idx) => (
                          <span key={p.tile}>
                            {idx > 0 && ', '}
                            <span className="font-medium text-white">{p.name}</span>{' '}
                            {p.ownerName ? (
                              <span className="text-amber-300">({p.ownerName})</span>
                            ) : (
                              <span className="text-emerald-300 font-semibold">(Unowned)</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Building controls */}
              {t.kind === 'property' && !mort && (() => {
                const minLevel = isFull ? Math.min(...set.map((x) => room.buildings[x] ?? 0)) : 0;
                const lowestTile = isFull ? set.find((x) => (room.buildings[x] ?? 0) === minLevel) : null;
                const maxLevel = isFull ? Math.max(...set.map((x) => room.buildings[x] ?? 0)) : 0;
                const highestTile = isFull ? set.find((x) => (room.buildings[x] ?? 0) === maxLevel) : null;

                return (
                  <div className="mt-2.5 flex items-center gap-2 border-t border-white/10 pt-2">
                    {isFull && level < 5 && (
                      <button
                        type="button"
                        disabled={me.cash < houseCost}
                        onClick={() => emit('buyHouse', { tile: level === minLevel ? i : (lowestTile ?? i) })}
                        className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-extrabold shadow transition-all ${
                          me.cash >= houseCost
                            ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-95'
                            : 'bg-white/5 text-white/30 cursor-not-allowed'
                        }`}
                      >
                        {level === 4 ? `🏨 Hotel $${houseCost}` : `🏠 House $${houseCost}`}
                        {level > minLevel && lowestTile != null && (
                          <span className="block text-[9px] font-normal opacity-80">
                            (builds on {BOARD[lowestTile]?.name})
                          </span>
                        )}
                      </button>
                    )}
                    {level > 0 && (
                      <button
                        type="button"
                        onClick={() => emit('sellHouse', { tile: level === maxLevel ? i : (highestTile ?? i) })}
                        className="flex-1 rounded-xl bg-white/15 px-2 py-1.5 text-xs font-bold hover:bg-white/20 active:scale-95"
                      >
                        Sell +${Math.floor(houseCost / 2)}
                        {level < maxLevel && highestTile != null && (
                          <span className="block text-[9px] font-normal opacity-80">
                            (sells from {BOARD[highestTile]?.name})
                          </span>
                        )}
                      </button>
                    )}
                    {isFull && set.some((x) => (room.buildings[x] ?? 0) > 0) && (
                      <button
                        type="button"
                        onClick={() => emit('sellAllHouses', { tile: i })}
                        className="flex-1 rounded-xl bg-amber-300/20 px-2 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-300/30 active:scale-95"
                      >
                        Sell all in set
                      </button>
                    )}
                    {!isFull && <div className="text-[11px] text-white/40">Full set unlocks houses</div>}
                  </div>
                );
              })()}
            </div>
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

      {inspectTile != null && (
        <DeedModal
          tileIndex={inspectTile}
          room={room}
          me={me}
          onClose={() => setInspectTile(null)}
          emit={emit}
        />
      )}
    </>
  );
}
