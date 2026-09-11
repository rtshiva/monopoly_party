import { BOARD, COLOR_HEX, MAZE_ARROWS, TOKENS, serpentineOrder } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { StageBar } from './StageBar';

/**
 * Serpentine maze board: all 40 tiles snake across the full area in large
 * cards (8 cols x 5 rows), each showing its track number, flow arrow,
 * owner, buildings and markers. The old perimeter board left most of a TV
 * screen empty; this one spends every pixel on tiles.
 */
export function MazeBoard({ room }: { room: RoomState }) {
  const cells = serpentineOrder(40, 8);
  // Snake path through every cell center: drawn as a track behind the cards
  // so the rows read as one connected maze instead of a plain table.
  const track = cells
    .map((c) => `${((c.col + 0.5) * 100).toFixed(1)},${((c.row + 0.5) * 100).toFixed(1)}`)
    .join(' ');
  return (
    <div className="select-none">
      <StageBar room={room} />

      {/* the maze: 8 wide, 5 tall, every cell a big tile */}
      <div className="overflow-x-auto">
        <div className="relative grid min-w-[760px] grid-cols-8 gap-2">
          <svg viewBox="0 0 800 500" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {/* Wide ribbons wrap each row of cards (and round the U-turns),
                so the snake reads as one bordered track, not a table. */}
            <polyline points={track} fill="none" stroke="#0d1330" strokeWidth={136} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <polyline points={track} fill="none" stroke="#2f3c66" strokeWidth={120} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {cells.map((c) => {
            const t = BOARD[c.tile];
            const here = room.players.filter((p) => !p.bankrupt && p.position === c.tile);
            const owner = room.players.find((p) => p.properties.includes(c.tile));
            const isPending = room.pendingBuy === c.tile;
            const color = t.kind === 'property' ? COLOR_HEX[t.color] : undefined;
            const level = room.buildings[c.tile] ?? 0;
            const mortgaged = !!owner && owner.mortgaged.includes(c.tile);
            const inTrade = room.trades.some((o) => o.giveTiles.includes(c.tile) || o.wantTiles.includes(c.tile));
            const inAuction = room.auction?.tile === c.tile;
            const isCurrentTurn = room.status === 'playing' && room.players[room.turnIndex % room.players.length]?.position === c.tile;
            return (
              <div
                key={c.tile}
                style={{ gridRow: c.row + 1, gridColumn: c.col + 1 }}
                className={`glass relative overflow-hidden rounded-xl p-2 ${isPending ? 'ring-2 ring-amber-300 animate-pulse' : ''} ${isCurrentTurn ? 'ring-1 ring-sky-300/70' : ''} ${t.kind === 'go' ? 'bg-emerald-400/10' : ''} ${t.kind === 'gotojail' ? 'bg-rose-400/10' : ''}`}
                title={`#${c.tile} ${t.name}`}
              >
                {color && <div className="absolute inset-x-0 top-0 h-[6px]" style={{ background: color }} />}
                <div className="mt-[4px] flex items-center justify-between text-[11px] text-white/50">
                  <span className="rounded bg-white/10 px-1 font-mono font-bold">#{c.tile}</span>
                  <span title="next tile">{MAZE_ARROWS[c.next]}</span>
                </div>
                <div className="truncate text-sm font-bold">{t.name}</div>
                <div className="text-xs text-white/60">
                  {t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility'
                    ? `$${(t as { price: number }).price}` : t.kind === 'tax' ? `-$${(t as { amount: number }).amount}` : t.kind === 'go' ? '+$200' : ' '}
                </div>
                {level > 0 && <div className="text-sm leading-tight">{level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}</div>}
                <div className="mt-1 flex min-h-[20px] flex-wrap items-center gap-1">
                  {here.slice(0, 5).map((p) => (
                    <span key={p.id} title={p.name} className="text-lg leading-none">{TOKENS[p.token]}</span>
                  ))}
                  {owner && (
                    <span className={`ml-auto rounded-full px-1.5 text-[10px] font-extrabold ${mortgaged ? 'bg-zinc-500 text-white' : 'bg-amber-300 text-black'}`}>
                      {mortgaged ? 'M' : owner.name.slice(0, 6)}
                    </span>
                  )}
                  {(inAuction || inTrade) && <span className="text-xs">{inAuction ? '🔨' : '🤝'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
