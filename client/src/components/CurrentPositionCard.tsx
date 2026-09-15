import { BOARD, tilePrice, type Player, type RoomState } from '@monopoly/shared';
import { TileArt } from './TileArt';
import { type BoardTheme, type TileArtKey } from './boardThemes';
import { getSetProgress } from './propsHelper';

export interface CurrentPositionCardProps {
  me: Player;
  room: RoomState;
  myTile: (typeof BOARD)[number];
  tileRent: number;
  tileDetail: string;
  isMine: boolean;
  isMyTurn: boolean;
  ownerName?: string | null;
  theme: BoardTheme;
}

export function CurrentPositionCard({
  me,
  room,
  myTile,
  tileRent,
  tileDetail,
  isMine,
  isMyTurn,
  ownerName,
  theme,
}: CurrentPositionCardProps) {
  const currentArtKey: TileArtKey | undefined = myTile.kind === 'property'
    ? (myTile.color !== 'none' ? myTile.color : undefined)
    : (myTile.kind === 'railroad' || myTile.kind === 'utility') ? myTile.kind : undefined;
  const currentArtUrl = currentArtKey ? theme.tileArt?.[currentArtKey] : undefined;
  const currentSetProgress = (myTile.kind === 'property' || myTile.kind === 'railroad' || myTile.kind === 'utility')
    ? getSetProgress(me.position, room, me) : null;

  return (
    <div
      className="relative mt-2 overflow-hidden rounded-2xl border border-white/15 p-3 shadow-lg"
      style={{
        ...(currentArtUrl
          ? { backgroundImage: `url("${currentArtUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: 'rgba(255, 255, 255, 0.05)' }),
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/80 to-black/85 backdrop-blur-[2px]" />
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <TileArt tile={me.position} size={56} />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/50">Current Position</div>
            <div className="font-bold truncate">📍 {myTile.name}</div>
            {(myTile.kind === 'property' || myTile.kind === 'railroad' || myTile.kind === 'utility') ? (
              <div className="text-xs text-white/70">
                Price ${tilePrice(me.position)} · Rent ${tileRent} · Owner {isMine ? 'You' : (ownerName ?? '—')}
              </div>
            ) : (
              <div className="text-xs text-white/70">{tileDetail}</div>
            )}
          </div>
          {isMine ? (
            <span className="rounded-lg bg-sky-300/20 border border-sky-300/30 px-2 py-1 text-xs font-bold text-sky-200 shrink-0">
              🏠 Your Property
            </span>
          ) : room.pendingBuy === me.position && isMyTurn ? (
            <span className="rounded-lg bg-amber-300/20 border border-amber-300/30 px-2 py-1 text-xs font-bold text-amber-200 shrink-0">
              🏷️ For Sale
            </span>
          ) : ownerName ? (
            <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white/70 shrink-0">
              {ownerName}'s
            </span>
          ) : null}
        </div>

        {/* Strategic Set Advice */}
        {currentSetProgress && currentSetProgress.total > 1 && (
          <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5 text-xs">
            {currentSetProgress.isComplete ? (
              <span className="rounded-md bg-emerald-400/20 border border-emerald-400/30 px-2 py-0.5 font-bold text-emerald-200">
                ⭐ Complete monopoly! (${tileRent} rent)
              </span>
            ) : isMine ? (
              <span className="rounded-md bg-sky-400/20 border border-sky-400/30 px-2 py-0.5 font-bold text-sky-200">
                You own {currentSetProgress.owned}/{currentSetProgress.total} in this group
              </span>
            ) : currentSetProgress.owned > 0 ? (
              <span className="rounded-md bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 font-bold text-amber-200">
                ✨ You own {currentSetProgress.owned}/{currentSetProgress.total} · Buying completes {currentSetProgress.owned + 1}/{currentSetProgress.total}!
              </span>
            ) : ownerName ? (
              <span className="rounded-md bg-rose-400/20 border border-rose-400/30 px-2 py-0.5 font-bold text-rose-200">
                ⚠️ Owned by {ownerName}
              </span>
            ) : (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-white/70">
                Unowned deed ({currentSetProgress.total} in set)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
