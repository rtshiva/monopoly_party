import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { HostScreen } from './pages/HostScreen';
import { PlayScreen } from './pages/PlayScreen';

export function App() {
  return (
    <BrowserRouter>
      <nav className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link to="/" className="font-display font-bold">🎲 Monopoly Party</Link>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">TV + phones · no install</span>
      </nav>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host/:code" element={<HostScreen />} />
        <Route path="/play/:code" element={<PlayScreen />} />
        <Route path="*" element={<div className="p-10 text-center">Not found — <Link className="underline" to="/">home</Link></div>} />
      </Routes>
      <footer className="pb-8 text-center text-xs text-white/40">Rooms live in server memory · refresh keeps your seat via saved player id</footer>
    </BrowserRouter>
  );
}
