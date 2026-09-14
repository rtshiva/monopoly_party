export type TokenKind = 'car' | 'hat' | 'dog' | 'ship' | 'cat' | 'balloon' | 'robot' | 'crown';

export const TOKENS: Record<TokenKind, string> = {
  car: '🚗', hat: '🎩', dog: '🐶', ship: '⛵', cat: '🐱', balloon: '🎈', robot: '🤖', crown: '👑',
};

export type TileColor =
  | 'brown' | 'lightblue' | 'pink' | 'orange' | 'red'
  | 'yellow' | 'green' | 'blue' | 'none';

export type Tile =
  | { kind: 'go'; name: string }
  | { kind: 'property'; name: string; color: TileColor; price: number; rent: number[]; houseCost: number }
  | { kind: 'railroad'; name: string; price: number }
  | { kind: 'utility'; name: string; price: number }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'chance'; name: string }
  | { kind: 'chest'; name: string }
  | { kind: 'jail'; name: string }
  | { kind: 'gotojail'; name: string }
  | { kind: 'parking'; name: string };

export interface Player {
  id: string;
  name: string;
  token: TokenKind;
  cash: number;
  position: number;
  properties: number[];
  mortgaged: number[];
  inJail: boolean;
  jailTurns: number;
  jailCards: number; // Get-Out-of-Jail-Free inventory (kept, played via useJailCard)
  doubles: number;
  bankrupt: boolean;
  connected: boolean;
  isHost: boolean;
  /** Server-driven seat (no socket/key). Acts on a think delay via core/bots. */
  isBot: boolean;
  hasRolled: boolean;
  seatPin: string; // 4-digit takeover PIN, public to the room (shown on TV)
  controllerLabel: string | null; // human label of the device currently controlling this seat
}

/** Activity-feed category: powers the All/Moves/Purchases/Trades/Builds/Money filters. */
export type LogCat = 'move' | 'purchase' | 'trade' | 'build' | 'money' | 'info';

export interface LogEntry {
  id: string; text: string; at: number; tone?: 'info' | 'good' | 'bad' | 'money';
  /** Turn number at write time (log() stamps room.turnCount). Absent on old snapshots. */
  turn?: number;
  /** Category for filters. Absent on old snapshots — clients fall back to tone. */
  cat?: LogCat;
}

export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished';

/** TV board skins. Built-ins ship in the client registry; drop-in themes
 *  (a folder with `<prefix>-center.webp` under client/public/themes/) are
 *  discovered at runtime — any string id is representable, with the built-ins
 *  kept for autocomplete. Unknown ids render on neutral colors. */
export const BOARD_STYLES = ['classic', 'grandprix', 'city', 'coastal', 'mountain', 'dinosaur', 'space'] as const;
export type BoardStyle = (typeof BOARD_STYLES)[number] | (string & {});
/** Default skin for new rooms and unknown saved values. */
export const DEFAULT_BOARD_STYLE: BoardStyle = 'classic';

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  giveTiles: number[]; // owned by fromId
  giveCash: number; // paid by fromId to toId
  giveCards: number; // Get-Out-of-Jail-Free cards from fromId to toId
  wantTiles: number[]; // owned by toId
  wantCash: number; // paid by toId to fromId
  wantCards: number; // Get-Out-of-Jail-Free cards from toId to fromId
  createdAt: number;
  expiresAt: number;
}

export interface AuctionBid { playerId: string; amount: number; at: number }

export interface Auction {
  id: string;
  tile: number; // bank-owned tile up for auction
  startedBy: string;
  bids: AuctionBid[];
  endsAt: number;
}

export interface RoomState {
  code: string;
  status: RoomStatus;
  players: Player[];
  turnIndex: number;
  dice: [number, number];
  lastRoll: string | null;
  lastCard: { kind: 'chance' | 'chest'; text: string; at: number } | null; // most recent card draw (for flip animation)
  pendingBuy: number | null; // tile index current player may buy
  trades: TradeOffer[];
  auction: Auction | null;
  buildings: Record<number, number>; // tile index -> level 1-4 houses, 5 = hotel
  turnDeadline: number | null; // ms timestamp when the current turn auto-resolves
  auctionQueue: number[]; // bank-owned deeds waiting for auction (bankruptcies)
  lastActivity: number; // ms timestamp of last state change (expiry + persistence)
  pausedAt: number | null; // when the current pause began (to shift auction clocks on resume)
  boardStyle: BoardStyle; // TV board skin, picked by the host
  log: LogEntry[];
  winnerId: string | null;
  turnCount: number;
  /** Ephemeral hold-to-roll presence: seat id currently shaking the dice (null when idle).
   *  Never restored from snapshots — a reboot always clears it. */
  rollingId: string | null;
  /** Monotonic broadcast revision. Bumped on every emit(); deltas reference it. */
  rev: number;
}

/** Incremental update: only the top-level keys listed in `changed`. */
export interface RoomDelta {
  code: string;
  rev: number; // revision AFTER applying patch
  baseRev: number; // revision the patch applies cleanly onto
  changed: Array<keyof RoomState>;
  patch: Partial<RoomState>;
}

export const START_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const MAX_PLAYERS = 8;
export const TRADE_EXPIRY_MS = 60000;
export const MAX_TRADES = 10;
export const MAX_TRADE_CASH = 100000;
export const AUCTION_DURATION_MS = 30000;
export const MIN_BID = 10;
export const TURN_MS = 60000;
export const OFFLINE_TURN_MS = 15000;

// ---------------------------------------------------------------------------
// Typed socket error codes — use these instead of raw strings in handlers and
// on the client. Adding a new error requires updating this union, which makes
// it discoverable and prevents silent string-mismatch bugs.
// ---------------------------------------------------------------------------
export type GameError =
  // Room / session
  | 'NO_ROOM'
  | 'ROOM_FULL'
  | 'GAME_OVER'
  | 'NEED_2'
  // Auth / control
  | 'NO_CONTROL'
  | 'NOT_HOST'
  | 'BAD_SEAT'
  | 'BAD_PIN'
  // Turn flow
  | 'NOT_YOUR_TURN'
  | 'ALREADY_ROLLED'
  | 'ROLL_FIRST'
  | 'PENDING_BUY'
  | 'TIME_UP'
  | 'AUCTION_LIVE'
  | 'NEGATIVE'
  | 'STALE_OFFER'
  | 'ALREADY_OWNED'
  // Economy
  | 'NO_CASH'
  | 'BAD_TILE'
  | 'HAS_HOUSES'
  | 'EVEN_BUILD'
  | 'MAX_HOUSES'
  | 'MORTGAGED'
  | 'NOT_FULL_SET'
  | 'TILE_LOCKED'
  | 'NO_CARD'
  | 'NO_CARDS'
  // Trades
  | 'BAD_TRADE'
  | 'NO_OFFER'
  | 'NOT_YOUR_OFFER'
  // Auctions
  | 'NO_AUCTION'
  | 'BID_TOO_LOW'
  // Lobby
  | 'NAME_TAKEN'
  | 'BAD_STYLE';

/** Standard socket acknowledgement shape used by every handler. */
export type SocketResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error?: GameError };
