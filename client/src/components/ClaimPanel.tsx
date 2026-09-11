import { useState } from 'react';
import { TOKENS } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { useGame } from '../store';

export type ClaimEmit = (
  ev: string,
  extra?: Record<string, unknown>,
  onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void,
) => void;

interface Props {
  room: RoomState;
  /** Defaults to all non-bankrupt seats. Pass a subset (e.g. host only) to narrow. */
  seats?: Player[];
  title?: string;
  onClaimed: (pid: string, key: string) => void;
  emit: ClaimEmit;
}

/** Claim any seat with its TV PIN. Usable with or without an existing session. */
export function ClaimPanel({ room, seats, title, onClaimed, emit }: Props) {
  const { deviceLabel, setDeviceLabel } = useGame();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [labelDraft, setLabelDraft] = useState(deviceLabel);
  const [msg, setMsg] = useState('');
  const list = (seats ?? room.players).filter((p) => !p.bankrupt);

  function claim(seat: Player) {
    const pin = (pins[seat.id] || '').trim();
    if (!pin) { setMsg('Enter the seat PIN shown on the TV.'); return; }
    setMsg('');
    emit('claimSeat', { playerId: seat.id, pin, deviceLabel: labelDraft.trim() || deviceLabel }, (res) => {
      if (res?.ok && res.controlKey) {
        if (labelDraft.trim() && labelDraft.trim() !== deviceLabel) setDeviceLabel(labelDraft.trim());
        onClaimed(seat.id, res.controlKey);
      }
    });
  }

  return (
    <div className="mt-2 space-y-3">
      {title && <div className="font-bold">{title}</div>}
      <label className="glass block rounded-2xl p-3 text-sm">This device's label
        <div className="mt-1 flex gap-2">
          <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value.slice(0, 24))}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 outline-none" />
          <button type="button" onClick={() => labelDraft.trim() && setDeviceLabel(labelDraft.trim())}
            className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold">Save</button>
        </div>
      </label>
      {msg && <div className="rounded-xl bg-rose-500/20 px-3 py-2 text-center text-sm text-rose-200">{msg}</div>}
      {list.length === 0 && <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">No seats available.</div>}
      <div className="space-y-2">
        {list.map((seat) => (
          <div key={seat.id} className="glass rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{TOKENS[seat.token]}</span>
              <div className="flex-1">
                <div className="font-bold">{seat.isHost ? '👑 ' : ''}{seat.name}{seat.isHost ? ' (host)' : ''}</div>
                <div className="text-xs text-white/60">
                  {seat.connected && seat.controllerLabel ? `📱 ${seat.controllerLabel}` : '📴 no live controller'} · PIN <span className="font-mono text-amber-200">{seat.seatPin}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <input value={pins[seat.id] || ''} onChange={(e) => setPins({ ...pins, [seat.id]: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                inputMode="numeric" placeholder="PIN" className="w-20 rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-mono outline-none" />
              <button type="button" onClick={() => claim(seat)}
                className="flex-1 rounded-xl bg-amber-300 py-2 text-sm font-extrabold text-black">Control {seat.name}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
