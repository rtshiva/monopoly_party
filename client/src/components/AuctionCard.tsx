import { useEffect, useRef, useState } from 'react';
import { BOARD, type Player, type RoomState } from '@monopoly/shared';
import { minNextBid, nameOf, outbidBy, topBid } from '../auctionNotify';
import { TurnCountdown } from './TurnCountdown';
import { haptic } from '../haptics';
import { sndError } from '../sound';

export interface AuctionCardProps {
  room: RoomState;
  me: Player;
  emit: (ev: string, extra?: Record<string, unknown>, onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void) => void;
}

export function AuctionCard({ room, me, emit }: AuctionCardProps) {
  const [amount, setAmount] = useState('');
  const a = room.auction!;
  const top = topBid(a);
  const minNext = minNextBid(a);
  const outbid = outbidBy(a, me.id);
  const prevOutbidRef = useRef<string | null>(null);

  useEffect(() => {
    if (outbid && prevOutbidRef.current !== outbid) {
      haptic([60, 40, 60]);
      sndError();
    }
    prevOutbidRef.current = outbid;
  }, [outbid]);

  function bid(v: number) {
    // Keep the typed amount when the server rejects (e.g. outbid mid-tap) —
    // clearing it destroys the user's work for no reason.
    emit('auctionBid', { amount: v }, () => setAmount(''));
  }

  const pastAuctions = room.log.filter((l) => l.text.toLowerCase().includes('auction'));

  return (
    <div className="glass rounded-2xl border-amber-300/50 p-3 text-center">
      <div className="flex items-center justify-center gap-2 font-bold">
        🔨 Auction: {BOARD[a.tile]?.name}
        <TurnCountdown deadline={a.endsAt} className="rounded-full bg-amber-300/20 px-2 py-0.5 font-mono text-xs text-amber-200" />
      </div>
      <div className="text-sm text-white/70">
        {top ? <>Top: <b className="text-emerald-300">${top.amount}</b> ({nameOf(room, top.playerId)})</> : 'No bids yet — min $10'}
      </div>
      {outbid && (
        <div className="mt-1 rounded-xl bg-rose-500/20 px-2 py-1 text-sm font-bold text-rose-200">
          Outbid by {nameOf(room, outbid)} — bid ${minNext}+ to retake!
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder={`${minNext}`}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-mono outline-none"
        />
        <button
          onClick={() => bid(Math.max(minNext, Number(amount) || 0))}
          className="rounded-xl bg-amber-300 px-4 py-2 font-extrabold text-black"
        >
          Bid
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[10, 25, 50, 100].map((d) => {
          const target = Math.max(minNext, (top?.amount ?? 0) + d);
          const canAfford = me.cash >= target;
          return (
            <button
              key={d}
              type="button"
              disabled={!canAfford}
              onClick={() => { haptic(25); bid(target); }}
              className={`rounded-xl py-1.5 text-xs font-bold transition-all ${
                canAfford
                  ? 'bg-white/10 hover:bg-white/20 active:scale-95 text-white'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              }`}
            >
              +${d} <span className="block text-[10px] opacity-70 font-mono">${target}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-xs text-white/50">
        Your cash: <span className="font-mono font-bold text-white/80">${me.cash}</span> · highest bid wins at zero
      </div>

      {pastAuctions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 text-left">
          <details className="group">
            <summary className="text-[11px] font-bold text-amber-200/80 hover:text-amber-200 cursor-pointer flex items-center justify-between">
              <span>📜 Match Auction History ({pastAuctions.length})</span>
              <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
            </summary>
            <div className="mt-1.5 max-h-28 overflow-y-auto space-y-1 pr-1">
              {pastAuctions.map((item) => (
                <div key={item.id} className="rounded-lg bg-black/30 px-2 py-1 text-[10px] text-white/70">
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
