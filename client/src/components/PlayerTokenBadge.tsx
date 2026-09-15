import { TOKENS } from '@monopoly/shared';
import type { Player } from '@monopoly/shared';
import { getPlayerColor } from './playerTokens';

interface PlayerTokenBadgeProps {
  player: Player;
  playerIndex: number;
  isCurrentTurn: boolean;
  isHopping?: boolean;
  isLanding?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * High-visibility 3D token badge with player-specific neon glow,
 * contrasting ring, and turn-beacon highlight.
 */
export function PlayerTokenBadge({
  player,
  playerIndex,
  isCurrentTurn,
  isHopping = false,
  isLanding = false,
  size = 'md',
}: PlayerTokenBadgeProps) {
  const color = getPlayerColor(playerIndex);

  const sizeClasses = {
    sm: 'w-5 h-5 text-[11px]',
    md: 'w-6 h-6 text-[14px]',
    lg: 'w-8 h-8 text-[18px]',
  }[size];

  return (
    <div
      className={`relative flex items-center justify-center select-none ${
        isHopping ? 'animate-token-hop z-30' : isLanding ? 'animate-token-land z-20' : ''
      }`}
      title={`${player.name}${isCurrentTurn ? " (Current Turn)" : ""}`}
    >
      {/* Active Turn Floating Beacon Arrow */}
      {isCurrentTurn && (
        <span
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-black leading-none animate-bounce z-20"
          style={{ color: color.hex, filter: `drop-shadow(0 0 4px ${color.glowRgba})` }}
        >
          ▼
        </span>
      )}

      {/* Token Pedestal Disc with Glow */}
      <div
        className={`relative flex items-center justify-center rounded-full border border-white/40 shadow-lg backdrop-blur-sm transition-transform ${sizeClasses} ${
          isCurrentTurn ? 'scale-110 z-10' : 'z-0'
        }`}
        style={{
          background: `radial-gradient(circle at 35% 30%, ${color.bgRgba} 0%, rgba(15, 23, 42, 0.92) 85%)`,
          boxShadow: isCurrentTurn
            ? `0 0 12px 2px ${color.glowRgba}, 0 2px 5px rgba(0,0,0,0.8)`
            : `0 0 6px 1px ${color.glowRgba}, 0 2px 4px rgba(0,0,0,0.6)`,
          borderColor: color.hex,
        }}
      >
        {/* Token Emoji with Drop Shadow */}
        <span
          className="leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
          style={{
            filter: `drop-shadow(0 0 2px ${color.hex})`,
          }}
        >
          {TOKENS[player.token]}
        </span>
      </div>
    </div>
  );
}

/**
 * Cluster of player token badges for a tile with clean overlapping layout.
 */
export function PlayerTokenGroup({
  players,
  roomPlayers,
  activePlayerId,
  hoppingPlayerId = null,
  isLandingTile = false,
}: {
  players: Player[];
  roomPlayers: Player[];
  activePlayerId: string | null;
  hoppingPlayerId?: string | null;
  isLandingTile?: boolean;
}) {
  if (players.length === 0) return null;

  return (
    <div
      className={`inline-grid items-center justify-center gap-0.5 max-w-full px-1 py-0.5 rounded-xl bg-black/60 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.8)] ring-1 ring-white/20 ${
        players.length >= 3 ? 'grid-cols-2' : 'flex flex-wrap'
      }`}
    >
      {players.slice(0, 4).map((p) => {
        const pIndex = roomPlayers.findIndex((rp) => rp.id === p.id);
        const isCurrentTurn = p.id === activePlayerId;
        const isHopping = p.id === hoppingPlayerId;
        const isLanding = isLandingTile && p.id === activePlayerId;
        return (
          <PlayerTokenBadge
            key={p.id}
            player={p}
            playerIndex={pIndex >= 0 ? pIndex : 0}
            isCurrentTurn={isCurrentTurn}
            isHopping={isHopping}
            isLanding={isLanding}
            size={players.length > 2 ? 'sm' : 'md'}
          />
        );
      })}
      {players.length > 4 && (
        <span className="col-span-2 text-center text-[9px] font-extrabold text-amber-200">
          +{players.length - 4}
        </span>
      )}
    </div>
  );
}
