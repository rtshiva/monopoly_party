import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const MAX_HOLD_MS = 5000;
const CHARGE_MS = 1200; // time for the fill bar to reach 100%

interface Props {
  disabled?: boolean;
  committing?: boolean;
  /** Doubles bonus roll: label says ROLL AGAIN instead of the hold hint. */
  bonus?: boolean;
  onCommit: () => void;
  onHoldChange?: (holding: boolean) => void;
  onTick?: () => void;
}

/**
 * Press-and-hold ROLL button: dice keep shuffling (via onTick) while held,
 * the single authoritative roll commits once on release.
 *
 * - Pointer Events cover mouse / touch / stylus with one code path.
 * - `touch-action: none` + pointer capture keeps the hold alive if the
 *   finger slides slightly; sliding off still commits on pointerup.
 * - Quick tap (<250ms) also commits, so plain clickers aren't punished.
 * - Keyboard: holding Space/Enter shuffles, keyup commits (a11y).
 * - Auto-commits after MAX_HOLD_MS so a missed pointerup can't stick.
 * - Commits exactly once per press (committedRef guard).
 */
export function HoldToRollButton({ disabled, committing, bonus, onCommit, onHoldChange, onTick }: Props) {
  const [holding, setHolding] = useState(false);
  const [holdMs, setHoldMs] = useState(0);
  const holdingRef = useRef(false);
  const committedRef = useRef(false);
  const startRef = useRef(0);
  const tickTimer = useRef<number | null>(null);
  const frameTimer = useRef<number | null>(null);
  const autoTimer = useRef<number | null>(null);
  const stateRef = useRef({ onCommit, onTick, onHoldChange, disabled, committing });
  stateRef.current = { onCommit, onTick, onHoldChange, disabled, committing };

  function clearTimers() {
    if (tickTimer.current != null) { clearInterval(tickTimer.current); tickTimer.current = null; }
    if (frameTimer.current != null) { clearInterval(frameTimer.current); frameTimer.current = null; }
    if (autoTimer.current != null) { clearTimeout(autoTimer.current); autoTimer.current = null; }
  }

  useEffect(() => clearTimers, []);

  function stop(commit: boolean) {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    clearTimers();
    setHolding(false);
    setHoldMs(0);
    stateRef.current.onHoldChange?.(false);
    if (commit && !committedRef.current && !stateRef.current.disabled && !stateRef.current.committing) {
      committedRef.current = true;
      stateRef.current.onCommit();
    }
  }

  function start() {
    if (stateRef.current.disabled || stateRef.current.committing || holdingRef.current) return;
    clearTimers(); // defensive: never stack a second interval set on a leaked one
    holdingRef.current = true;
    committedRef.current = false;
    startRef.current = Date.now();
    setHolding(true);
    setHoldMs(0);
    stateRef.current.onHoldChange?.(true);
    try { navigator.vibrate?.(25); } catch { /* noop */ }
    stateRef.current.onTick?.();
    // ~11 faces/sec feels like rattling without thrashing React.
    tickTimer.current = window.setInterval(() => {
      stateRef.current.onTick?.();
      try { navigator.vibrate?.(8); } catch { /* noop */ }
    }, 90);
    frameTimer.current = window.setInterval(() => setHoldMs(Date.now() - startRef.current), 50);
    autoTimer.current = window.setTimeout(() => stop(true), MAX_HOLD_MS);
  }

  const charge = Math.min(1, holdMs / CHARGE_MS);

  return (
    <div>
      <motion.button
        type="button"
        disabled={disabled || committing}
        whileTap={{ scale: 0.97 }}
        animate={holding ? { scale: [1, 1.03, 1] } : { scale: 1 }}
        transition={holding ? { duration: 0.5, repeat: Infinity } : { duration: 0.15 }}
        onPointerDown={(e) => {
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
          start();
        }}
        onPointerUp={() => stop(true)}
        onPointerCancel={() => stop(true)}
        onLostPointerCapture={() => stop(true)}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(true); }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="btn-gold relative w-full overflow-hidden rounded-2xl py-5 text-2xl disabled:opacity-60"
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
        aria-label="Press and hold to shake the dice, release to roll"
      >
        {/* charge fill while held */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-white/30 transition-[width] duration-75"
          style={{ width: holding ? `${Math.round(charge * 100)}%` : '0%' }}
        />
        <span className="relative">
          {committing ? '🎲 Rolling…' : holding ? '🎲 Shaking… release to ROLL!' : bonus ? '🎲 ROLL AGAIN (doubles!)' : '🎲 HOLD TO SHAKE — release to roll'}
        </span>
      </motion.button>
      <div className="mt-1 text-center text-xs text-white/50" aria-hidden>
        {holding ? 'Release to throw the dice' : 'Press & hold to rattle · quick tap also rolls'}
      </div>
    </div>
  );
}
