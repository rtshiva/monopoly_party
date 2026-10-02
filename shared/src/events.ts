// ---------------------------------------------------------------------------
// Socket event contract — the string names client and server agree on.
// Raw strings on either side turn a typo into an 8s ack timeout, so the full
// inventory lives here and unit.mjs pins it: every CLIENT_EVENTS name must
// have a socket.on handler, every SERVER_EVENTS name a client listener.
// Add new events here first (same rule as GameError in errors.ts).
// ---------------------------------------------------------------------------

/** Events the client emits and the server handles via socket.on. */
export const CLIENT_EVENTS = [
  'createRoom',
  'joinRoom',
  'watchRoom',
  'listRooms',
  'rejoin',
  'claimSeat',
  'releaseSeat',
  'startGame',
  'pauseGame',
  'resumeGame',
  'endGame',
  'setBoardStyle',
  'kickPlayer',
  'addBot',
  'rollStart',
  'rollStop',
  'rollDice',
  'buyProperty',
  'passProperty',
  'endTurn',
  'payJail',
  'auctionBid',
  'mortgage',
  'bankrupt',
  'useJailCard',
  'buyHouse',
  'sellHouse',
  'sellAllHouses',
  'tradeOffer',
  'tradeRespond',
  'tradeCancel',
] as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/** Events the server broadcasts and the client listens for. */
export const SERVER_EVENTS = ['roomState', 'roomDelta', 'evicted'] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];
