import { useState } from 'react';
import { motion } from 'framer-motion';
import { TOKENS, netWorth, type Player, type RoomState } from '@monopoly/shared';
import { getPlayerColor } from './playerTokens';
import { CashFloatBadge, type FloatItem } from './CashFloats';

export interface HostLeaderboardProps {
  room: RoomState;
  sorted: Player[];
  floats: Record<string, FloatItem[]>;
  amHost: boolean;
  hostSeat?: Player;
  onKick?: (targetId: string) => void;
}

export function HostLeaderboard({
  room,
  sorted,
  floats,
  amHost,
  hostSeat,
  onKick,
}: HostLeaderboardProps) {
  const [showPins, setShowPins] = useState(false);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="font-display font-bold">🏆 Leaderboard</div>
        <button
          type="button"
          onClick={() => setShowPins((v) => !v)}
          title={showPins ? 'Hide takeover PINs from TV' : 'Show takeover PINs on TV'}
          className="rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20 transition-colors flex items-center gap-1"
        >
          <span>{showPins ? '👁️ Hide PINs' : '🔒 Show PINs'}</span>
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {sorted.map((p, i) => {
          const pOriginalIndex = room.players.findIndex((rp) => rp.id === p.id);
          const pColor = getPlayerColor(pOriginalIndex >= 0 ? pOriginalIndex : i);
          const isLeader = i === 0 && !p.bankrupt;
          const isDanger = !p.bankrupt && p.cash <= 150;
          const playerNet = netWorth(p, room);
          return (
            <motion.div
              key={p.id}
              layout
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className={`relative flex items-center gap-2 rounded-xl px-3 py-2 border transition-all ${
                p.bankrupt
                  ? 'bg-white/5 opacity-40 border-white/5'
                  : isLeader
                  ? 'bg-amber-300/10 border-amber-300/40 shadow-[0_0_12px_rgba(252,211,77,0.15)]'
                  : isDanger
                  ? 'bg-rose-500/10 border-rose-500/40 animate-pulse'
                  : 'bg-white/10 border-white/5'
              }`}
              style={{
                borderLeftColor: pColor.hex,
                borderLeftWidth: '4px',
              }}
            >
              <CashFloatBadge items={floats[p.id]} />
              <span className="w-5 text-xs font-bold flex items-center gap-1">
                {isLeader ? '👑' : <span className="text-white/70">{i + 1}</span>}
              </span>
              <span
                className="flex items-center justify-center w-7 h-7 rounded-full text-base border shadow-sm"
                style={{
                  background: pColor.bgRgba,
                  borderColor: pColor.hex,
                  boxShadow: `0 0 6px ${pColor.glowRgba}`,
                }}
              >
                {TOKENS[p.token]}
              </span>
              <span className="flex-1 truncate font-semibold">
                {p.name}
                {p.isBot ? ' 🤖' : ''} {p.bankrupt ? '(💀)' : ''}{' '}
                {!p.connected ? '(📴)' : p.controllerLabel ? `📱${p.controllerLabel}` : ''}
                {isDanger && <span className="ml-1 text-[10px] text-rose-300 font-bold">⚠️ LOW CASH</span>}
              </span>
              {!p.bankrupt && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-200" title="Seat takeover PIN">
                  {showPins ? `PIN ${p.seatPin}` : '••••'}
                </span>
              )}
              <div className="text-right font-mono min-w-16">
                <div className={`font-bold ${p.cash < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  ${p.cash}
                </div>
                <div className="text-[10px] text-white/50" title="Total Net Worth (Cash + Deeds + Buildings)">
                  Net: ${playerNet}
                </div>
              </div>
              {amHost && hostSeat && p.id !== hostSeat.id && !p.bankrupt && onKick && (
                <button
                  title={`Remove ${p.name} (deeds go to auction)`}
                  onClick={() => {
                    if (window.confirm(`Remove ${p.name} from the game? Their deeds go to bank auction.`)) {
                      onKick(p.id);
                    }
                  }}
                  className="rounded-lg bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-200"
                >
                  ✕
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
