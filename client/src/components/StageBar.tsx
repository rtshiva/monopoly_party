import { BOARD } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { DicePair } from './DiceFace';
import { TurnCountdown } from './TurnCountdown';

/** Shared center-stage: title, dice, turn clock, auction/trades, card flip. */
export function StageBar({ room }: { room: RoomState }) {
  const topBid = room.auction ? [...room.auction.bids].sort((a, b) => b.amount - a.amount)[0] : null;
  return (
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
  );
}
