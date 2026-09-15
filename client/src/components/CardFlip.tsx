import { motion } from 'framer-motion';

interface CardFlipProps {
  card: {
    kind: 'chance' | 'chest';
    text: string;
    at: number;
  };
  compact?: boolean;
}

export function CardFlip({ card, compact = false }: CardFlipProps) {
  const isChance = card.kind === 'chance';

  return (
    <div style={{ perspective: '1000px' }} className="w-full flex justify-center">
      <motion.div
        key={card.at}
        initial={{ rotateY: 180, scale: 0.85, opacity: 0 }}
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', damping: 20, stiffness: 240 }}
        style={{ transformStyle: 'preserve-3d' }}
        className={`relative overflow-hidden rounded-2xl border-2 shadow-2xl ${
          isChance
            ? 'border-orange-400/60 bg-gradient-to-b from-orange-950 via-slate-900 to-black text-orange-100'
            : 'border-amber-400/60 bg-gradient-to-b from-amber-950 via-slate-900 to-black text-amber-100'
        } ${compact ? 'max-w-xs px-3 py-2 text-xs' : 'max-w-sm px-4 py-3 text-sm'}`}
      >
        {/* Subtle watermark / glow */}
        <div
          className={`absolute -right-6 -bottom-6 text-7xl opacity-10 pointer-events-none select-none`}
        >
          {isChance ? '❓' : '🎁'}
        </div>

        {/* Card Header Tag */}
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{isChance ? '❓' : '🎁'}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
              {isChance ? 'CHANCE' : 'COMMUNITY CHEST'}
            </span>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-mono font-bold text-white/60">
            Card Draw
          </span>
        </div>

        {/* Card Text Content */}
        <p className="font-semibold leading-relaxed tracking-wide text-white drop-shadow-sm">
          {card.text}
        </p>
      </motion.div>
    </div>
  );
}
