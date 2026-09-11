import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type ConnState = 'live' | 'retry' | 'off';

/** Tracks a page's persistent socket + browser online state. Silent while live. */
export function useSocketStatus(sock: Socket | null): ConnState {
  const [state, setState] = useState<ConnState>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'off' : 'live',
  );
  useEffect(() => {
    if (!sock) return;
    const compute = () => setState(!navigator.onLine ? 'off' : sock.connected ? 'live' : 'retry');
    compute();
    const events: Array<[string, () => void]> = [
      ['connect', compute],
      ['disconnect', compute],
      ['reconnect_attempt', compute],
      ['reconnect_error', compute],
      ['reconnect_failed', compute],
      ['reconnect', compute],
    ];
    events.forEach(([ev, fn]) => { sock.on(ev, fn); });
    window.addEventListener('online', compute);
    window.addEventListener('offline', compute);
    return () => {
      events.forEach(([ev, fn]) => { sock.off(ev, fn); });
      window.removeEventListener('online', compute);
      window.removeEventListener('offline', compute);
    };
  }, [sock]);
  return state;
}

/** Renders nothing while connected; warn on retry/offline. Reuses the page socket. */
export function ConnPill({ sock }: { sock: Socket | null }) {
  const state = useSocketStatus(sock);
  if (state === 'live') return null;
  return (
    <div className={`mt-2 rounded-2xl px-4 py-2 text-center text-sm font-bold ${state === 'off' ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-300/15 text-amber-200'}`}>
      {state === 'off' ? '📴 You are offline — actions will fail until you reconnect' : '🔄 Reconnecting to the game server…'}
    </div>
  );
}
