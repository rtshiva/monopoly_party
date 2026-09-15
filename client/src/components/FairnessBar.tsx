export interface FairnessBarProps {
  giveVal: number;
  getVal: number;
  fairTol: number;
}

export function FairnessBar({ giveVal, getVal, fairTol }: FairnessBarProps) {
  const total = giveVal + getVal;
  if (total === 0) return null;
  const givePct = Math.min(95, Math.max(5, Math.round((giveVal / total) * 100)));
  const diff = giveVal - getVal;
  const absDiff = Math.abs(diff);
  const fair = absDiff <= fairTol;
  const favor = diff < 0 ? 'In your favor' : diff > 0 ? 'In their favor' : 'Even trade';

  let statusBg = 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30';
  let barColor = 'bg-emerald-400';
  if (!fair) {
    if (absDiff > fairTol * 2) {
      statusBg = 'bg-rose-500/20 text-rose-200 border-rose-500/30';
      barColor = 'bg-rose-400';
    } else {
      statusBg = 'bg-amber-400/15 text-amber-200 border-amber-400/30';
      barColor = 'bg-amber-400';
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {/* Visual balance bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10 border border-white/10">
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white/40 z-10" />
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${givePct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-white/60">
        <span>Give: <b className="font-mono text-white/80">${giveVal}</b> ({givePct}%)</span>
        <span className="font-semibold text-white/80">{fair ? '⚖️ Balanced' : favor}</span>
        <span>Get: <b className="font-mono text-white/80">${getVal}</b> ({100 - givePct}%)</span>
      </div>
      <div className={`rounded-xl border px-3 py-1.5 text-center text-xs font-bold ${statusBg}`}>
        {fair ? '✅ Fair trade' : `⚠️ Skewed by $${absDiff} (${favor})`}
        <div className="text-[10px] font-normal opacity-80">
          Deed face values + cash · 🃏 cards carry no fixed value
        </div>
      </div>
    </div>
  );
}
