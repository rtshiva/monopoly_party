import type { Player } from '@monopoly/shared';
import { haptic } from '../haptics';

export interface JailCardViewProps {
  me: Player;
  canRoll: boolean;
  emit: (ev: string, extra?: Record<string, unknown>, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void) => void;
}

export function JailCardView({ me, canRoll, emit }: JailCardViewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-b from-slate-900 via-slate-900/90 to-black p-4 shadow-xl">
      {/* Header with prison bars motif */}
      <div className="relative mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔒</span>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-rose-300">Lockup / In Jail</h3>
            <p className="text-[11px] text-white/60">
              {me.jailTurns === 0 ? 'Attempt 1 of 2: Roll doubles or pay bail' : 'Attempt 2 of 2: Must escape or pay next turn'}
            </p>
          </div>
        </div>
        <div className="rounded-full border border-rose-800/60 bg-rose-950/80 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
          Attempt {me.jailTurns + 1}/2
        </div>
      </div>

      {/* Jail Options Grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Option 1: Pay Bail */}
        <button
          type="button"
          disabled={me.cash < 50}
          onClick={() => { haptic(35); emit('payJail'); }}
          className={`flex flex-col items-start rounded-xl p-3 text-left transition-all ${
            me.cash >= 50
              ? 'bg-gradient-to-r from-amber-400 to-amber-300 text-amber-950 shadow-md active:scale-95'
              : 'border border-white/5 bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-extrabold">
            <span>🔓 Pay Bail</span>
            <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">$50</span>
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            {me.cash >= 50 ? 'Immediate release & roll freely' : 'Need $50 cash (mortgage or trade)'}
          </div>
        </button>

        {/* Option 2: Get-out-of-jail free card */}
        <button
          type="button"
          disabled={me.jailCards <= 0}
          onClick={() => { haptic(35); emit('useJailCard'); }}
          className={`flex flex-col items-start rounded-xl p-3 text-left transition-all ${
            me.jailCards > 0
              ? 'bg-gradient-to-r from-emerald-400 to-teal-300 text-teal-950 shadow-md active:scale-95'
              : 'border border-white/5 bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-extrabold">
            <span>🃏 Jail Free Card</span>
            <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">
              {me.jailCards > 0 ? `${me.jailCards} available` : '0 available'}
            </span>
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            {me.jailCards > 0 ? 'Use your card to leave free' : 'Earn from Chance / Chest'}
          </div>
        </button>
      </div>

      {/* Option 3 Info / Double Roll indicator */}
      <div className="mt-2.5 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-white/70">
        <span className="flex items-center gap-1.5">
          <span>🎲</span>
          <span>Roll for Doubles:</span>
          <strong className="text-amber-300 font-mono">16.7% odds</strong>
        </span>
        <span className="text-[10px] text-white/50">
          {canRoll && !me.hasRolled ? 'Hold ROLL below' : me.hasRolled ? 'Rolled this turn' : 'Wait for turn'}
        </span>
      </div>
    </div>
  );
}
