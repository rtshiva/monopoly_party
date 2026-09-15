import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '../haptics';
import { sndTick } from '../sound';

export interface PartyReactionsBarProps {
  onReact?: (text: string) => void;
}

export function PartyReactionsBar({ onReact }: PartyReactionsBarProps = {}) {
  const [reactionToast, setReactionToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const triggerReaction = (text: string, hapticStrength: number, playSound = false) => {
    haptic(hapticStrength);
    if (playSound) sndTick();
    setReactionToast(text);
    onReact?.(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setReactionToast(null), 2000);
  };

  return (
    <div className="mt-3 rounded-2xl bg-white/5 border border-white/10 p-2">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Party Reactions & Banter</span>
        {reactionToast && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-xs font-extrabold text-amber-300"
          >
            Sent {reactionToast}!
          </motion.span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        {['🎉', '😱', '💸', '💀', '👏', '🔥'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => triggerReaction(emoji, 30, true)}
            title={`React with ${emoji}`}
            className="flex-1 rounded-xl bg-white/5 hover:bg-white/15 py-1 text-lg active:scale-90 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
        {['"Nice hotel!"', '"Let\'s deal!"', '"No way! 🙅"', '"GG! 🏆"'].map((phrase) => (
          <button
            key={phrase}
            type="button"
            onClick={() => triggerReaction(phrase, 25)}
            className="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white/80 active:scale-95 transition-all"
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  );
}
