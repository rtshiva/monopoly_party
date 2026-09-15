import { BOARD, COLOR_HEX, tilePrice, type Player } from '@monopoly/shared';

export interface TradeAssetStripProps {
  tiles: number[];
  cash: number;
  cards: number;
  owner?: Player | null;
}

export function TradeAssetStrip({
  tiles,
  cash,
  cards,
  owner,
}: TradeAssetStripProps) {
  if (tiles.length === 0 && cash === 0 && cards === 0) {
    return <span className="text-xs text-white/40 italic">Nothing</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      {tiles.map((i) => {
        const t = BOARD[i];
        const color = t.kind === 'property' ? COLOR_HEX[t.color] : '#888';
        const isMort = owner?.mortgaged.includes(i) ?? false;
        return (
          <span
            key={i}
            className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${
              isMort
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                : 'border-white/15 bg-white/5 text-white'
            }`}
          >
            <span className="h-2 w-1.5 rounded-full" style={{ background: color }} />
            <span>{t.name}</span>
            <span className="font-mono text-[10px] text-emerald-300 font-bold">${tilePrice(i)}</span>
            {isMort && (
              <span className="rounded bg-rose-500/30 px-1 py-0.2 text-[9px] font-extrabold text-rose-300">
                MORTGAGED
              </span>
            )}
          </span>
        );
      })}
      {cash > 0 && (
        <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-xs font-bold font-mono text-emerald-300">
          +${cash}
        </span>
      )}
      {cards > 0 && (
        <span className="rounded-lg border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-xs font-bold text-amber-200">
          🃏 ×{cards}
        </span>
      )}
    </div>
  );
}
