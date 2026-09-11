import { useEffect, useState } from 'react';

/** Live 1s-tick countdown to a turn deadline. Renders nothing without one. */
export function TurnCountdown({ deadline, className = '' }: { deadline: number | null; className?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline == null) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (deadline == null) return null;
  const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  return <span className={className}>⏱ {secs}s</span>;
}
