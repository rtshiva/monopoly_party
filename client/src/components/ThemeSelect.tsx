import { useState } from 'react';
import { BOARD_THEMES, mergeDiscovered, themeFor } from './boardThemes';
import { useDiscoveredThemes } from '../useThemes';

interface Props {
  value: string;
  onPick: (style: string) => void;
  label?: string;
}

/**
 * Board-skin dropdown with a live center-art preview. Options are the
 * built-in registry merged with drop-in theme folders (GET /api/themes), so
 * newly added art is selectable with zero code changes. Missing art falls
 * back to the SVG scene with a note.
 */
export function ThemeSelect({ value, onPick, label = '🎨 Board' }: Props) {
  const discovered = useDiscoveredThemes();
  // Registry entries carry full metadata; discovery supplements them.
  const themes = mergeDiscovered(BOARD_THEMES, discovered);
  const current = themeFor(value, discovered);
  const found = discovered.find((d) => d.id === current.id);
  const [imgOk, setImgOk] = useState(true);
  const previewKey = `${current.id}:${current.artImage ?? 'none'}`;
  function shuffle() {
    if (themes.length === 0) return;
    const pool = themes.filter((t) => t.id !== current.id);
    const pick = (pool.length > 0 ? pool : themes)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : themes.length))];
    setImgOk(true);
    onPick(pick.id);
  }
  return (
    <div className="glass mt-3 rounded-2xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{label}</span>
        <select
          value={current.id}
          onChange={(e) => {
            setImgOk(true);
            onPick(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-bold outline-none"
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={shuffle}
          title="Pick a random skin"
          className="rounded-xl bg-white/10 px-3 py-2 font-bold hover:bg-white/20"
        >
          🎲
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {current.artImage && imgOk ? (
          <img
            key={previewKey}
            src={current.artImage}
            alt={`${current.name} preview`}
            onError={() => setImgOk(false)}
            className="h-20 w-20 rounded-xl border border-white/15 object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/5 text-2xl">
            {current.icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            {current.icon} {current.name}
          </div>
          <div className="truncate text-xs text-white/60">{current.tagline}</div>
          <div className="text-xs text-white/40">
            {current.artImage && imgOk ? 'Center art preview' : 'No center art — SVG scene shows'}
            {discovered.length > 0 && ` · ${discovered.length} drop-in folder${discovered.length === 1 ? '' : 's'} found`}
          </div>
          {found && (
            <div className="mt-1 text-xs">
              <span className="font-bold text-emerald-300">
                Artwork {(found.tiles?.length ?? 0)}/17
              </span>
              {(found.missing?.length ?? 0) > 0 && (
                <span className="text-white/50"> · missing: {found.missing!.join(', ')}</span>
              )}
              {(found.warnings?.length ?? 0) > 0 && (
                <div className="mt-1 space-y-0.5 text-amber-200">
                  {found.warnings!.slice(0, 4).map((w) => (
                    <div key={w}>⚠️ {w}</div>
                  ))}
                  {found.warnings!.length > 4 && <div>…+{found.warnings!.length - 4} more</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 text-xs text-white/50">Switches live on every screen.</div>
    </div>
  );
}
