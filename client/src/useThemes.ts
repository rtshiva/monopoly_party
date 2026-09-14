import { useEffect, useState } from 'react';
import { serverURL } from './socket';
import type { DiscoveredTheme } from './components/boardThemes';

/**
 * Drop-in theme folders, fetched once per page load (module-cached) from
 * GET /api/themes. Falls back to [] offline — the built-in registry always
 * works. Every subscriber re-renders when the list lands.
 */
let cache: DiscoveredTheme[] | null = null;
let inflight: Promise<DiscoveredTheme[]> | null = null;

async function load(): Promise<DiscoveredTheme[]> {
  try {
    const r = await fetch(`${serverURL()}/api/themes`);
    const j = await r.json();
    return Array.isArray(j?.themes) ? j.themes : [];
  } catch {
    return [];
  }
}

export function useDiscoveredThemes(): DiscoveredTheme[] {
  const [list, setList] = useState<DiscoveredTheme[]>(cache ?? []);
  useEffect(() => {
    let alive = true;
    if (!cache) {
      inflight ??= load().then((t) => {
        cache = t;
        return t;
      });
      inflight.then((t) => {
        if (alive) setList(t);
      });
    }
    return () => {
      alive = false;
    };
  }, []);
  return list;
}
