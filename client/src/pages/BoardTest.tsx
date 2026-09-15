import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BOARD, DEFAULT_BOARD_STYLE } from '@monopoly/shared';
import type { BoardStyle, Player, RoomState } from '@monopoly/shared';
import { useDiscoveredThemes } from '../useThemes';
import { ThemedBoard } from '../components/ThemedBoard';
import { themeFor, type BoardTheme } from '../components/boardThemes';

const STYLES: BoardStyle[] = ['classic', 'grandprix', 'city', 'coastal', 'mountain', 'dinosaur', 'space'];
const TOKEN_ORDER: Player['token'][] = ['car', 'dog', 'hat', 'ship'];

/**
 * Alignment & Theme Studio mock room: configure houses, auctions, trades, and lighting.
 */
function mockRoom(style: BoardStyle, scenario: 'all' | 'bare' | 'hotels', lightingTurn = 12): RoomState {
  const buyable = BOARD.map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === 'property' || t.kind === 'railroad' || t.kind === 'utility')
    .map(({ i }) => i);
  const pending = buyable[buyable.length - 1];
  const auctionTile = buyable[buyable.length - 2];
  const owned = buyable.slice(0, -2);
  const names = ['Anu', 'Siva', 'Zed', 'Mia'];
  const players: Player[] = [0, 1, 2, 3].map((n) => ({
    id: `test-p${n}`,
    name: names[n],
    token: TOKEN_ORDER[n],
    cash: 1500 - n * 137,
    position: [0, 10, 10, 39][n],
    properties: owned.filter((_, k) => k % 4 === n),
    mortgaged: [],
    inJail: n === 2,
    jailTurns: n === 2 ? 1 : 0,
    jailCards: n,
    doubles: 0,
    bankrupt: false,
    connected: n !== 3,
    isHost: n === 0,
    isBot: false,
    hasRolled: n === 1,
    seatPin: ['1111', '2222', '3333', '4444'][n],
    controllerLabel: ['TV', 'Phone-A', 'Phone-B', null][n],
  }));
  const buildings: Record<number, number> = {};
  if (scenario === 'hotels') {
    owned.forEach((tile) => {
      if (BOARD[tile].kind === 'property') buildings[tile] = 5;
    });
  } else if (scenario === 'all') {
    owned.forEach((tile, k) => {
      if (BOARD[tile].kind === 'property' && k % 3 !== 2) buildings[tile] = (k % 5) + 1;
    });
  }
  owned
    .filter((t) => !(t in buildings))
    .slice(0, scenario === 'bare' ? 0 : 2)
    .forEach((t) => players.find((p) => p.properties.includes(t))!.mortgaged.push(t));
  const now = Date.now();
  const p0 = players[0], p1 = players[1], p2 = players[2], p3 = players[3];
  return {
    code: 'TEST',
    status: 'playing',
    players,
    turnIndex: 1,
    dice: [3, 4],
    lastRoll: 'Siva rolled 3+4=7',
    lastCard: { kind: 'chance', text: 'Chance: Bank pays you $100', at: now },
    pendingBuy: pending,
    trades: [
      {
        id: 'test-t1', fromId: p0.id, toId: p1.id,
        giveTiles: p0.properties.slice(0, 1), giveCash: 50, giveCards: 0,
        wantTiles: p1.properties.slice(0, 1), wantCash: 0, wantCards: 0,
        createdAt: now, expiresAt: now + 60000,
      },
      {
        id: 'test-t2', fromId: p2.id, toId: p3.id,
        giveTiles: [], giveCash: 0, giveCards: 1,
        wantTiles: [], wantCash: 25, wantCards: 0,
        createdAt: now, expiresAt: now + 60000,
      },
    ],
    auction: {
      id: 'test-a1', tile: auctionTile, startedBy: p0.id,
      bids: [
        { playerId: p0.id, amount: 120, at: now - 9000 },
        { playerId: p1.id, amount: 200, at: now - 3000 },
      ],
      endsAt: now + 25000,
    },
    buildings,
    turnDeadline: now + 45000,
    auctionQueue: [],
    lastActivity: now,
    pausedAt: null,
    boardStyle: style,
    log: [
      { id: 'l1', text: '🎲 Siva → Tennessee', at: now },
      { id: 'l2', text: '✅ Siva bought Tennessee for $180', at: now },
    ],
    winnerId: null,
    turnCount: lightingTurn,
    rollingId: null,
    rev: 0,
  };
}

export function BoardTest() {
  const { style = 'classic' } = useParams();
  const discovered = useDiscoveredThemes();
  const allIds = [...STYLES, ...discovered.map((d) => d.id).filter((id) => !(STYLES as string[]).includes(id))];
  const valid = (style || DEFAULT_BOARD_STYLE) as BoardStyle;

  // Base theme from registry/discovery
  const baseTheme = useMemo(() => themeFor(valid, discovered), [valid, discovered]);

  // Live editable theme parameters
  const [boardBg, setBoardBg] = useState(baseTheme.boardBg);
  const [tileBg, setTileBg] = useState(baseTheme.tileBg);
  const [ink, setInk] = useState(baseTheme.ink);
  const [subInk, setSubInk] = useState(baseTheme.subInk);
  const [name, setName] = useState(baseTheme.name);
  const [icon, setIcon] = useState(baseTheme.icon);
  const [artImage, setArtImage] = useState(baseTheme.artImage || '');

  // Reset editable controls when switching presets via URL
  useEffect(() => {
    setBoardBg(baseTheme.boardBg);
    setTileBg(baseTheme.tileBg);
    setInk(baseTheme.ink);
    setSubInk(baseTheme.subInk);
    setName(baseTheme.name);
    setIcon(baseTheme.icon);
    setArtImage(baseTheme.artImage || '');
  }, [baseTheme]);

  const [scenario, setScenario] = useState<'all' | 'bare' | 'hotels'>('all');
  const [lightingCycle, setLightingCycle] = useState(15);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importErr, setImportErr] = useState('');

  const activeTheme: BoardTheme = useMemo(() => ({
    ...baseTheme,
    name,
    icon,
    boardBg,
    tileBg,
    ink,
    subInk,
    artImage: artImage || undefined,
  }), [baseTheme, name, icon, boardBg, tileBg, ink, subInk, artImage]);

  const room = useMemo(() => mockRoom(valid, scenario, lightingCycle), [valid, scenario, lightingCycle]);

  function copyJson() {
    const config = {
      id: valid,
      name,
      icon,
      boardBg,
      tileBg,
      ink,
      subInk,
      artImage: artImage || undefined,
    };
    navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = ev.target?.result as string;
      if (res) setArtImage(res);
    };
    reader.readAsDataURL(file);
  }

  function handleImportSubmit() {
    try {
      const parsed = JSON.parse(importJson) as Partial<BoardTheme>;
      if (parsed.boardBg) setBoardBg(parsed.boardBg);
      if (parsed.tileBg) setTileBg(parsed.tileBg);
      if (parsed.ink) setInk(parsed.ink);
      if (parsed.subInk) setSubInk(parsed.subInk);
      if (parsed.name) setName(parsed.name);
      if (parsed.icon) setIcon(parsed.icon);
      if (parsed.artImage) setArtImage(parsed.artImage);
      setShowImport(false);
      setImportErr('');
    } catch {
      setImportErr('Invalid JSON format. Check syntax and try again.');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Link to="/" className="rounded-lg bg-white/10 px-3 py-1.5 font-bold hover:bg-white/20 transition-colors">← Home</Link>
          <span className="font-display font-bold text-base">🎨 Custom Theme Studio</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {allIds.map((s) => (
            <Link
              key={s}
              to={`/board-test/${s}`}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                s === valid ? 'bg-amber-300 text-black shadow' : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Studio Controls Panel */}
      <div className="glass mb-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">Theme Metadata</span>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              title="Theme Emoji Icon"
              className="w-10 rounded-lg bg-black/40 px-2 py-1 text-center text-sm border border-white/15"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              title="Theme Display Name"
              placeholder="Theme Name"
              className="rounded-lg bg-black/40 px-3 py-1 text-sm border border-white/15 font-bold text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition-colors"
            >
              📥 Import JSON
            </button>
            <button
              type="button"
              onClick={copyJson}
              className="btn-gold rounded-xl px-3 py-1.5 text-xs font-bold transition-transform active:scale-95 flex items-center gap-1"
            >
              <span>{copied ? '✅ Copied!' : '📋 Export Theme JSON'}</span>
            </button>
          </div>
        </div>

        {/* Live Color Pickers */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60 font-medium">Board Background</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={boardBg.startsWith('#') ? boardBg : '#0f172a'}
                onChange={(e) => setBoardBg(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
              />
              <input
                type="text"
                value={boardBg}
                onChange={(e) => setBoardBg(e.target.value)}
                className="w-full rounded-lg bg-black/40 px-2 py-1 font-mono text-xs border border-white/15"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60 font-medium">Tile Background</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={tileBg.startsWith('#') ? tileBg : '#fffdf4'}
                onChange={(e) => setTileBg(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
              />
              <input
                type="text"
                value={tileBg}
                onChange={(e) => setTileBg(e.target.value)}
                className="w-full rounded-lg bg-black/40 px-2 py-1 font-mono text-xs border border-white/15"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60 font-medium">Primary Ink (Text)</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={ink.startsWith('#') ? ink : '#1e293b'}
                onChange={(e) => setInk(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
              />
              <input
                type="text"
                value={ink}
                onChange={(e) => setInk(e.target.value)}
                className="w-full rounded-lg bg-black/40 px-2 py-1 font-mono text-xs border border-white/15"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60 font-medium">Sub Ink (Price/Rent)</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subInk.startsWith('#') ? subInk : '#64748b'}
                onChange={(e) => setSubInk(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
              />
              <input
                type="text"
                value={subInk}
                onChange={(e) => setSubInk(e.target.value)}
                className="w-full rounded-lg bg-black/40 px-2 py-1 font-mono text-xs border border-white/15"
              />
            </div>
          </div>
        </div>

        {/* Center Artwork & Simulation Row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="flex flex-1 min-w-[280px] items-center gap-2">
            <span className="text-xs font-bold text-white/60">Center Art:</span>
            <input
              type="text"
              value={artImage}
              onChange={(e) => setArtImage(e.target.value)}
              placeholder="Image URL or drop file"
              className="flex-1 rounded-lg bg-black/40 px-2 py-1 text-xs border border-white/15 truncate"
            />
            <label className="cursor-pointer rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold hover:bg-white/20 transition-colors">
              <span>📁 Upload</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
            {artImage && (
              <button
                type="button"
                onClick={() => setArtImage('')}
                className="text-xs text-rose-300 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Test State Toggles */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-white/60">Test State:</span>
            <button
              type="button"
              onClick={() => setScenario('all')}
              className={`rounded-lg px-2.5 py-1 font-bold ${scenario === 'all' ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/70'}`}
            >
              All Markers
            </button>
            <button
              type="button"
              onClick={() => setScenario('hotels')}
              className={`rounded-lg px-2.5 py-1 font-bold ${scenario === 'hotels' ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/70'}`}
            >
              Hotels
            </button>
            <button
              type="button"
              onClick={() => setScenario('bare')}
              className={`rounded-lg px-2.5 py-1 font-bold ${scenario === 'bare' ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/70'}`}
            >
              Clean
            </button>

            <span className="ml-2 font-bold text-white/60">Lighting:</span>
            <select
              value={lightingCycle}
              onChange={(e) => setLightingCycle(parseInt(e.target.value, 10))}
              className="rounded-lg bg-black/40 px-2 py-1 text-xs border border-white/15"
            >
              <option value={5}>🌅 Dawn</option>
              <option value={15}>☀️ Noon</option>
              <option value={25}>🌆 Dusk</option>
              <option value={35}>🌙 Midnight</option>
            </select>
          </div>
        </div>

        {/* JSON Import Drawer */}
        {showImport && (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white/80">Paste Theme JSON Configuration</span>
              <button onClick={() => setShowImport(false)} className="text-xs text-white/50 hover:text-white">✕</button>
            </div>
            <textarea
              rows={3}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"boardBg":"#0f172a","tileBg":"#1e293b","ink":"#f8fafc","subInk":"#94a3b8"}'
              className="w-full rounded-lg bg-black/50 p-2 font-mono text-xs border border-white/10 text-amber-200 outline-none"
            />
            {importErr && <div className="mt-1 text-xs text-rose-300">{importErr}</div>}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleImportSubmit}
                className="btn-gold rounded-lg px-3 py-1 text-xs font-bold"
              >
                Apply Theme
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Board Preview */}
      <ThemedBoard room={room} themeOverride={activeTheme} />
    </div>
  );
}

