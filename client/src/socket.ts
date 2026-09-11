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
