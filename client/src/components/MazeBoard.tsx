import { BOARD, COLOR_HEX, MAZE_ARROWS, TOKENS, serpentineOrder } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { motion } from 'framer-motion';
import { StageBar } from './StageBar';

/**
 * Serpentine maze board: all 40 tiles snake across the full area in large
 * cards (8 cols x 5 rows), each showing its track number, flow arrow,
 * owner, buildings and markers. The old perimeter board left most of a TV
 * screen empty; this one spends every pixel on tiles.
 */
export function MazeBoard({ room }: { room: RoomState }) {
  const cells = serpentineOrder(40, 8);
  // Broad-ribbon geometry: 112px cards, 64px gaps, ribbons ~160px wide with
  // 16px background slits between rows. The viewport is padded horizontally
  // so the rounded U-turn caps are never clipped. Vertical scale is exactly
  // 1 unit = 1px (content height is fixed), so stroke widths are real pixels.
  const ROW_H = 112;
  const ROW_GAP = 64;
  const PITCH = ROW_H + ROW_GAP;
  const VB_X = -120, VB_W = 1040, VB_H = 5 * ROW_H + 4 * ROW_GAP;
  const pt = (row: number, col: number) => ({
    x: VB_X + (VB_W / 8) * (col + 0.5),
    y: row * PITCH + ROW_H / 2,
  });
  const track = cells
    .map((c) => `${pt(c.row, c.col).x.toFixed(1)},${pt(c.row, c.col).y.toFixed(1)}`)
    .join(' ');
  // Magic portal loop: the track ends at #39 but play wraps to GO (#0).
  // A shimmer stub exits past the end, and a pulsing portal + entry stub
  // feed back into the start — the wrap-around made visible.
  const start = pt(0, 0);
  const end = pt(4, 7);
  const entryStub = `${(start.x - 52).toFixed(1)},${start.y} ${start.x.toFixed(1)},${start.y}`;
  const exitStub = `${end.x.toFixed(1)},${end.y} ${(end.x + 62).toFixed(1)},${end.y}`;
  return (
    <div className="select-none">
      <StageBar room={room} />

      {/* the maze: 8 wide, 5 tall, every cell a big tile */}
      <div className="overflow-x-auto">
        <div className="relative grid min-w-[760px] grid-cols-8 gap-x-2 gap-y-16">
          <svg viewBox={`-120 0 1040 ${VB_H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {/* Broad money-green ribbons wrap each row of navy cards, with
                background slits + rounded U-turns between rows. */}
            <polyline points={track} fill="none" stroke="#06382a" strokeWidth={ROW_H + 64} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={track} fill="none" stroke="#0f7a52" strokeWidth={ROW_H + 48} strokeLinejoin="round" strokeLinecap="round" />
            {/* Portal at the maze start: breathing rings around GO. */}
            {[64, 88].map((r, i) => (
              <motion.circle
                key={r}
                cx={start.x}
                cy={start.y}
                r={r}
                fill="none"
                stroke="#34d399"
                strokeWidth={3}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={{ opacity: 0.15, scale: 0.92 }}
                animate={{ opacity: [0.15, 0.65, 0.15], scale: [0.92, 1.06, 0.92] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
              />
            ))}
            {/* Shimmer stubs: out of the end, into the start. */}
            {[entryStub, exitStub].map((d, i) => (
              <motion.polyline
                key={i}
                points={d}
                fill="none"
                stroke="#a7f3d0"
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray="10 9"
                initial={{ strokeDashoffset: 0, opacity: 0.9 }}
                animate={{ strokeDashoffset: [0, -38] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              />
            ))}
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
                className={`relative h-[112px] overflow-hidden rounded-xl border border-white/15 bg-[#1a2140] p-2 shadow-lg ${isPending ? 'ring-2 ring-amber-300 animate-pulse' : ''} ${isCurrentTurn ? 'ring-1 ring-sky-300/70' : ''} ${t.kind === 'go' ? 'ring-1 ring-emerald-300/60' : ''} ${t.kind === 'gotojail' ? 'ring-1 ring-rose-300/60' : ''}`}
                title={`#${c.tile} ${t.name}`}
              >
                {color && <div className="absolute inset-x-0 top-0 h-[6px]" style={{ background: color }} />}
                <div className="mt-[4px] flex items-center justify-between text-[11px] text-white/50">
                  <span className="rounded bg-white/10 px-1 font-mono font-bold" title={c.tile === 0 ? 'START portal — passing here pays out' : c.tile === 39 ? 'Track end — wraps back to the START portal' : `Tile #${c.tile}`}>
                    {c.tile === 0 ? '#0 🌀' : c.tile === 39 ? '#39 ↩' : `#${c.tile}`}
                  </span>
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
