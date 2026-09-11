import { BOARD, COLOR_HEX, TOKENS, tileCell, tileRect } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { BOARD_THEMES, type BoardTheme } from './boardThemes';
import { BOARD_SKINS } from './boardSkins';
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

const KIND_LABEL: Record<string, string> = {
  chance: 'Chance ?', chest: 'Chest', jail: 'Just Visiting', parking: 'Free Parking', gotojail: 'Go To Jail',
};

/** Shared tile content. Card mode paints the light tile; overlay mode paints
 *  dark chips readable on any generated background (seamless across skins). */
function TileFace({ i, room, theme, overlay }: { i: number; room: RoomState; theme: BoardTheme; overlay: boolean }) {
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
  if (overlay) {
    return (
      <>
        {/* Option B: color bands are always HTML (exact colors/geometry, no AI drift) */}
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
  const corner = t.kind === 'go' || t.kind === 'jail' || t.kind === 'parking' || t.kind === 'gotojail'
    ? CORNER_STYLE[t.kind]
    : null;
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
 * Themed classic board. Without a generated image: light tiles + SVG center
 * (works today). With `skin.image`: the image fills the board and every tile
 * renders as an overlay at its calibrated rect — names, prices, tokens,
 * houses all stay live HTML. `?calibrate=1` draws index outlines for tuning.
 */
export function ThemedBoard({ room }: { room: RoomState }) {
  const theme = BOARD_THEMES[room.boardStyle] ?? BOARD_THEMES.grandprix;
  const skin = BOARD_SKINS[room.boardStyle] ?? BOARD_SKINS.grandprix;
  const calibrate = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('calibrate') === '1';

  if (!skin.image) {
    return (
      <div className="select-none">
        <StageBar room={room} />
        <div className="rounded-3xl p-2 shadow-xl" style={{ background: theme.boardBg }}>
          <div className="grid grid-cols-11 grid-rows-11 gap-[3px]">
            {BOARD.map((t, i) => {
              const [r, c] = tileToRC(i);
              const isPending = room.pendingBuy === i;
              const isCurrentTurn = room.status === 'playing' && room.players[room.turnIndex % room.players.length]?.position === i;
              const corner = t.kind === 'go' || t.kind === 'jail' || t.kind === 'parking' || t.kind === 'gotojail'
                ? CORNER_STYLE[t.kind]
                : null;
              return (
                <div
                  key={i}
                  style={{ gridRow: r + 1, gridColumn: c + 1, background: corner ? corner.bg : theme.tileBg, color: theme.ink }}
                  className={`relative overflow-hidden rounded-[7px] p-[3px] text-[10px] leading-tight lg:text-[11px] ${isPending ? 'ring-2 ring-amber-500 animate-pulse' : ''} ${isCurrentTurn ? 'ring-2 ring-sky-500' : ''}`}
                  title={t.name}
                >
                  <TileFace i={i} room={room} theme={theme} overlay={false} />
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

  return (
    <div className="select-none">
      <StageBar room={room} />
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl shadow-xl">
        <img src={skin.image} alt={`${theme.name} board`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        {BOARD.map((_, i) => {
            const rect = tileRect(i, skin.bounds);
          const isPending = room.pendingBuy === i;
          const isCurrentTurn = room.status === 'playing' && room.players[room.turnIndex % room.players.length]?.position === i;
          const { col, row } = tileCell(i);
          return (
            <div
              key={i}
              style={rect}
              title={BOARD[i].name}
              className={`absolute p-[2px] ${isPending ? 'rounded bg-amber-300/30 ring-2 ring-amber-300 animate-pulse' : ''} ${isCurrentTurn ? 'rounded ring-2 ring-sky-300' : ''} ${calibrate ? 'outline outline-2 outline-red-500' : ''}`}
            >
              {calibrate && <div className="bg-red-500 font-mono text-[9px] text-white">#{i} {col},{row}</div>}
              <TileFace i={i} room={room} theme={theme} overlay />
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-x-0 bottom-[11%] flex justify-center">
          <TitleBadge name={theme.name} tagline={theme.tagline} />
        </div>
      </div>
    </div>
  );
}
