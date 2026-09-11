import { BOARD, COLOR_HEX, TOKENS } from '@monopoly/shared';
import type { RoomState } from '@monopoly/shared';
import { BOARD_THEMES } from './boardThemes';
import { ThemeArt } from './ThemeArt';
import { StageBar } from './StageBar';

/** Classic 11x11 perimeter: index 0 (GO) bottom-right, clockwise. */
function tileToRC(i: number): [number, number] {
  if (i <= 10) return [10, 10 - i];
  if (i <= 19) return [10 - (i - 10), 0];
  if (i <= 30) return [0, i - 20];
  return [i - 30, 10];
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

/**
 * Themed classic board: light track-inspired skin, our streets and rules.
 * Tiles stay upright everywhere for TV readability.
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
            const corner = t.kind === 'go' || t.kind === 'jail' || t.kind === 'parking' || t.kind === 'gotojail'
              ? CORNER_STYLE[t.kind]
              : null;
            const here = room.players.filter((p) => !p.bankrupt && p.position === i);
            const owner = room.players.find((p) => p.properties.includes(i));
            const isPending = room.pendingBuy === i;
            const color = t.kind === 'property' ? COLOR_HEX[t.color] : undefined;
            const level = room.buildings[i] ?? 0;
            const mortgaged = !!owner && owner.mortgaged.includes(i);
            const inTrade = room.trades.some((o) => o.giveTiles.includes(i) || o.wantTiles.includes(i));
            const inAuction = room.auction?.tile === i;
            const isCurrentTurn = room.status === 'playing' && room.players[room.turnIndex % room.players.length]?.position === i;
            return (
              <div
                key={i}
                style={{ gridRow: r + 1, gridColumn: c + 1, background: corner ? corner.bg : theme.tileBg, color: theme.ink }}
                className={`relative overflow-hidden rounded-[7px] p-[3px] text-[10px] leading-tight lg:text-[11px] ${isPending ? 'ring-2 ring-amber-500 animate-pulse' : ''} ${isCurrentTurn ? 'ring-2 ring-sky-500' : ''}`}
                title={t.name}
              >
                {color && <div className="absolute inset-x-0 top-0 h-[5px]" style={{ background: color }} />}
                {corner && <div className="absolute right-[1px] top-[1px] text-[11px]">{corner.icon}</div>}
                <div className="mt-[4px] truncate font-bold">{t.name}</div>
                <div style={{ color: theme.subInk }}>
                  {t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility'
                    ? `$${(t as { price: number }).price}`
                    : t.kind === 'tax' ? `-$${(t as { amount: number }).amount}`
                    : t.kind === 'go' ? '+$200' : KIND_LABEL[t.kind] ?? t.kind}
                </div>
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
