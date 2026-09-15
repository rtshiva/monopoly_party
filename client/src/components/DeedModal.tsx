import { motion, AnimatePresence } from 'framer-motion';
import { BOARD, COLOR_HEX, fullSetOf, tilePrice } from '@monopoly/shared';
import type { Player, RoomState, Tile } from '@monopoly/shared';

interface DeedModalProps {
  tileIndex: number | null;
  room: RoomState;
  me: Player;
  onClose: () => void;
  emit?: (ev: string, extra?: Record<string, unknown>) => void;
}

export function DeedModal({ tileIndex, room, me, onClose, emit }: DeedModalProps) {
  if (tileIndex == null) return null;
  const t: Tile | undefined = BOARD[tileIndex];
  if (!t || (t.kind !== 'property' && t.kind !== 'railroad' && t.kind !== 'utility')) return null;

  const owner = room.players.find((p) => p.properties.includes(tileIndex));
  const isMine = owner?.id === me.id;
  const isMortgaged = owner?.mortgaged.includes(tileIndex) ?? false;
  const level = room.buildings[tileIndex] ?? 0;
  const price = tilePrice(tileIndex);
  const mortValue = Math.round(price / 2);

  const set = fullSetOf(tileIndex);
  const isFullSet = set.length > 0 && owner && set.every((x) => owner.properties.includes(x));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-xs overflow-hidden rounded-2xl border-2 border-white/20 bg-slate-900 text-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Color Header Banner */}
          {t.kind === 'property' && (
            <div
              className="px-4 py-3 text-center shadow-md"
              style={{ backgroundColor: COLOR_HEX[t.color] }}
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-black/70">TITLE DEED</div>
              <h3 className="text-base font-black tracking-tight text-white drop-shadow-md">
                {t.name.toUpperCase()}
              </h3>
            </div>
          )}

          {t.kind === 'railroad' && (
            <div className="bg-slate-800 px-4 py-3 text-center border-b border-white/10">
              <div className="text-2xl">🚂</div>
              <h3 className="text-base font-black tracking-tight text-white">{t.name.toUpperCase()}</h3>
            </div>
          )}

          {t.kind === 'utility' && (
            <div className="bg-slate-800 px-4 py-3 text-center border-b border-white/10">
              <div className="text-2xl">{t.name.includes('Water') ? '💧' : '💡'}</div>
              <h3 className="text-base font-black tracking-tight text-white">{t.name.toUpperCase()}</h3>
            </div>
          )}

          {/* Body Content */}
          <div className="p-4 space-y-3 text-xs">
            {t.kind === 'property' && (
              <>
                <div className="flex justify-between border-b border-white/10 pb-1 font-semibold">
                  <span className="text-white/70">Base Rent</span>
                  <span className={`font-mono ${level === 0 && !isFullSet ? 'text-amber-300 font-bold' : ''}`}>
                    ${t.rent[0]}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className={`flex justify-between rounded px-1.5 py-0.5 ${level === 0 && isFullSet ? 'bg-amber-300/20 text-amber-200 font-bold' : 'text-white/80'}`}>
                    <span>With Color Set (2×)</span>
                    <span className="font-mono">${t.rent[1]}</span>
                  </div>
                  <div className={`flex justify-between rounded px-1.5 py-0.5 ${level === 1 ? 'bg-amber-300/20 text-amber-200 font-bold' : 'text-white/80'}`}>
                    <span>With 1 House 🏠</span>
                    <span className="font-mono">${t.rent[2]}</span>
                  </div>
                  <div className={`flex justify-between rounded px-1.5 py-0.5 ${level === 2 ? 'bg-amber-300/20 text-amber-200 font-bold' : 'text-white/80'}`}>
                    <span>With 2 Houses 🏠🏠</span>
                    <span className="font-mono">${t.rent[3]}</span>
                  </div>
                  <div className={`flex justify-between rounded px-1.5 py-0.5 ${level === 3 ? 'bg-amber-300/20 text-amber-200 font-bold' : 'text-white/80'}`}>
                    <span>With 3 Houses 🏠🏠🏠</span>
                    <span className="font-mono">${t.rent[4]}</span>
                  </div>
                  <div className={`flex justify-between rounded px-1.5 py-0.5 ${level === 4 ? 'bg-amber-300/20 text-amber-200 font-bold' : 'text-white/80'}`}>
                    <span>With 4 Houses 🏠🏠🏠🏠</span>
                    <span className="font-mono">${t.rent[5]}</span>
                  </div>
                  <div className={`flex justify-between rounded px-1.5 py-0.5 ${level === 5 ? 'bg-rose-500/25 text-rose-200 font-bold' : 'text-white/80'}`}>
                    <span>With HOTEL 🏨</span>
                    <span className="font-mono">${t.rent[6]}</span>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-2 space-y-1 text-white/60 text-[11px]">
                  <div className="flex justify-between">
                    <span>House Cost</span>
                    <span className="font-mono font-bold text-white/80">${t.houseCost} each</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hotel Cost</span>
                    <span className="font-mono font-bold text-white/80">${t.houseCost} + 4 houses</span>
                  </div>
                </div>
              </>
            )}

            {t.kind === 'railroad' && (
              <div className="space-y-1.5 text-white/80">
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span>1 Railroad owned</span>
                  <span className="font-mono font-bold text-amber-200">$25</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span>2 Railroads owned</span>
                  <span className="font-mono font-bold text-amber-200">$50</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span>3 Railroads owned</span>
                  <span className="font-mono font-bold text-amber-200">$100</span>
                </div>
                <div className="flex justify-between">
                  <span>4 Railroads owned</span>
                  <span className="font-mono font-bold text-amber-200">$200</span>
                </div>
              </div>
            )}

            {t.kind === 'utility' && (
              <div className="space-y-2 text-white/80">
                <div className="rounded-lg bg-white/5 p-2 text-[11px]">
                  If 1 Utility is owned, rent is <b>4× dice roll</b>.
                </div>
                <div className="rounded-lg bg-white/5 p-2 text-[11px]">
                  If both Utilities are owned, rent is <b>10× dice roll</b>.
                </div>
              </div>
            )}

            {/* Mortgage & Ownership Info */}
            <div className="rounded-xl bg-black/40 p-2.5 text-[11px] space-y-1 border border-white/5">
              <div className="flex justify-between">
                <span className="text-white/50">Mortgage Value:</span>
                <span className="font-mono font-bold text-amber-300">${mortValue}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Owner:</span>
                <span className="font-bold text-white">
                  {owner ? (isMine ? '⭐ You' : owner.name) : '🏦 Bank (Unowned)'}
                </span>
              </div>
              {isMortgaged && (
                <div className="text-center font-bold text-rose-300 pt-0.5">
                  ⚠️ Currently Mortgaged (collects $0 rent)
                </div>
              )}
            </div>

            {/* Action buttons if owned by me */}
            {isMine && emit && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    emit('mortgage', { tile: tileIndex });
                    onClose();
                  }}
                  className={`w-full rounded-xl py-2 font-bold text-xs shadow-md transition-all active:scale-95 ${
                    isMortgaged
                      ? 'bg-amber-300 text-black hover:bg-amber-400'
                      : 'bg-white/15 text-white hover:bg-white/20'
                  }`}
                >
                  {isMortgaged ? `Unmortgage (Pay $${Math.round(mortValue * 1.1)})` : `Mortgage (Receive $${mortValue})`}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
