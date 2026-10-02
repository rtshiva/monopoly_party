// ---------------------------------------------------------------------------
// Typed socket error codes — use these instead of raw strings in handlers and
// on the client. Adding a new error requires updating this union, which makes
// it discoverable and prevents silent string-mismatch bugs.
//
// Extracted from types.ts (one concern per file): the domain model stays in
// types.ts; the error contract lives here. Leaf module — no imports.
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
  | 'BAD_STYLE'
  | 'NOTHING_TO_PASS';

/**
 * Runtime mirror of the GameError union for exhaustiveness tests. Keep in
 * sync when adding codes — friendlyError.test.ts fails any code without a
 * client mapping, so raw codes can never leak into the UI again.
 */
export const GAME_ERRORS: GameError[] = [
  'NO_ROOM',
  'ROOM_FULL',
  'GAME_OVER',
  'NEED_2',
  'NO_CONTROL',
  'NOT_HOST',
  'BAD_SEAT',
  'BAD_PIN',
  'NOT_YOUR_TURN',
  'ALREADY_ROLLED',
  'ROLL_FIRST',
  'PENDING_BUY',
  'TIME_UP',
  'AUCTION_LIVE',
  'NEGATIVE',
  'STALE_OFFER',
  'ALREADY_OWNED',
  'NO_CASH',
  'BAD_TILE',
  'HAS_HOUSES',
  'EVEN_BUILD',
  'MAX_HOUSES',
  'MORTGAGED',
  'NOT_FULL_SET',
  'TILE_LOCKED',
  'NO_CARD',
  'NO_CARDS',
  'BAD_TRADE',
  'NO_OFFER',
  'NOT_YOUR_OFFER',
  'NO_AUCTION',
  'BID_TOO_LOW',
  'NAME_TAKEN',
  'BAD_STYLE',
  'NOTHING_TO_PASS',
];

/** Standard socket acknowledgement shape used by every handler. Failure
 * acks always carry a typed code — bare `{ ok: false }` is a compile error,
 * so unmapped client banners can never regress silently. */
export type SocketResult<T extends Record<string, unknown> = Record<string, never>> =
  ({ ok: true } & T) | { ok: false; error: GameError };
