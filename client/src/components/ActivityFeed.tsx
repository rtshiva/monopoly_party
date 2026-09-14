import { useState } from 'react';
import type { LogCat, RoomState } from '@monopoly/shared';

const FILTERS: Array<{ id: LogCat | 'all'; label: string }> = [
  { id: 'all', label: 'All Events' },
  { id: 'move', label: 'Moves' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'trade', label: 'Trades' },
  { id: 'build', label: 'Builds' },
  { id: 'money', label: 'Money' },
];

const CAT_ICON: Record<LogCat, string> = {
  move: '🎲',
  purchase: '🛒',
  trade: '🤝',
  build: '🏠',
  money: '💸',
  info: '•',
};

/** Full-bleed activity feed: turn-grouped timeline with category filters. */
export function ActivityFeed({ room, live }: { room: RoomState; live: boolean }) {
  const [filter, setFilter] = useState<LogCat | 'all'>('all');

  const catOf = (l: RoomState['log'][number]): LogCat =>
    l.cat ?? (l.tone === 'money' ? 'money' : 'info');

  const entries = room.log
    .slice(0, 60)
    .filter((l) => filter === 'all' || catOf(l) === filter);

  const timeOf = (at: number) =>
    new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // The log is newest-first: group consecutive entries from the same turn.
  const groups: Array<{ key: string; title: string; items: typeof entries }> = [];
  for (const l of entries) {
    const turn = l.turn ?? -1;
    const key = turn < 0 ? 'old' : `t${turn}`;
    const title = turn <= 0 ? '🏟️ Lobby & earlier' : `Turn ${turn}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(l);
    else groups.push({ key, title, items: [l] });
  }

  return (
    <div className="mt-2">
      <div className="glass flex items-center gap-2 rounded-2xl p-3">
        <div className="font-display flex-1 font-bold">📜 Game Activity</div>
        {live ? (
          <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-bold text-emerald-200">🟢 Live</span>
        ) : (
          <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-bold text-amber-200">🔄 Syncing…</span>
        )}
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${filter === f.id ? 'bg-amber-300 text-black' : 'bg-white/10'}`}>
            {f.label}</button>
        ))}
      </div>
      {entries.length === 0 && (
        <div className="mt-2 rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">
          No events here yet — rolls, buys and trades will appear live.
        </div>
      )}
      {groups.map((g) => (
        <div key={`${g.key}-${filter}`} className="mt-3">
          <div className="mb-1 text-sm font-bold text-amber-200">{g.title}</div>
          <div className="space-y-1 border-l-2 border-white/10 pl-2">
            {g.items.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-1.5 text-sm text-white/80">
                <span className="shrink-0 font-mono text-xs text-white/40">{timeOf(l.at)}</span>
                <span className="shrink-0">{CAT_ICON[catOf(l)]}</span>
                <span className="flex-1">{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
