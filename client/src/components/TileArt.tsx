import { BOARD, COLOR_HEX } from '@monopoly/shared';

/**
 * Offline-first tile thumbnail placeholder (no image assets needed).
 * Color band + emoji per tile kind, matching the dark glass theme.
 * When real tile art lands in client/public/tiles/, swap the inner emoji
 * for an <img> here — every consumer (trade, position card, deed rows)
 * upgrades at once.
 */
export function TileArt({ tile, size = 44 }: { tile: number; size?: number }) {
  const t = BOARD[tile];
  let band = '#64748b';
  let icon = '❓';
  if (t?.kind === 'property') { band = COLOR_HEX[t.color] ?? '#64748b'; icon = '🏠'; }
  else if (t?.kind === 'railroad') { band = '#94a3b8'; icon = '🚂'; }
  else if (t?.kind === 'utility') { band = '#fbbf24'; icon = '💡'; }
  else if (t?.kind === 'chance') { band = '#c084fc'; icon = '🃏'; }
  else if (t?.kind === 'chest') { band = '#34d399'; icon = '🎁'; }
  else if (t?.kind === 'tax') { band = '#fb7185'; icon = '🧾'; }
  else if (t?.kind === 'gotojail') { band = '#fb7185'; icon = '🚔'; }
  else if (t?.kind === 'jail') { band = '#94a3b8'; icon = '🔒'; }
  else if (t?.kind === 'parking') { band = '#38bdf8'; icon = '🅿️'; }
  else if (t?.kind === 'go') { band = '#4ade80'; icon = '🟢'; }
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-black/40"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div style={{ background: band, height: Math.max(5, Math.round(size / 7)) }} />
      <div className="flex flex-1 items-center justify-center" style={{ fontSize: Math.round(size / 2.4) }}>{icon}</div>
    </div>
  );
}
