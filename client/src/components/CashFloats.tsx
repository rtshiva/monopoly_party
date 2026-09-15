import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RoomState } from "@monopoly/shared";

export interface FloatItem {
  id: string;
  amount: number;
}

/**
 * Tracks cash fluctuations per player and displays drifting +$200 / -$X badges.
 */
export function usePlayerCashDeltas(room: RoomState) {
  const prevCash = useRef<Record<string, number>>({});
  const [floats, setFloats] = useState<Record<string, FloatItem[]>>({});

  useEffect(() => {
    const nextFloats: Record<string, FloatItem[]> = {};

    for (const p of room.players) {
      const old = prevCash.current[p.id];
      if (old !== undefined && old !== p.cash) {
        const diff = p.cash - old;
        const item: FloatItem = { id: p.id + "-" + Date.now() + "-" + Math.random(), amount: diff };
        nextFloats[p.id] = [item];
      }
      prevCash.current[p.id] = p.cash;
    }

    if (Object.keys(nextFloats).length > 0) {
      setFloats((prev) => {
        const merged = { ...prev };
        for (const [pid, items] of Object.entries(nextFloats)) {
          merged[pid] = [...(merged[pid] ?? []), ...items];
        }
        return merged;
      });

      const timer = setTimeout(() => {
        setFloats({});
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [room.rev, room.players]);

  return floats;
}

export function CashFloatBadge({ items }: { items?: FloatItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute -top-3 right-0 z-30 flex flex-col items-end">
      <AnimatePresence>
        {items.map((it) => {
          const positive = it.amount > 0;
          return (
            <motion.span
              key={it.id}
              initial={{ opacity: 0, y: 0, scale: 0.8 }}
              animate={{ opacity: 1, y: -18, scale: 1.15 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className={"font-mono text-xs font-black px-1.5 py-0.5 rounded shadow-lg " + (positive ? "bg-emerald-500 text-emerald-950" : "bg-rose-500 text-white")}
            >
              {positive ? "+" : ""}${it.amount}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
