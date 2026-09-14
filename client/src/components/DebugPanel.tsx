import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { clearDebugBuffer, debugBuffer } from '../debug';

/**
 * Floating diagnostics overlay, now enabled by default. Shows connection,
 * room rev/turn (join key for the server journal), and the recent client
 * event buffer. Can be collapsed to a compact bar or expanded to read all entries.
 */
export function DebugPanel() {
  const { room } = useGame();
  const [collapsed, setCollapsed] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const entries = debugBuffer();
  return (
    <div className="mt-2 rounded-2xl border border-fuchsia-300/40 bg-black/75 p-2.5 font-mono text-[11px] leading-relaxed text-fuchsia-100 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 font-bold text-fuchsia-300">
        <div className="truncate">
          🐞 debug · room {room?.code ?? '—'} · rev {room?.rev ?? '—'} · #{room?.turnCount ?? '—'} · {room?.status ?? '—'}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="rounded bg-fuchsia-400/20 px-2 py-0.5 text-fuchsia-200 hover:bg-fuchsia-400/30"
          >
            {collapsed ? '➕ expand' : '➖ collapse'}
          </button>
          {!collapsed && entries.length > 0 && (
            <button
              type="button"
              onClick={() => { clearDebugBuffer(); setTick((n) => n + 1); }}
              className="rounded bg-white/10 px-1.5 py-0.5 text-white/60 hover:text-white"
            >
              clear
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="mt-2 max-h-48 overflow-auto space-y-1 pr-1 border-t border-fuchsia-300/20 pt-1.5">
          {entries.length === 0 && <div className="opacity-60">no events yet — roll, bid, switch tabs…</div>}
          {entries.map((e, i) => (
            <div key={i} className="whitespace-pre-wrap break-words border-b border-white/5 pb-0.5">
              <span className="opacity-50">{new Date(e.at).toLocaleTimeString()}</span> <b>{e.evt}</b> {e.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
