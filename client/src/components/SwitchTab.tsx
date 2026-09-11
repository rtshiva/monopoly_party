import { TOKENS } from '@monopoly/shared';
import type { Player, RoomState } from '@monopoly/shared';
import { clearControl, saveControl, useGame } from '../store';
import { ClaimPanel, type ClaimEmit } from './ClaimPanel';

interface Props {
  room: RoomState;
  me: Player;
  pid: string;
  hasControl: boolean;
  emit: ClaimEmit;
}

/** Take over any seat with its TV PIN, or release this one for someone else. */
export function SwitchTab({ room, me, pid, hasControl, emit }: Props) {
  const { setPlayerId, setControlKey } = useGame();

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
      <ClaimPanel
        room={room}
        emit={emit}
        onClaimed={(newPid, newKey) => {
          saveControl(newPid, newKey);
          try { localStorage.setItem('monopoly.pid', newPid); } catch { /* noop */ }
          setControlKey(newKey);
          setPlayerId(newPid);
        }}
      />
      <div className="text-center text-xs text-white/40">Playing as {TOKENS[me.token]} {me.name} · takeovers are announced on every screen</div>
    </div>
  );
}
