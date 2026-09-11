import { BOARD, COLOR_HEX, MAZE_ARROWS, TOKENS, serpentineOrder } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { DicePair } from './DiceFace';
import { TurnCountdown } from './TurnCountdown';

/**
 * Serpentine maze board: all 40 tiles snake across the full area in large
 * cards (8 cols x 5 rows), each showing its track number, flow arrow,
 * owner, buildings and markers. The old perimeter board left most of a TV
 * screen empty; this one spends every pixel on tiles.
 */
export function MazeBoard({ room }: { room: RoomState }) {
  const cells = serpentineOrder(40, 8);
  const topBid = room.auction ? [...room.auction.bids].sort((a, b) => b.amount - a.amount)[0] : null;
  return (
    <div className="select-none">
      {/* stage bar: everything the old board center held */}
      <div className="glass mb-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl p-3 text-center">
        <div>
          <div className="font-display text-lg font-bold tracking-tight">MONOPOLY <span className="text-amber-300">PARTY</span></div>
          <div className="text-xs text-white/70">
            Room <span className="font-mono font-extrabold text-white">{room.code}</span> · Turn {room.turnCount} · {room.players.length} players
          </div>
        </div>
        <DicePair d1={room.dice[0]} d2={room.dice[1]} rollKey={room.lastRoll} size={44} />
        <div className="text-sm">
          {room.lastRoll && <div className="text-amber-200">{room.lastRoll}</div>}
          {room.status === 'playing' && (
            <div className="mt-1 rounded-full bg-white/10 px-4 py-1">
              👉 {room.players[room.turnIndex % room.players.length]?.name}'s turn
              {' '}<TurnCountdown deadline={room.turnDeadline} className="ml-1 rounded-full bg-amber-300/20 px-2 py-0.5 font-mono text-amber-200" />
            </div>
          )}
          {room.status === 'paused' && <div className="mt-1 font-bold">⏸ Paused by host</div>}
          {room.status === 'finished' && (
            <div className="mt-1 rounded-full bg-amber-300 px-4 py-1 font-extrabold text-black">
              🏆 {room.players.find((p) => p.id === room.winnerId)?.name} wins!
            </div>
          )}
          {room.auction && (
            <div className="mt-1 text-xs text-amber-200">
              🔨 {BOARD[room.auction.tile]?.name}{topBid ? <> — top ${topBid.amount} ({room.players.find((p) => p.id === topBid.playerId)?.name})</> : ' — no bids yet'}
            </div>
          )}
          {room.trades.length > 0 && (
            <div className="text-xs text-white/60">🤝 {room.trades.length} trade{room.trades.length === 1 ? '' : 's'} open</div>
          )}
        </div>
        <AnimatePresence>
          {room.lastCard && (
            <motion.div
              key={room.lastCard.at}
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xs rounded-xl border border-amber-300/50 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100"
            >
              {room.lastCard.kind === 'chance' ? '🃏' : '🎁'} {room.lastCard.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* the maze: 8 wide, 5 tall, every cell a big tile */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-8 gap-2">
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
