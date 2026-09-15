import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BOARD, TOKENS, type Player, type RoomState } from '@monopoly/shared';
import { setMuted } from '../sound';
import { haptic } from '../haptics';

export interface PlayHeaderProps {
  me: Player;
  room: RoomState;
  myTile: (typeof BOARD)[number];
  hasControl: boolean;
  myNetWorth: number;
  mutedUi: boolean;
  setMutedUi: (muted: boolean) => void;
  emit: (ev: string, extra?: Record<string, unknown>, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void) => void;
}

export function PlayHeader({
  me,
  room,
  myTile,
  hasControl,
  myNetWorth,
  mutedUi,
  setMutedUi,
  emit,
}: PlayHeaderProps) {
  const [showCashHistory, setShowCashHistory] = useState(false);

  const myRecentCashLogs = useMemo(() => {
    return room.log
      .filter((l) => l.cat === 'money' || l.tone === 'money' || l.text.includes(me.name))
      .slice(0, 3)
      .map((l) => l.text);
  }, [room.log, me.name]);

  return (
    <>
      <div className="glass flex items-center gap-3 rounded-2xl p-3">
        <div className="text-3xl">{TOKENS[me.token]}</div>
        <div className="flex-1">
          <div className="font-bold">
            🎮 {me.name} <span className="ml-1 rounded bg-white/10 px-1 font-mono text-xs">{room.code}</span>
          </div>
          <div className="text-xs text-white/60">
            📍 {myTile.name} · {me.inJail ? '🔒 In jail' : 'Free'} · {hasControl ? 'controlling' : 'NOT controlling'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { haptic(15); setShowCashHistory((v) => !v); }}
          className="text-right cursor-pointer rounded-xl px-1.5 py-0.5 hover:bg-white/5 active:scale-95 transition-all"
        >
          <div className={`font-mono text-xl font-extrabold flex items-center justify-end gap-1 ${me.cash < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            <span>${me.cash}</span>
            <span className="text-[10px] text-white/50">{showCashHistory ? '▲' : '▼'}</span>
          </div>
          <div className="text-[11px] font-medium text-white/60">Net: <span className="font-mono text-emerald-300/90">${myNetWorth}</span></div>
        </button>
        {me.isHost && (room.status === 'playing' || room.status === 'paused') && (
          <button
            type="button"
            title={room.status === 'playing' ? 'Pause game' : 'Resume game'}
            onClick={() => emit(room.status === 'playing' ? 'pauseGame' : 'resumeGame')}
            className="rounded-xl bg-white/15 px-2.5 py-1 text-sm font-bold"
          >
            {room.status === 'playing' ? '⏸' : '▶️'}
          </button>
        )}
        <button
          type="button"
          title={mutedUi ? 'Unmute sounds' : 'Mute sounds'}
          onClick={() => { const m = !mutedUi; setMuted(m); setMutedUi(m); }}
          className="rounded-xl bg-white/10 px-2 py-1 text-lg"
        >
          {mutedUi ? '🔇' : '🔊'}
        </button>
      </div>

      <AnimatePresence>
        {showCashHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/70 p-3 text-xs backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-bold">
                <span className="text-white/80">💳 Financial Breakdown</span>
                <span className="font-mono text-emerald-300 font-extrabold">Net: ${myNetWorth}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-white/70">
                <div className="rounded-xl bg-white/5 p-2">
                  <div className="text-[10px] text-white/50">Liquid Cash</div>
                  <div className="font-mono text-sm font-bold text-emerald-300">${me.cash}</div>
                </div>
                <div className="rounded-xl bg-white/5 p-2">
                  <div className="text-[10px] text-white/50">Deeds & Buildings</div>
                  <div className="font-mono text-sm font-bold text-white">${myNetWorth - me.cash}</div>
                </div>
              </div>
              <div className="mt-2.5 border-t border-white/10 pt-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Recent Transactions</div>
                {myRecentCashLogs.length === 0 ? (
                  <div className="text-white/40 italic py-0.5">No recent money events</div>
                ) : (
                  <div className="space-y-1">
                    {myRecentCashLogs.map((log: string, idx: number) => (
                      <div key={idx} className="truncate text-[11px] text-white/80">
                        • {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
