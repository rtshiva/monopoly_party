import { motion, AnimatePresence } from 'framer-motion';
import { BOARD, TOKENS, tilePrice } from '@monopoly/shared';
import type { RoomState, TradeOffer } from '@monopoly/shared';
import { TurnCountdown } from './TurnCountdown';

interface TvTradeSpotlightProps {
  room: RoomState;
}

export function TvTradeSpotlight({ room }: TvTradeSpotlightProps) {
  const trades = room.trades;
  if (!trades || trades.length === 0) return null;

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {trades.map((t) => {
          const from = room.players.find((p) => p.id === t.fromId);
          const to = room.players.find((p) => p.id === t.toId);
          if (!from || !to) return null;

          return (
            <motion.div
              key={t.id}
              initial={{ y: -12, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -12, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="relative overflow-hidden rounded-2xl border-2 border-amber-300/40 bg-gradient-to-r from-slate-900/95 via-black/90 to-slate-900/95 p-4 shadow-2xl backdrop-blur-md"
            >
              {/* Top Banner */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤝</span>
                  <span className="font-black uppercase tracking-wider text-amber-300 text-sm">
                    Live Trade Negotiation
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">Decision in:</span>
                  <TurnCountdown
                    deadline={t.expiresAt}
                    className="rounded-full bg-amber-300/20 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-200"
                  />
                </div>
              </div>

              {/* Trade Negotiation Columns */}
              <div className="mt-3 grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                {/* Left: From Player */}
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-300 mb-1.5">
                    <span>{TOKENS[from.token]} {from.name} offers</span>
                    <span className="font-mono text-white/50">${from.cash} in bank</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.giveTiles.map((idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-black/40 border border-white/10 px-2 py-0.5 text-xs font-semibold text-white"
                      >
                        {BOARD[idx]?.name ?? `#${idx}`} <span className="font-mono text-emerald-300 text-[10px]">${tilePrice(idx)}</span>
                      </span>
                    ))}
                    {t.giveCash > 0 && (
                      <span className="rounded-lg bg-emerald-400/25 border border-emerald-400/40 px-2 py-0.5 text-xs font-bold font-mono text-emerald-200">
                        +${t.giveCash} cash
                      </span>
                    )}
                    {t.giveCards > 0 && (
                      <span className="rounded-lg bg-amber-300/20 border border-amber-300/40 px-2 py-0.5 text-xs font-bold text-amber-200">
                        🃏 ×{t.giveCards}
                      </span>
                    )}
                    {t.giveTiles.length === 0 && t.giveCash === 0 && t.giveCards === 0 && (
                      <span className="text-xs text-white/40 italic">Nothing offered</span>
                    )}
                  </div>
                </div>

                {/* Center Arrow */}
                <div className="flex justify-center text-xl text-amber-300/80 font-bold">
                  ⇄
                </div>

                {/* Right: To Player */}
                <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-3">
                  <div className="flex items-center justify-between text-xs font-bold text-sky-300 mb-1.5">
                    <span>{TOKENS[to.token]} {to.name} gives</span>
                    <span className="font-mono text-white/50">${to.cash} in bank</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.wantTiles.map((idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-black/40 border border-white/10 px-2 py-0.5 text-xs font-semibold text-white"
                      >
                        {BOARD[idx]?.name ?? `#${idx}`} <span className="font-mono text-sky-300 text-[10px]">${tilePrice(idx)}</span>
                      </span>
                    ))}
                    {t.wantCash > 0 && (
                      <span className="rounded-lg bg-sky-400/25 border border-sky-400/40 px-2 py-0.5 text-xs font-bold font-mono text-sky-200">
                        +${t.wantCash} cash
                      </span>
                    )}
                    {t.wantCards > 0 && (
                      <span className="rounded-lg bg-amber-300/20 border border-amber-300/40 px-2 py-0.5 text-xs font-bold text-amber-200">
                        🃏 ×{t.wantCards}
                      </span>
                    )}
                    {t.wantTiles.length === 0 && t.wantCash === 0 && t.wantCards === 0 && (
                      <span className="text-xs text-white/40 italic">Nothing requested</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
