import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RoomState } from '@monopoly/shared';
import { computeGameAwards, type PlayerStats, type SuperlativeAward } from '../utils/statsHelper';

export function EndgameStats({ room }: { room: RoomState }) {
  const [open, setOpen] = useState(false);
  const { stats, awards } = computeGameAwards(room);

  // Maximum net worth for relative progress bar scaling
  const maxNet = Math.max(...stats.map((s) => s.netWorth), 1);

  return (
    <div className="mt-3 w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-blue-500/20 border border-amber-400/30 px-4 py-3 text-sm font-bold text-amber-200 hover:from-amber-500/30 hover:via-purple-500/30 hover:to-blue-500/30 transition-all shadow-lg"
      >
        <span className="flex items-center gap-2">
          <span>📊</span>
          <span>Match Analytics & Superlative Awards</span>
        </span>
        <span>{open ? '▲ Hide' : '▼ View Breakdown'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="glass mt-2 space-y-4 rounded-3xl p-5 border border-white/10 shadow-2xl">
              {/* Fun Superlative Awards Grid */}
              <div>
                <div className="font-display text-base font-bold text-amber-300 flex items-center gap-1.5">
                  <span>🎖️</span>
                  <span>Match Superlatives</span>
                </div>
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {awards.map((award, i) => (
                    <div
                      key={i}
                      className="rounded-2xl bg-white/5 border border-white/10 p-3 flex items-start gap-3"
                    >
                      <div className="text-2xl p-1.5 rounded-xl bg-white/10">{award.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/60">{award.title}</span>
                          <span className="text-xs font-bold text-amber-200">{award.winnerName}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-white/80 truncate">{award.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wealth Breakdown Charts */}
              <div>
                <div className="font-display text-base font-bold text-emerald-300 flex items-center gap-1.5">
                  <span>📈</span>
                  <span>Final Wealth & Portfolio Breakdown</span>
                </div>
                <div className="mt-2.5 space-y-3">
                  {stats.map((p) => {
                    const pct = Math.max(8, Math.round((p.netWorth / maxNet) * 100));
                    const propertyVal = p.netWorth - p.cash;
                    return (
                      <div key={p.id} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold flex items-center gap-1.5">
                            <span>{p.name}</span>
                            <span className="text-white/50 text-[11px]">
                              ({p.propertiesCount} deeds, {p.buildingsCount} houses)
                            </span>
                          </span>
                          <span className="font-mono font-bold text-emerald-300 text-sm">
                            ${p.netWorth}
                          </span>
                        </div>

                        {/* Stacked relative wealth bar */}
                        <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden flex">
                          <div
                            style={{ width: `${pct}%` }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                          />
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-white/70 text-center">
                          <div className="rounded-lg bg-white/5 py-1">
                            <div className="text-[10px] text-white/40">Liquid Cash</div>
                            <span className="font-mono font-semibold text-emerald-300">${p.cash}</span>
                          </div>
                          <div className="rounded-lg bg-white/5 py-1">
                            <div className="text-[10px] text-white/40">Real Estate</div>
                            <span className="font-mono font-semibold text-sky-300">${propertyVal}</span>
                          </div>
                          <div className="rounded-lg bg-white/5 py-1">
                            <div className="text-[10px] text-white/40">Rent In / Out</div>
                            <span className="font-mono font-semibold text-amber-200">
                              +${p.rentsCollected} / -${p.rentsPaid}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
