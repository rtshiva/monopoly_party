import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { debugBuffer } from '../debug';

/**
 * Floating diagnostics overlay, enabled with ?debug=1. Shows connection,
 * room rev/turn (join key for the server journal), and the recent client
 * event buffer. Leave it on during game night; screenshot it with any bug
 * report together with GET /api/debug/summary.
 */
export function DebugPanel() {
  const { room } = useGame();
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const entries = debugBuffer();
  return (
    <div className="mt-2 max-h-56 overflow-auto rounded-2xl border border-fuchsia-300/40 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-fuchsia-100">
      <div className="font-bold text-fuchsia-300">
        🐞 debug · room {room?.code ?? '—'} · rev {room?.rev ?? '—'} · turn #{room?.turnCount ?? '—'} · {room?.status ?? '—'}
      </div>
      {entries.length === 0 && <div className="opacity-60">no events yet — roll, bid, switch tabs…</div>}
      {entries.map((e, i) => (
        <div key={i} className="whitespace-pre-wrap break-words">
          <span className="opacity-50">{new Date(e.at).toLocaleTimeString()}</span> <b>{e.evt}</b> {e.msg}
        </div>
      ))}
    </div>
  );
}
