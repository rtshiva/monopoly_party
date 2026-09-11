import { BOARD, COLOR_HEX, TOKENS, circuitLayout } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { StageBar } from './StageBar';

/**
 * Grand Prix circuit board: 40 tiles ride an F1-style loop (start/finish on
 * the top straight, chicane at the bottom) drawn as asphalt with a dashed
 * center line. Same tile data and badges as the maze — just a wilder track.
 */
export function CircuitBoard({ room }: { room: RoomState }) {
  const pts = circuitLayout(40);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
  return (
    <div className="select-none">
      <StageBar room={room} />
      <div className="overflow-x-auto">
        <div className="relative aspect-[16/10] min-w-[1000px]">
          <svg viewBox="0 0 100 62.5" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path d={pathD} fill="none" stroke="#0d1330" strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <path d={pathD} fill="none" stroke="#232c4d" strokeWidth={3.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <path d={pathD} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.3} strokeDasharray="1.4 1.1" vectorEffect="non-scaling-stroke" />
          </svg>
          {pts.map((p) => {
            const t = BOARD[p.tile];
            const here = room.players.filter((pl) => !pl.bankrupt && pl.position === p.tile);
            const owner = room.players.find((pl) => pl.properties.includes(p.tile));
            const isPending = room.pendingBuy === p.tile;
            const color = t.kind === 'property' ? COLOR_HEX[t.color] : undefined;
            const level = room.buildings[p.tile] ?? 0;
            const mortgaged = !!owner && owner.mortgaged.includes(p.tile);
            const inTrade = room.trades.some((o) => o.giveTiles.includes(p.tile) || o.wantTiles.includes(p.tile));
            const inAuction = room.auction?.tile === p.tile;
            const isCurrentTurn = room.status === 'playing' && room.players[room.turnIndex % room.players.length]?.position === p.tile;
            return (
              <div
                key={p.tile}
                style={{ left: `${p.x}%`, top: `${(p.y / 62.5) * 100}%` }}
                className={`absolute z-10 w-[100px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-white/15 bg-[#151c34] p-1.5 text-center shadow-xl ${isPending ? 'ring-2 ring-amber-300 animate-pulse' : ''} ${isCurrentTurn ? 'ring-1 ring-sky-300/70' : ''} ${t.kind === 'go' ? 'ring-1 ring-emerald-300/60' : ''} ${t.kind === 'gotojail' ? 'ring-1 ring-rose-300/60' : ''}`}
                title={`#${p.tile} ${t.name}`}
              >
                {color && <div className="absolute inset-x-0 top-0 h-[5px]" style={{ background: color }} />}
                <div className="mt-[3px] font-mono text-[10px] font-bold text-white/50">#{p.tile}{p.tile === 0 ? ' 🏁' : ''}</div>
                <div className="truncate text-xs font-bold">{t.name}</div>
                <div className="text-[11px] text-white/60">
                  {t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility'
                    ? `$${(t as { price: number }).price}` : t.kind === 'tax' ? `-$${(t as { amount: number }).amount}` : t.kind === 'go' ? '+$200' : ' '}
                </div>
                {level > 0 && <div className="text-[11px] leading-tight">{level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}</div>}
                <div className="mt-0.5 flex min-h-[18px] flex-wrap items-center justify-center gap-0.5">
                  {here.slice(0, 3).map((pl) => (
                    <span key={pl.id} title={pl.name} className="text-sm leading-none">{TOKENS[pl.token]}</span>
                  ))}
                  {owner && (
                    <span className={`rounded-full px-1 text-[9px] font-extrabold ${mortgaged ? 'bg-zinc-500 text-white' : 'bg-amber-300 text-black'}`}>
                      {mortgaged ? 'M' : owner.name.slice(0, 6)}
                    </span>
                  )}
                  {(inAuction || inTrade) && <span className="text-[10px]">{inAuction ? '🔨' : '🤝'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
