import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, mergeDiscovered, themeFor } from './boardThemes';
import type { DiscoveredTheme } from './boardThemes';

// Commits the merge cases previously verified via a throwaway node script:
// drop-in folders appear untouched, registry metadata wins, center-URL dupes
// collapse to the registry id, unknowns fall back to the default skin.
const discworld: DiscoveredTheme = {
  id: 'discworld',
  name: 'Discworld',
  center: '/themes/discworld/discworld-center.webp',
  tileArt: { blue: '/themes/discworld/discworld-tile-blue.webp' },
};

describe('mergeDiscovered', () => {
  it('drop-in theme appears with its art', () => {
    const merged = mergeDiscovered(BOARD_THEMES, [discworld]);
    const dw = merged.find((t) => t.id === 'discworld');
    expect(dw?.artImage).toBe('/themes/discworld/discworld-center.webp');
    expect(dw?.tileArt?.blue).toBe('/themes/discworld/discworld-tile-blue.webp');
  });
  it('registry entries keep full metadata', () => {
    const merged = mergeDiscovered(BOARD_THEMES, [discworld]);
    expect(merged.find((t) => t.id === 'city')?.name).toBe('City Street Circuit');
  });
  it('center-URL dupe collapses to the registry id', () => {
    const dup: DiscoveredTheme = {
      id: 'dinosaur-park',
      name: 'Dinosaur Park',
      center: '/themes/dinosaur-park/dinosaur-park-center.webp',
      tileArt: {},
    };
    const merged = mergeDiscovered(BOARD_THEMES, [dup]);
    const hits = merged.filter((t) => t.artImage === '/themes/dinosaur-park/dinosaur-park-center.webp');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('dinosaur');
  });
});

describe('themeFor', () => {
  it('resolves custom ids', () => {
    expect(themeFor('discworld', [discworld]).artImage).toBe('/themes/discworld/discworld-center.webp');
  });
  it('unknown ids fall back to the default skin', () => {
    expect(themeFor('nope', []).id).toBe('classic');
  });
});
