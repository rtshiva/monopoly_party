import { useEffect, useState } from 'react';
import { BOARD, type RoomState } from '@monopoly/shared';

export interface HostAuctionPanelProps {
  room: RoomState;
}

export function HostAuctionPanel({ room }: HostAuctionPanelProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const a = room.auction!;
  const secs = Math.max(0, Math.round((a.endsAt - Date.now()) / 1000));
  const top = [...a.bids].sort((x, y) => y.amount - x.amount)[0];
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? '?';
  const pastAuctions = room.log.filter((l) => l.text.toLowerCase().includes('auction'));

  return (
    <div className="glass mt-3 rounded-3xl border-2 border-amber-300/60 p-4 text-center shadow-[0_0_20px_rgba(251,191,36,0.2)]">
      <div className="flex items-center justify-center gap-3">
        <span className={`text-2xl ${secs <= 5 ? 'animate-bounce' : ''}`}>🔨</span>
        <div className="font-display text-lg font-bold">
          Auction: {BOARD[a.tile]?.name}
        </div>
        <div className="relative flex items-center justify-center w-8 h-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke={secs <= 5 ? '#f43f5e' : '#f59e0b'}
              strokeWidth="3.5"
              strokeDasharray={94.2}
              strokeDashoffset={94.2 * (1 - Math.min(1, secs / 30))}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <span className={`absolute font-mono text-xs font-black ${secs <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-200'}`}>
            {secs}
          </span>
        </div>
      </div>
      <div className="mt-1 text-sm text-white/80">
        {top ? (
          <>
            Top bid <b className="text-emerald-300 font-mono">${top.amount}</b> by <b>{nameOf(top.playerId)}</b> ({a.bids.length} bid{a.bids.length === 1 ? '' : 's'})
          </>
        ) : (
          'No bids yet — open your phone to bid!'
        )}
      </div>
      {pastAuctions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 text-left">
          <details className="group">
            <summary className="text-xs font-semibold text-amber-200/80 hover:text-amber-200 cursor-pointer flex items-center justify-between">
              <span>📜 Match Auction History ({pastAuctions.length})</span>
              <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
            </summary>
            <div className="mt-1.5 max-h-24 overflow-y-auto space-y-1 text-xs text-white/70">
              {pastAuctions.map((item) => (
                <div key={item.id} className="rounded-lg bg-black/20 px-2 py-0.5">
                  • {item.text}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
