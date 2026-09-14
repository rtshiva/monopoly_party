import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RoomState } from "@monopoly/shared";
import { extractSpotlightEvent, type SpotlightEvent } from "./boardSpotlight";

interface BoardTheaterProps {
  room: RoomState;
}

/**
 * Action Theater: Dynamic spotlight overlays that appear in the center of the TV board
 * when dramatic events occur (rent paid, passing GO, arrests, auction climax, victory).
 * Fades out automatically after 3.5s so the theme art remains visible during calm periods.
 */
export function BoardTheater({ room }: BoardTheaterProps) {
  const [activeEvent, setActiveEvent] = useState<SpotlightEvent | null>(null);

  useEffect(() => {
    const ev = extractSpotlightEvent(room);
    if (ev) {
      setActiveEvent(ev);
      // Winner stays until restart; temporary events dismiss after 3.8s
      if (ev.kind !== "win") {
        const timer = setTimeout(() => {
          setActiveEvent((cur) => (cur?.id === ev.id ? null : cur));
        }, 3800);
        return () => clearTimeout(timer);
      }
    }
  }, [room.rev, room.status, room.winnerId, room.auction?.id, room.log[0]?.id]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 z-30">
      <AnimatePresence>
        {activeEvent && (
          <motion.div
            key={activeEvent.id}
            initial={{ scale: 0.75, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -10 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            className={"relative max-w-sm w-full rounded-2xl border-2 px-4 py-3 text-center shadow-2xl backdrop-blur-md " + activeEvent.themeColor}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="font-display text-lg font-black tracking-wider drop-shadow-md">
                {activeEvent.title}
              </span>
              {activeEvent.badge && (
                <span className="rounded-full bg-black/40 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  {activeEvent.badge}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm font-semibold text-white/95 drop-shadow">
              {activeEvent.detail}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
