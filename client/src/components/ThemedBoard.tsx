import { BOARD, COLOR_HEX, TOKENS, tileCell } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { BOARD_THEMES, type BoardTheme } from './boardThemes';
import { ThemeArt, TitleBadge } from './ThemeArt';
import { StageBar } from './StageBar';

/** Classic 11x11 perimeter: index 0 (GO) top-left, clockwise. */
function tileToRC(i: number): [number, number] {
  const { col, row } = tileCell(i);
  return [row, col];
}

const CORNER_STYLE: Record<string, { bg: string; icon: string }> = {
  go: { bg: '#dcfce7', icon: '🏁' },
  jail: { bg: '#ffedd5', icon: '🔒' },
  parking: { bg: '#dbeafe', icon: '🅿️' },
  gotojail: { bg: '#fee2e2', icon: '🚔' },
};

type CornerKind = 'go' | 'jail' | 'parking' | 'gotojail';
const isCornerKind = (k: string): k is CornerKind =>
  k === 'go' || k === 'jail' || k === 'parking' || k === 'gotojail';

const KIND_LABEL: Record<string, string> = {
  chance: 'Chance ?', chest: 'Chest', jail: 'Just Visiting', parking: 'Free Parking', gotojail: 'Go To Jail',
};

/** Which quadrant of the corner sheet belongs in each corner cell. */
const CORNER_QUADRANT: Record<'go' | 'jail' | 'parking' | 'gotojail', string> = {
  go: '0% 0%',
  jail: '100% 0%',
  parking: '100% 100%',
  gotojail: '0% 100%',
};

/** Shared tile content. Card mode paints the light tile; art mode paints dark
 *  chips readable over generated corner backgrounds. */
function TileFace({ i, room, theme, onArt }: { i: number; room: RoomState; theme: BoardTheme; onArt: boolean }) {
  const t = BOARD[i];
  const here = room.players.filter((p) => !p.bankrupt && p.position === i);
  const owner = room.players.find((p) => p.properties.includes(i));
  const level = room.buildings[i] ?? 0;
  const mortgaged = !!owner && owner.mortgaged.includes(i);
  const inTrade = room.trades.some((o) => o.giveTiles.includes(i) || o.wantTiles.includes(i));
  const inAuction = room.auction?.tile === i;
  const color = t.kind === 'property' ? COLOR_HEX[t.color] : undefined;
  const sub = t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility'
    ? `$${(t as { price: number }).price}`
    : t.kind === 'tax' ? `-$${(t as { amount: number }).amount}`
    : t.kind === 'go' ? '+$200' : KIND_LABEL[t.kind] ?? t.kind;
  if (onArt) {
    return (
      <>
        {color && <div className="mb-[1px] h-[5px] rounded-sm" style={{ background: color }} />}
        <div className="truncate rounded bg-black/55 px-1 text-[10px] font-bold text-white lg:text-[11px]">{t.name}</div>
        <div className="mt-[1px] inline-block rounded bg-black/55 px-1 text-[10px] text-amber-200">{sub}</div>
        {level > 0 && <div>{level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}</div>}
        {here.length > 0 && (
          <div className="flex flex-wrap gap-[1px] text-[11px]">
            {here.slice(0, 4).map((p) => (
              <span key={p.id} title={p.name}>{TOKENS[p.token]}</span>
            ))}
          </div>
        )}
        <div className="mt-[1px] flex items-center gap-1">
          {owner && (
            <span className={`rounded-full px-1 text-[8px] font-extrabold ${mortgaged ? 'bg-zinc-500 text-white' : 'bg-amber-300 text-black'}`}>
              {mortgaged ? 'M' : owner.name.slice(0, 6)}
            </span>
          )}
          {(inAuction || inTrade) && <span className="text-[9px]">{inAuction ? '🔨' : '🤝'}</span>}
        </div>
      </>
    );
  }
  const corner = isCornerKind(t.kind) ? CORNER_STYLE[t.kind] : null;
  return (
    <>
      {color && <div className="absolute inset-x-0 top-0 h-[5px]" style={{ background: color }} />}
      {corner && <div className="absolute right-[1px] top-[1px] text-[11px]">{corner.icon}</div>}
      <div className="mt-[4px] truncate font-bold">{t.name}</div>
      <div style={{ color: theme.subInk }}>{sub}</div>
      {level > 0 && <div>{level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}</div>}
      {here.length > 0 && (
        <div className="flex flex-wrap gap-[1px] text-[11px]">
          {here.slice(0, 4).map((p) => (
            <span key={p.id} title={p.name}>{TOKENS[p.token]}</span>
          ))}
        </div>
      )}
      <div className="mt-[1px] flex items-center gap-1">
        {owner && (
          <span className={`rounded-full px-1 text-[8px] font-extrabold ${mortgaged ? 'bg-zinc-500 text-white' : 'bg-amber-300 text-black'}`}>
            {mortgaged ? 'M' : owner.name.slice(0, 6)}
          </span>
        )}
        {(inAuction || inTrade) && <span className="text-[9px]">{inAuction ? '🔨' : '🤝'}</span>}
      </div>
    </>
  );
}

/**
 * Themed classic board: uniform 11x11 grid, always aligned by construction.
 * Generated art appears only as *cell backgrounds* (center + four corners),
 * so there is nothing to calibrate, ever. All game data stays live HTML.
 */
export function ThemedBoard({ room }: { room: RoomState }) {
  const theme = BOARD_THEMES[room.boardStyle] ?? BOARD_THEMES.grandprix;
  return (
    <div className="select-none">
      <StageBar room={room} />
      <div className="rounded-3xl p-2 shadow-xl" style={{ background: theme.boardBg }}>
        <div className="grid grid-cols-11 grid-rows-11 gap-[3px]">
          {BOARD.map((t, i) => {
            const [r, c] = tileToRC(i);
            const isPending = room.pendingBuy === i;
            const isCurrentTurn = room.status === 'playing' && room.players[room.turnIndex % room.players.length]?.position === i;
            const corner = isCornerKind(t.kind) ? CORNER_STYLE[t.kind] : null;
            const quad = isCornerKind(t.kind) && theme.cornerSheet ? CORNER_QUADRANT[t.kind] : undefined;
            const street = !quad && t.kind === 'property' && t.color !== 'none' ? theme.tileArt?.[t.color] : undefined;
            const onArtBg = !!(quad || street);
            return (
              <div
                key={i}
                style={{
                  gridRow: r + 1,
                  gridColumn: c + 1,
                  background: onArtBg ? undefined : corner ? corner.bg : theme.tileBg,
                  color: theme.ink,
                  ...(quad && theme.cornerSheet
                    ? { backgroundImage: `url("${theme.cornerSheet}")`, backgroundSize: '200% 200%', backgroundPosition: quad }
                    : street
                      ? { backgroundImage: `url("${street}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : {}),
                }}
                className={`relative overflow-hidden rounded-[7px] p-[3px] text-[10px] leading-tight lg:text-[11px] ${isPending ? 'ring-2 ring-amber-500 animate-pulse' : ''} ${isCurrentTurn ? 'ring-2 ring-sky-500' : ''}`}
                title={t.name}
              >
                {onArtBg && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />}
                <div className="relative h-full">
                  <TileFace i={i} room={room} theme={theme} onArt={onArtBg} />
                </div>
              </div>
            );
          })}
          <div
            style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}
            className="overflow-hidden rounded-2xl"
          >
            <ThemeArt theme={theme} />
          </div>
        </div>
      </div>
    </div>
  );
}
