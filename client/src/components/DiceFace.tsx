import { motion } from 'framer-motion';

// Standard pip layouts on a 3x3 grid (row-major indices 0..8).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function DiceFace({ value, size = 56 }: { value: number; size?: number }) {
  const pips = PIPS[value] ?? PIPS[1];
  return (
    <div
      className="grid grid-cols-3 grid-rows-3 gap-[2px] rounded-2xl bg-gradient-to-br from-white to-slate-300 p-2 shadow-lg"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center justify-center">
          {pips.includes(i) && (
            <div className="rounded-full bg-[#141b33]" style={{ width: size / 6, height: size / 6 }} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Two dice that tumble on every new roll (keyed by the roll description). */
export function DicePair({ d1, d2, rollKey, size = 56 }: { d1: number; d2: number; rollKey: string | null; size?: number }) {
  return (
    <motion.div
      key={rollKey ?? 'start'}
      initial={{ rotate: -200, scale: 0.5, opacity: 0.3, x: -18 }}
      animate={{ rotate: 0, scale: 1, opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 13 }}
      className="flex items-center justify-center gap-3"
    >
      <DiceFace value={d1} size={size} />
      <DiceFace value={d2} size={size} />
    </motion.div>
  );
}
