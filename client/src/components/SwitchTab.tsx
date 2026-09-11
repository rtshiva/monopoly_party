import { useState } from 'react';
import { TOKENS } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { clearControl, saveControl, useGame } from '../store';

interface Props {
  room: RoomState;
  me: Player;
  pid: string;
  hasControl: boolean;
  emit: (
    ev: string,
    extra?: Record<string, unknown>,
    onOk?: (res: { ok: boolean; error?: string; controlKey?: string }) => void,
  ) => void;
}

/** Take over any seat with its TV PIN, or release this one for someone else. */
export function SwitchTab({ room, me, pid, hasControl, emit }: Props) {
  const { setPlayerId, setControlKey, deviceLabel, setDeviceLabel } = useGame();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [labelDraft, setLabelDraft] = useState(deviceLabel);

  function claim(seat: Player) {
    const pin = (pins[seat.id] || '').trim();
    emit('claimSeat', { playerId: seat.id, pin, deviceLabel: labelDraft.trim() || deviceLabel }, (res) => {
      if (res?.ok && res.controlKey) {
        if (labelDraft.trim() && labelDraft.trim() !== deviceLabel) setDeviceLabel(labelDraft.trim());
        saveControl(seat.id, res.controlKey);
        try { localStorage.setItem('monopoly.pid', seat.id); } catch { /* noop */ }
        setControlKey(res.controlKey);
        setPlayerId(seat.id);
      }
    });
  }

  function release() {
    emit('releaseSeat', {}, () => {
      clearControl(pid);
      setControlKey(null);
    });
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="glass rounded-2xl p-3 text-center text-sm">
        {hasControl ? (
          <>🎮 This device controls <b>{me.name}</b>. <button onClick={release} className="ml-1 underline">Release seat</button></>
        ) : (
          <>📴 This device controls <b>nothing right now</b> — claim a seat below with its TV PIN.</>
        )}
      </div>

      <label className="glass block rounded-2xl p-3 text-sm">This device's label
        <div className="mt-1 flex gap-2">
          <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value.slice(0, 24))}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 outline-none" />
          <button type="button" onClick={() => labelDraft.trim() && setDeviceLabel(labelDraft.trim())}
            className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold">Save</button>
        </div>
      </label>

      <div className="space-y-2">
        {room.players.filter((p) => !p.bankrupt).map((seat) => (
          <div key={seat.id} className="glass rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{TOKENS[seat.token]}</span>
              <div className="flex-1">
                <div className="font-bold">{seat.name} {seat.id === pid ? '(you)' : ''}</div>
                <div className="text-xs text-white/60">
                  {seat.connected && seat.controllerLabel ? `📱 ${seat.controllerLabel}` : '📴 no live controller'} · PIN <span className="font-mono text-amber-200">{seat.seatPin}</span>
                </div>
              </div>
            </div>
            {seat.id !== pid && (
              <div className="mt-2 flex gap-2">
                <input value={pins[seat.id] || ''} onChange={(e) => setPins({ ...pins, [seat.id]: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                  inputMode="numeric" placeholder="PIN" className="w-20 rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-mono outline-none" />
                <button type="button" onClick={() => claim(seat)}
                  className="flex-1 rounded-xl bg-amber-300 py-2 text-sm font-extrabold text-black">Control {seat.name}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
