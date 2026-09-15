import { useEffect, useRef, useState } from 'react';

/**
 * Live 1s-tick countdown to a turn deadline. Renders nothing without one.
 * onZero fires once when the clock hits zero — phones use it to expire
 * local actions (the server resolve lands ~0.5s+ later, and the turn must
 * not look playable in between). TV usage omits it.
 */
export function TurnCountdown({ deadline, className = '', onZero }: {
  deadline: number | null; className?: string; onZero?: () => void;
}) {
  const [, setTick] = useState(0);
  const fired = useRef(false);
  useEffect(() => {
    if (deadline == null) return;
    fired.current = false;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const secs = deadline == null ? null : Math.max(0, Math.round((deadline - Date.now()) / 1000));
  useEffect(() => {
    if (secs !== null && secs <= 0 && !fired.current) {
      fired.current = true;
      onZero?.();
    }
  }, [secs, onZero]);
  const isUrgent = secs !== null && secs <= 5;
  return (
    <span
      className={`${className} transition-colors ${
        isUrgent ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.6)]' : ''
      }`}
    >
      ⏱ {secs}s
    </span>
  );
}
