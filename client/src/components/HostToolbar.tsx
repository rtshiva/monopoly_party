import { Link } from 'react-router-dom';
import type { RoomState } from '@monopoly/shared';
import { ThemeSelect } from './ThemeSelect';
import { setMuted, setVolume } from '../sound';
import { setHighContrast } from '../accessibility';
import { setAnnouncerEnabled } from '../announcer';

export type HostActionType = 'pauseGame' | 'resumeGame' | 'endGame' | 'kickPlayer' | 'setBoardStyle' | 'addBot';

export interface HostToolbarProps {
  room: RoomState;
  joinURL?: string;
  amHost: boolean;
  hideChrome: boolean;
  mutedUi: boolean;
  setMutedUi: (muted: boolean) => void;
  volumeUi: number;
  setVolumeUi: (vol: number) => void;
  contrastUi: boolean;
  setContrastUi: (contrast: boolean) => void;
  announcerUi: boolean;
  setAnnouncerUi: (announcer: boolean) => void;
  hostAction: (ev: HostActionType, extra?: Record<string, unknown>) => void;
}

export function HostToolbar({
  room,
  joinURL,
  amHost,
  hideChrome,
  mutedUi,
  setMutedUi,
  volumeUi,
  setVolumeUi,
  contrastUi,
  setContrastUi,
  announcerUi,
  setAnnouncerUi,
  hostAction,
}: HostToolbarProps) {
  return (
    <>
      {/* top row: game title, status, mute, full-screen, high contrast, voice announcer */}
      {!hideChrome && (
        <div className="glass flex items-center gap-3 rounded-2xl p-3 flex-wrap">
          <Link to="/" className="font-display font-black text-amber-300">🎲 MONOPOLY</Link>
          <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-sm font-bold">{room.code}</span>
          {joinURL && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(joinURL)}
              className="rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              📋 Copy invite link
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-1">
            <button
              type="button"
              title={mutedUi ? 'Unmute TV sounds' : 'Mute TV sounds'}
              onClick={() => {
                const next = !mutedUi;
                setMuted(next);
                setMutedUi(next);
              }}
              className="text-lg leading-none hover:scale-110 active:scale-90 transition-transform"
            >
              {mutedUi ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={mutedUi ? 0 : volumeUi}
              title={`TV Sound Volume (${Math.round((mutedUi ? 0 : volumeUi) * 100)}%)`}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                setVolumeUi(val);
                if (val > 0 && mutedUi) {
                  setMuted(false);
                  setMutedUi(false);
                }
              }}
              className="w-16 h-1.5 accent-amber-300 rounded-lg cursor-pointer bg-white/20"
            />
          </div>
          <button
            type="button"
            title="Toggle TV Fullscreen"
            onClick={() => {
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen?.();
              } else {
                void document.exitFullscreen?.();
              }
            }}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 hover:bg-white/20"
          >
            <span>📺 Fullscreen</span>
          </button>
          <button
            type="button"
            title="Toggle high-contrast visibility mode for TV glare"
            onClick={() => {
              const next = !contrastUi;
              setHighContrast(next);
              setContrastUi(next);
            }}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 transition-colors ${
              contrastUi ? 'bg-amber-300 text-black font-extrabold shadow' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span>{contrastUi ? '☀️ High Contrast: ON' : '🌓 High Contrast'}</span>
          </button>
          <button
            type="button"
            title="Toggle TV speech announcer voice commentary"
            onClick={() => {
              const next = !announcerUi;
              setAnnouncerEnabled(next);
              setAnnouncerUi(next);
              if (next) {
                try {
                  const u = new SpeechSynthesisUtterance('TV announcer activated!');
                  u.rate = 1.05;
                  window.speechSynthesis?.speak(u);
                } catch { /* noop */ }
              }
            }}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 transition-colors ${
              announcerUi ? 'bg-amber-300 text-black font-extrabold shadow' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span>{announcerUi ? '🎙️ Voice: ON' : '🎙️ Voice: OFF'}</span>
          </button>
          <div className="ml-auto text-sm text-white/60">
            {room.status === 'lobby' ? '🟡 Lobby — waiting for players' : room.status === 'playing' ? '🟢 Playing' : room.status === 'paused' ? '⏸ Paused' : '🏁 Finished'}
          </div>
        </div>
      )}

      {amHost && (room.status === 'playing' || room.status === 'paused') && !hideChrome && (
        <div className="glass mt-3 flex items-center gap-3 rounded-2xl p-3 flex-wrap">
          <span className="font-bold">🔧 Host</span>
          {room.status === 'playing' ? (
            <button onClick={() => hostAction('pauseGame')} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold hover:bg-white/25">
              ⏸ Pause game
            </button>
          ) : (
            <button onClick={() => hostAction('resumeGame')} className="btn-gold rounded-xl px-4 py-2 text-sm">
              ▶️ Resume game
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm('End the game now and crown the winner by total assets?')) {
                hostAction('endGame');
              }
            }}
            className="rounded-xl bg-rose-500/25 border border-rose-400/40 text-rose-200 px-4 py-2 text-sm font-bold hover:bg-rose-500/40"
          >
            🏁 End game
          </button>
          <span className="text-xs text-white/50">Pause freezes turns and auctions. End game ranks players by total net worth.</span>
        </div>
      )}

      {amHost && (room.status === 'lobby' || room.status === 'playing') && !hideChrome && room.players.length < 8 && (
        <div className="glass mt-3 flex items-center gap-3 rounded-2xl p-3">
          <span className="font-bold">🤖 Bots</span>
          <button onClick={() => hostAction('addBot')} title="Add a computer player" className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">
            + Add bot
          </button>
          <span className="text-xs text-white/50">Server-driven seat: rolls, buys, builds. Remove with ✕ below.</span>
        </div>
      )}

      {amHost && !hideChrome && (
        <ThemeSelect value={room.boardStyle} onPick={(style) => hostAction('setBoardStyle', { style })} />
      )}
    </>
  );
}
