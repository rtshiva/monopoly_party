import { BOARD, COLOR_HEX, DEFAULT_BOARD_STYLE } from '@monopoly/shared';
import { useGame } from '../store';
import { useDiscoveredThemes } from '../useThemes';
import { themeFor, type BoardTheme, type TileArtKey } from './boardThemes';

/**
 * Tile thumbnail showing color band, theme background artwork (if available in
 * current board theme), and emoji icon. Upgrades thumbnails across the phone UI.
 */
export function TileArt({
  tile,
  size = 44,
  theme: propTheme,
}: {
  tile: number;
  size?: number;
  theme?: BoardTheme;
}) {
  const room = useGame((s) => s.room);
  const discovered = useDiscoveredThemes();
  const theme = propTheme ?? themeFor(room?.boardStyle ?? DEFAULT_BOARD_STYLE, discovered);

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

  const artKey: TileArtKey | undefined = t?.kind === 'property'
    ? (t.color !== 'none' ? t.color : undefined)
    : t?.kind;
  const art = artKey ? theme?.tileArt?.[artKey] : undefined;

  return (
    <div
      className="relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-white/20 bg-black/40 shadow-inner"
      style={{
        width: size,
        height: size,
        ...(art ? { backgroundImage: `url("${art}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
      }}
      aria-hidden
    >
      <div style={{ background: band, height: Math.max(5, Math.round(size / 7)) }} />
      {art && <div className="absolute inset-0 bg-black/35" />}
      <div className="relative flex flex-1 items-center justify-center font-bold drop-shadow" style={{ fontSize: Math.round(size / 2.4) }}>
        {icon}
      </div>
    </div>
  );
}
