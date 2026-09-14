import { useEffect, useRef, useState } from 'react';
import type { Player, RoomState } from '@monopoly/shared';
import { sndTick } from '../sound';

/**
 * useAnimatedTokens — Tracks and smoothly animates token positions step-by-step
 * when a player moves across tiles.
 *
 * Rather than instantly jumping from old position to new position, it hops
 * forward tile-by-tile with an optional sound tick and landing bounce.
 */
export function useAnimatedTokens(room: RoomState) {
  // Store displayed positions for all players { [playerId]: tileIndex }
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of room.players) {
      init[p.id] = p.position;
    }
    return init;
  });

  // Track currently hopping players and destination
  const [hoppingPlayerId, setHoppingPlayerId] = useState<string | null>(null);
  const [landingBounceTile, setLandingBounceTile] = useState<number | null>(null);

  // Keep a ref of current target positions from room state
  const prevRoomRef = useRef<RoomState>(room);

  useEffect(() => {
    const prevRoom = prevRoomRef.current;
    prevRoomRef.current = room;

    // Check if any player's server position changed
    for (const p of room.players) {
      const prevP = prevRoom.players.find((rp) => rp.id === p.id);
      const currentVisual = visualPositions[p.id] ?? p.position;
      const target = p.position;

      // New player or reset to 0 upon start/restart
      if (prevP == null || room.status === 'lobby') {
        setVisualPositions((prev) => ({ ...prev, [p.id]: target }));
        continue;
      }

      // If position jumped to jail (10) without moving naturally, teleport directly
      if (p.inJail && !prevP.inJail) {
        setVisualPositions((prev) => ({ ...prev, [p.id]: target }));
        continue;
      }

      // If player changed position, step them forward!
      if (currentVisual !== target) {
        // Calculate step count clockwise
        const steps = (target - currentVisual + 40) % 40;

        // If distance is large (e.g. chance card teleport to GO or jail), step max 8 times or direct
        const stepDelay = Math.max(120, Math.min(300, Math.floor(1800 / Math.max(1, steps))));
        setHoppingPlayerId(p.id);

        let cur = currentVisual;
        let remaining = steps;

        const interval = setInterval(() => {
          if (remaining > 0) {
            cur = (cur + 1) % 40;
            remaining--;
            setVisualPositions((prev) => ({ ...prev, [p.id]: cur }));
            try {
              sndTick();
            } catch {
              // noop if audio is muted or gesture not ready
            }
          } else {
            clearInterval(interval);
            setHoppingPlayerId(null);
            setLandingBounceTile(target);
            setTimeout(() => setLandingBounceTile(null), 800);
          }
        }, stepDelay);

        return () => clearInterval(interval);
      }
    }
  }, [room, visualPositions]);

  return {
    visualPositions,
    hoppingPlayerId,
    landingBounceTile,
  };
}
