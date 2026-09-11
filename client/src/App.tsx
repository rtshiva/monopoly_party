import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { HostScreen } from './pages/HostScreen';
import { PlayScreen } from './pages/PlayScreen';
import { BoardTest } from './pages/BoardTest';
import { useGame } from './store';

export function App() {
  const [swUpdate, setSwUpdate] = useState(false);
  const room = useGame((s) => s.room);
  // During active play the TV is all board: hide the site nav on host routes.
  const onHostRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/host/');
  const hideNav = onHostRoute && (room?.status === 'playing' || room?.status === 'paused');
  useEffect(() => {
    const onUpdate = () => setSwUpdate(true);
    window.addEventListener('sw-updated', onUpdate);
    return () => window.removeEventListener('sw-updated', onUpdate);
  }, []);
  return (
    <BrowserRouter>
      {!hideNav && (
        <nav className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/" className="font-display font-bold">🎲 Monopoly Party</Link>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">TV + phones · no install</span>
        </nav>
      )}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host/:code" element={<HostScreen />} />
        <Route path="/play/:code" element={<PlayScreen />} />
        <Route path="/board-test/:style" element={<BoardTest />} />
        <Route path="*" element={<div className="p-10 text-center">Not found — <Link className="underline" to="/">home</Link></div>} />
      </Routes>
      <footer className="pb-8 text-center text-xs text-white/40">Rooms live in server memory · refresh keeps your seat via saved player id</footer>
      {swUpdate && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-300/40 bg-[#141b33]/95 px-4 py-3 shadow-xl backdrop-blur">
          <span className="text-sm font-bold">✨ Game updated!</span>
          <button onClick={() => window.location.reload()} className="btn-gold rounded-xl px-3 py-1.5 text-sm">Refresh</button>
          <button onClick={() => setSwUpdate(false)} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm">Later</button>
        </div>
      )}
    </BrowserRouter>
  );
}
