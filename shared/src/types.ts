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
  hasRolled: boolean;
  seatPin: string; // 4-digit takeover PIN, public to the room (shown on TV)
  controllerLabel: string | null; // human label of the device currently controlling this seat
}

export interface LogEntry { id: string; text: string; at: number; tone?: 'info' | 'good' | 'bad' | 'money' }

export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished';

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
  log: LogEntry[];
  winnerId: string | null;
  turnCount: number;
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
