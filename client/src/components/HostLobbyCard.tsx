import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TOKENS, type RoomState } from '@monopoly/shared';
import { emitWithAck } from '../socket';

export interface HostLobbyCardProps {
  room: RoomState;
  joinURL: string;
  hostId: string;
  hostKey: string | null;
  onAuthLost: () => void;
}

export function HostLobbyCard({
  room,
  joinURL,
  hostId,
  hostKey,
  onAuthLost,
}: HostLobbyCardProps) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    setMsg('');
    if (!hostId || !hostKey) {
      setMsg('Host seat not held on this screen — reclaim it from a phone with the TV PIN.');
      setBusy(false);
      return;
    }
    try {
      const res = await emitWithAck<{ ok: boolean; error?: string }>('startGame', {
        code: room.code,
        playerId: hostId,
        key: hostKey,
      });
      if (!res?.ok) {
        if (res?.error === 'NO_CONTROL') {
          onAuthLost();
          setMsg('This screen lost the host seat (server restarted or it was claimed elsewhere) — reclaim it in 🔑 Host login below, then start again.');
        } else {
          setMsg(res?.error === 'NEED_2' ? 'Need at least 2 players to start' : res?.error === 'NOT_HOST' ? 'This screen no longer holds the host seat.' : 'Could not start game');
        }
      }
    } catch {
      setMsg('Server not responding — is it running?');
    }
    setBusy(false);
  };

  return (
    <div className="glass mt-3 flex flex-col items-center gap-4 rounded-3xl p-5 md:flex-row">
      <div className="rounded-2xl bg-white p-3">
        <QRCodeSVG value={joinURL} size={150} />
      </div>
      <div className="flex-1 text-center md:text-left">
        <div className="font-display text-lg font-bold">Phones: scan to join 👇</div>
        <div className="mt-1 break-all font-mono text-amber-200">{joinURL}</div>
        <div className="mt-1 text-sm text-white/60">
          Same Wi-Fi required. If this shows <code>localhost</code>, open the same page via your LAN IP (e.g. http://192.168.1.5:5173). Find it with <code>ipconfig</code>.
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
          {room.players.map((p) => (
            <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">
              {TOKENS[p.token]} {p.name}
              {p.isBot ? ' 🤖' : ''}
            </span>
          ))}
        </div>
        <div className="mt-3">
          <button
            disabled={room.players.length < 2 || busy}
            onClick={handleStart}
            className="btn-gold rounded-2xl px-6 py-3 text-lg disabled:opacity-40"
          >
            {room.players.length < 2
              ? `Waiting for players (${room.players.length}/8)…`
              : busy
              ? 'Starting…'
              : `Start game with ${room.players.length} players 🚀`}
          </button>
          {msg && <div className="mt-1 text-sm text-rose-200">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
