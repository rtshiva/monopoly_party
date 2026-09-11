import { BOARD, COLOR_HEX, TOKENS } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { TurnCountdown } from './TurnCountdown';

// 11x11 grid positions for 40 tiles, index 0 = GO bottom-right, going clockwise
function tileToRC(i: number): [number, number] {
  // bottom row right->left: 0..10 (row 10)
  // left col bottom->top: 11..19 (col 0)
  // top row left->right: 20..30 (row 0)
  // right col top->bottom: 31..39 (col 10)
  if (i <= 10) return [10, 10 - i];
  if (i <= 19) return [10 - (i - 10), 0];
  if (i <= 30) return [0, i - 20];
  return [i - 30, 10];
}

export function BoardGrid({ room }: { room: RoomState }) {
  return (
    <div className="relative aspect-square w-full select-none">
      <div className="absolute inset-0 grid grid-cols-11 grid-rows-11 gap-[3px]">
        {BOARD.map((t, i) => {
          const [r, c] = tileToRC(i);
          const here = room.players.filter((p) => !p.bankrupt && p.position === i);
          const owner = room.players.find((p) => p.properties.includes(i));
          const isPending = room.pendingBuy === i;
          const color = t.kind === 'property' ? COLOR_HEX[(t as { color: string }).color] : undefined;
          const level = room.buildings[i] ?? 0;
          const mortgaged = !!owner && owner.mortgaged.includes(i);
          const inTrade = room.trades.some((o) => o.giveTiles.includes(i) || o.wantTiles.includes(i));
          const inAuction = room.auction?.tile === i;
          return (
            <div
              key={i}
              style={{ gridRow: r + 1, gridColumn: c + 1 }}
              className={`glass relative overflow-hidden rounded-[8px] p-[4px] board-cell ${isPending ? 'ring-2 ring-amber-300 animate-pulse' : ''} ${t.kind === 'go' ? 'bg-emerald-400/20' : ''} ${t.kind === 'gotojail' ? 'bg-rose-400/20' : ''}`}
              title={t.name}
            >
              {color && <div className="absolute inset-x-0 top-0 h-[5px]" style={{ background: color }} />}
              <div className="mt-[5px] truncate font-bold text-[9px] lg:text-[10px]">{t.name}</div>
              <div className="text-white/60">
                {t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility'
                  ? `$${(t as { price: number }).price}` : t.kind === 'tax' ? `-$${(t as { amount: number }).amount}` : t.kind === 'go' ? '+$200' : ''}
              </div>
              {level > 0 && <div className="text-[10px] leading-tight">{level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}</div>}
              {(inAuction || inTrade) && (
                <div className="absolute right-[2px] top-[2px] text-[10px]">{inAuction ? '🔨' : '🤝'}</div>
              )}
              {owner && (
                <div className={`absolute bottom-[2px] right-[2px] rounded-full px-1 text-[8px] font-extrabold ${mortgaged ? 'bg-zinc-500 text-white' : 'bg-amber-300 text-black'}`}>
                  {mortgaged ? 'M' : owner.name.slice(0, 3)}
                </div>
              )}
              {here.length > 0 && (
                <div className="absolute bottom-[2px] left-[2px] flex max-w-full flex-wrap gap-[1px] text-[11px]">
                  {here.slice(0, 4).map((p) => (
                    <span key={p.id} title={p.name}>{TOKENS[p.token]}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* center stage */}
        <div
          style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}
          className="glass flex flex-col items-center justify-center rounded-2xl p-4 text-center"
        >
          <div className="font-display text-2xl font-bold tracking-tight lg:text-4xl">
            MONOPOLY <span className="text-amber-300">PARTY</span>
          </div>
          <div className="mt-1 text-sm text-white/70">
            Room <span className="font-mono font-extrabold text-white">{room.code}</span> · Turn {room.turnCount} · {room.players.length} players
          </div>
          <div className="mt-3 flex items-center gap-3 text-5xl">
            <span>🎲 {room.dice[0]}</span>
            <span>🎲 {room.dice[1]}</span>
          </div>
          {room.lastRoll && <div className="mt-2 text-sm text-amber-200">{room.lastRoll}</div>}
          {room.status === 'playing' && (
            <div className="mt-2 rounded-full bg-white/10 px-4 py-1 text-sm">
              👉 {room.players[room.turnIndex % room.players.length]?.name}'s turn
              {' '}<TurnCountdown deadline={room.turnDeadline} className="ml-1 rounded-full bg-amber-300/20 px-2 py-0.5 font-mono text-amber-200" />
            </div>
          )}
          {room.status === 'playing' && (room.auction || room.trades.length > 0) && (
            <div className="mt-1 max-w-full truncate text-xs text-white/60">
              {room.auction && <>🔨 {BOARD[room.auction.tile]?.name} ({room.auction.bids.length} bid{room.auction.bids.length === 1 ? '' : 's'})</>}
              {room.auction && room.trades.length > 0 && ' · '}
              {room.trades.length > 0 && <>🤝 {room.trades.length} open</>}
            </div>
          )}
          {room.status === 'finished' && (
            <div className="mt-2 rounded-full bg-amber-300 px-4 py-1 text-sm font-extrabold text-black">
              🏆 {room.players.find((p) => p.id === room.winnerId)?.name} wins!
            </div>
          )}
          {room.status === 'paused' && (
            <div className="mt-2 rounded-full bg-white/15 px-4 py-1 text-sm font-bold">
              ⏸ Paused by host — nothing moves until resume
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
