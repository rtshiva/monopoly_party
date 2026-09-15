import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { dlogc } from '../debug';

// Standard pip layouts on a 3x3 grid (row-major indices 0..8).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Pip centers on the 100x100 face.
const C = [24, 50, 76];

export type DiceSkin = 'classic' | 'city' | 'coastal' | 'space' | 'gold' | string;

interface DieColors {
  body1: string;
  body2: string;
  body3: string;
  pip1: string;
  pip2: string;
  pip3: string;
  stroke: string;
}

const DICE_SKINS: Record<string, DieColors> = {
  classic: {
    body1: '#ffffff', body2: '#eef2f7', body3: '#c3cede',
    pip1: '#3d4a6b', pip2: '#141b33', pip3: '#04060d', stroke: '#141b33',
  },
  city: { // Neon Cyberpunk
    body1: '#1e1b4b', body2: '#0f172a', body3: '#020617',
    pip1: '#38bdf8', pip2: '#0284c7', pip3: '#0369a1', stroke: '#38bdf8',
  },
  coastal: { // Warm Driftwood Beach
    body1: '#fef3c7', body2: '#fde68a', body3: '#d97706',
    pip1: '#0d9488', pip2: '#0f766e', pip3: '#115e59', stroke: '#0f766e',
  },
  space: { // Deep Cosmos
    body1: '#2e1065', body2: '#1e1b4b', body3: '#090514',
    pip1: '#e879f9', pip2: '#c026d3', pip3: '#86198f', stroke: '#c026d3',
  },
  gold: { // Golden VIP
    body1: '#fef08a', body2: '#facc15', body3: '#ca8a04',
    pip1: '#78350f', pip2: '#451a03', pip3: '#1c0a00', stroke: '#854d0e',
  },
};

/**
 * One photoreal-ish die face as inline SVG: body gradient, top-left gloss,
 * indented radial pips, inner edge shading. Gradient/clip ids are unique per
 * instance so dozens of faces can share the DOM. Zero deps, offline-safe.
 */
function DieSVG({ value, skin = 'classic' }: { value: number; skin?: DiceSkin }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const body = `db${uid}`, pip = `dp${uid}`, gloss = `dg${uid}`, clip = `dc${uid}`;
  const pips = PIPS[value] ?? PIPS[1];
  const colors = DICE_SKINS[skin] ?? DICE_SKINS.classic;

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.body1} />
          <stop offset="0.55" stopColor={colors.body2} />
          <stop offset="1" stopColor={colors.body3} />
        </linearGradient>
        <radialGradient id={pip} cx="0.38" cy="0.32" r="0.95">
          <stop offset="0" stopColor={colors.pip1} />
          <stop offset="0.55" stopColor={colors.pip2} />
          <stop offset="1" stopColor={colors.pip3} />
        </radialGradient>
        <radialGradient id={gloss} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clip}><rect width="100" height="100" rx="18" /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={`url(#${body})`} />
        <ellipse cx="33" cy="22" rx="38" ry="23" fill={`url(#${gloss})`} transform="rotate(-18 33 22)" />
        {pips.map((i) => (
          <g key={i}>
            <circle cx={C[i % 3]} cy={C[Math.floor(i / 3)]} r="9.5" fill={`url(#${pip})`} />
            <circle cx={C[i % 3] - 1.5} cy={C[Math.floor(i / 3)] - 1.5} r="2.2" fill="#ffffff" opacity="0.35" />
          </g>
        ))}
        <rect x="1.5" y="1.5" width="97" height="97" rx="16.5" fill="none" stroke={colors.stroke} strokeOpacity="0.3" strokeWidth="3" />
      </g>
    </svg>
  );
}

export function DiceFace({ value, size = 56 }: { value: number; size?: number }) {
  return (
    <div className="shadow-lg" style={{ width: size, height: size }}>
      <DieSVG value={value} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3D dice: a pure-CSS cube (six pip faces, zero deps, offline-safe).
// The server rolls authoritatively; the cube only animates TOWARD the given
// value, so the visible face can never disagree with the counted result.
// ---------------------------------------------------------------------------

/** Cube rotation (rotateX then rotateY) that brings each value to the front. */
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
};

function faceTransform(v: number, half: number): CSSProperties {
  switch (v) {
    case 1: return { transform: `translateZ(${half}px)` };
    case 6: return { transform: `rotateY(180deg) translateZ(${half}px)` };
    case 3: return { transform: `rotateY(90deg) translateZ(${half}px)` };
    case 4: return { transform: `rotateY(-90deg) translateZ(${half}px)` };
    case 5: return { transform: `rotateX(-90deg) translateZ(${half}px)` };
    default: return { transform: `rotateX(90deg) translateZ(${half}px)` }; // 2 at the bottom
  }
}

/** Forward-spinning target: N full turns plus the delta onto the face. Pure. */
export function nextRotation(cur: { x: number; y: number }, value: number, spins = 2) {
  const t = FACE_ROT[value] ?? FACE_ROT[1];
  const dx = ((t.x - cur.x) % 360 + 360) % 360;
  const dy = ((t.y - cur.y) % 360 + 360) % 360;
  return { x: cur.x + spins * 360 + dx, y: cur.y + spins * 360 + dy };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);
  return reduced;
}

function CubeFaces({ size, skin = 'classic' }: { size: number; skin?: DiceSkin }) {
  const half = size / 2;
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((v) => (
        <div
          key={v}
          className="absolute"
          style={{ width: size, height: size, ...faceTransform(v, half) }}
        >
          <DieSVG value={v} skin={skin} />
        </div>
      ))}
    </>
  );
}

/** Checks whether a 3D rotation currently displays the given value face. */
export function isFacing(rot: { x: number; y: number }, value: number): boolean {
  const t = FACE_ROT[value] ?? FACE_ROT[1];
  return ((rot.x - t.x) % 360 + 360) % 360 === 0 && ((rot.y - t.y) % 360 + 360) % 360 === 0;
}

function DiceCube({ value, size, spinKey, delay = 0, shuffling = false, skin = 'classic' }: {
  value: number; size: number; spinKey: string | null; delay?: number; shuffling?: boolean; skin?: DiceSkin;
}) {
  const target = FACE_ROT[value] ?? FACE_ROT[1];
  const [rot, setRot] = useState(target);
  const [played, setPlayed] = useState(false);
  const rotRef = useRef(target);
  const lastKey = useRef(spinKey);
  const lastShuffling = useRef(shuffling);
  const reduced = useReducedMotion();

  // Distinct roll identity: key change triggers a tumble even when value repeats
  const k = spinKey ?? '';

  useEffect(() => {
    const kChanged = lastKey.current !== k;
    const shufflingStopped = lastShuffling.current && !shuffling;
    lastKey.current = k;
    lastShuffling.current = shuffling;

    // While shuffling (hold-to-roll), snap immediately to preview face — no flight
    if (shuffling) {
      rotRef.current = target;
      setRot(target);
      return;
    }

    const facing = isFacing(rotRef.current, value);

    // Tumble forward on: new roll, shuffle release, or any mismatch with authoritative value
    if (kChanged || shufflingStopped || !facing) {
      if (!facing) {
        dlogc('dice-heal', `resyncing cube to value=${value} (from rot ${rotRef.current.x},${rotRef.current.y})`);
      } else if (kChanged) {
        dlogc('dice-tumble', `tumble for ${k} -> value=${value}`);
      }
      setPlayed(true);
      if (reduced) {
        rotRef.current = target;
        setRot(target);
      } else {
        rotRef.current = nextRotation(rotRef.current, value);
        setRot(rotRef.current);
      }
    }
  }, [k, shuffling, value, reduced, target]);

  const lively = played && !shuffling && !reduced;
  const flight = { duration: 1, delay, ease: [0.15, 0.6, 0.25, 1] as const };

  return (
    <div className="flex flex-col items-center" style={{ perspective: size * 9 }}>
      <motion.div
        key={shuffling ? 'shuffle' : `roll-${k}`}
        initial={false}
        animate={lively ? { y: [0, -size * 0.45, 0] } : { y: 0 }}
        transition={flight}
      >
        <div className={shuffling ? 'dice-wobble' : undefined}>
          <motion.div
            animate={{ rotateX: rot.x, rotateY: rot.y }}
            transition={shuffling || reduced || !played ? { duration: 0 } : flight}
            style={{ width: size, height: size, transformStyle: 'preserve-3d', position: 'relative' }}
          >
            <CubeFaces size={size} skin={skin} />
          </motion.div>
        </div>
      </motion.div>
      <motion.div
        key={`shadow-${shuffling ? 'shuffle' : `roll-${k}`}`}
        initial={false}
        animate={lively ? { scaleX: [1, 0.55, 1], opacity: [0.35, 0.15, 0.35] } : { scaleX: 1, opacity: 0.3 }}
        transition={flight}
        className="mt-1 rounded-full bg-black/60"
        style={{ width: size * 0.9, height: Math.max(4, size * 0.09), filter: 'blur(2px)' }}
      />
    </div>
  );
}

/**
 * Two 3D dice. `rollKey` (the server's roll description) triggers the tumble;
 * `shuffling` rattles local preview faces while the ROLL button is held.
 */
export function DicePair({ d1, d2, rollKey, size = 56, shuffling = false, skin = 'classic' }: {
  d1: number; d2: number; rollKey: string | null; size?: number; shuffling?: boolean; skin?: DiceSkin;
}) {
  return (
    <div className="flex items-start justify-center gap-4">
      <DiceCube value={d1} size={size} spinKey={rollKey} delay={0} shuffling={shuffling} skin={skin} />
      <DiceCube value={d2} size={size} spinKey={rollKey} delay={0.12} shuffling={shuffling} skin={skin} />
    </div>
  );
}
