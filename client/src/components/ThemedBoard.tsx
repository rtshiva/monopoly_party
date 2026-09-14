import { BOARD, COLOR_HEX, tileCell } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { themeFor, type BoardTheme, type TileArtKey } from './boardThemes';
import { useDiscoveredThemes } from '../useThemes';
import { ThemeArt, TitleBadge } from './ThemeArt';
import { StageBar } from './StageBar';
import { PlayerTokenGroup } from './PlayerTokenBadge';
import { useAnimatedTokens } from './useAnimatedTokens';
import { BoardTheater } from './BoardTheater';

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

/** Shared tile content. Card mode paints the light tile; art mode paints dark
 *  chips readable over generated backgrounds. */
function TileFace({
  i,
  room,
  theme,
  onArt,
  visualPositions,
  hoppingPlayerId,
  isLandingTile,
}: {
  i: number;
  room: RoomState;
  theme: BoardTheme;
  onArt: boolean;
  visualPositions: Record<string, number>;
  hoppingPlayerId: string | null;
  isLandingTile: boolean;
}) {
  const t = BOARD[i];
  // Calculate players currently visually on this tile
  const here = room.players.filter((p) => !p.bankrupt && (visualPositions[p.id] ?? p.position) === i);
  const activePlayer = room.status === 'playing' ? room.players[room.turnIndex % room.players.length] : null;
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
        {level > 0 && (
          <div className="mt-[1px] inline-block rounded-full bg-emerald-950/70 px-1.5 py-0.5 text-[11px] shadow-[0_0_10px_rgba(52,211,153,0.45)] ring-1 ring-emerald-300/50">
            {level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}
          </div>
        )}
        {here.length > 0 && (
          <div className="mt-[1px]">
            <PlayerTokenGroup
              players={here}
              roomPlayers={room.players}
              activePlayerId={activePlayer ? activePlayer.id : null}
              hoppingPlayerId={hoppingPlayerId}
              isLandingTile={isLandingTile}
            />
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
      {level > 0 && (
        <div className="mt-[1px] inline-block rounded-full bg-emerald-950/70 px-1.5 py-0.5 text-[11px] text-white shadow-[0_0_10px_rgba(52,211,153,0.45)] ring-1 ring-emerald-300/50">
          {level === 5 ? '🏨' : '🏠'.repeat(Math.min(level, 4))}
        </div>
      )}
      {here.length > 0 && (
        <div className="mt-[1px]">
          <PlayerTokenGroup
            players={here}
            roomPlayers={room.players}
            activePlayerId={activePlayer ? activePlayer.id : null}
            hoppingPlayerId={hoppingPlayerId}
            isLandingTile={isLandingTile}
          />
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
  // Subscribes to drop-in discovery: the board re-renders with folder art
  // (e.g. discworld) the moment the list lands, no code changes.
  const discovered = useDiscoveredThemes();
  const theme = themeFor(room.boardStyle, discovered);
  const { visualPositions, hoppingPlayerId, landingBounceTile } = useAnimatedTokens(room);

  return (
    <div className="select-none">
      <StageBar room={room} />
      <div className="rounded-3xl p-2 shadow-xl" style={{ background: theme.boardBg }}>
        <div
          className="grid gap-[3px] aspect-square w-full max-w-[860px] mx-auto"
          style={{
            gridTemplateColumns: 'repeat(11, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(11, minmax(0, 1fr))',
          }}
        >
          {BOARD.map((t, i) => {
            const [r, c] = tileToRC(i);
            const isPending = room.pendingBuy === i;
            const isLanding = landingBounceTile === i;
            const occupied = room.players.some((p) => !p.bankrupt && (visualPositions[p.id] ?? p.position) === i);
            const isCurrentTurn = room.status === 'playing' && (visualPositions[room.players[room.turnIndex % room.players.length]?.id] ?? room.players[room.turnIndex % room.players.length]?.position) === i;
            const corner = isCornerKind(t.kind) ? CORNER_STYLE[t.kind] : null;
            // Every tile kind can carry art: streets by color, everything else by kind.
            const artKey: TileArtKey | undefined = t.kind === 'property'
              ? (t.color !== 'none' ? t.color : undefined)
              : t.kind;
            const art = artKey ? theme.tileArt?.[artKey] : undefined;
            return (
              <div
                key={i}
                style={{
                  gridRow: r + 1,
                  gridColumn: c + 1,
                  background: art ? undefined : corner ? corner.bg : theme.tileBg,
                  color: theme.ink,
                  ...(art ? { backgroundImage: `url("${art}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                }}
                className={`relative overflow-hidden rounded-[7px] p-[2px] min-w-0 min-h-0 flex flex-col justify-between text-[10px] leading-tight lg:text-[11px] transition-shadow ${
                  isPending ? 'ring-2 ring-amber-500 animate-pulse' : ''
                } ${isLanding ? 'ring-2 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]' : ''} ${
                  isCurrentTurn && !isLanding ? 'ring-2 ring-sky-500' : ''
                } ${occupied && !isCurrentTurn && !isLanding ? 'shadow-[0_0_14px_rgba(186,230,253,0.55)]' : ''}`}
                title={t.name}
              >
                {art && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />}
                <div className="relative h-full w-full min-h-0 min-w-0 flex flex-col justify-between overflow-hidden">
                  <TileFace
                    i={i}
                    room={room}
                    theme={theme}
                    onArt={!!art}
                    visualPositions={visualPositions}
                    hoppingPlayerId={hoppingPlayerId}
                    isLandingTile={isLanding}
                  />
                </div>
              </div>
            );
          })}
          <div
            style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}
            className="relative overflow-hidden rounded-2xl"
          >
            <ThemeArt theme={theme} />
            <BoardTheater room={room} />
          </div>
        </div>
      </div>
    </div>
  );
}
