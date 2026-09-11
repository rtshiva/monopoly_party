import { io, type Socket } from 'socket.io-client';

// Dev (vite :5173) talks to the game server on :3001.
// Prod (server serves client from one origin) uses the same origin.
export function serverURL(): string {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') return `${protocol}//${hostname}:3001`;
  return window.location.origin;
}

export function freshSocket(): Socket {
  return io(serverURL(), { transports: ['websocket', 'polling'], timeout: 8000 });
}

/**
 * One-shot request/response over a throwaway socket: connects, emits with
 * ack, then always disconnects. Rejects on timeout. Replaces the
 * create-emit-timer-disconnect pattern previously copied across pages.
 */
export function emitWithAck<T>(event: string, payload: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const s = freshSocket();
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      s.disconnect();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('timeout'))), timeoutMs);
    s.emit(event, payload, (res: T) => finish(() => resolve(res)));
  });
}
