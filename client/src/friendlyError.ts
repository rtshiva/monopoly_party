/**
 * Server GameError → human banner text. Every code in the shared union must
 * map here — errors.test.ts enforces it, so a raw code can never leak into
 * the UI again. Keep messages short; the banner is one line on phones.
 */
export function friendlyError(code?: string): string {
  switch (code) {
    case 'NO_ROOM': return 'Room not found — check the code';
    case 'ROOM_FULL': return 'Table is full (8 max)';
    case 'GAME_OVER': return 'That game already finished';
    case 'NEED_2': return 'Need at least 2 players';
    case 'BAD_TILE': return 'That property is not available';
    case 'NAME_TAKEN': return 'Name taken — try another';
    case 'BAD_STYLE': return 'Unknown board style';
    case 'NOT_YOUR_TURN': return 'Wait for your turn';
    case 'ALREADY_ROLLED': return 'You already rolled — end your turn';
    case 'ROLL_FIRST': return 'Roll first!';
    case 'PENDING_BUY': return 'Decide BUY or Pass first!';
    case 'TIME_UP': return '⏰ Time! Your turn was auto-resolved';
    case 'AUCTION_LIVE': return '🔨 Auction in progress — turns resume after the gavel';
    case 'NEGATIVE': return 'You are broke — mortgage or go bankrupt first';
    case 'NO_CASH': return 'Not enough cash';
    case 'STALE_OFFER': return 'That property is no longer available';
    case 'ALREADY_OWNED': return 'Already owned';
    case 'NOTHING_TO_PASS': return 'Nothing to pass';
    case 'BAD_TRADE': return 'Invalid trade — check deeds and cash';
    case 'NO_OFFER': return 'Offer expired or gone';
    case 'EXPIRED': return 'Offer expired';
    case 'TILE_LOCKED': return 'A property is locked in another offer';
    case 'NOT_YOUR_OFFER': return 'That offer is not yours to answer';
    case 'NO_AUCTION': return 'Auction already ended';
    case 'BID_TOO_LOW': return 'Bid higher than the top bid (min $10)';
    case 'HAS_HOUSES': return 'Sell houses first';
    case 'NOT_FULL_SET': return 'You need the full color set';
    case 'MAX_HOUSES': return 'Already a hotel here';
    case 'EVEN_BUILD': return 'Build evenly across the set';
    case 'MORTGAGED': return 'Unmortgage the set first';
    case 'NO_CARDS': return 'Not enough Get-Out-of-Jail-Free cards';
    case 'NO_CARD': return 'No Get-Out-of-Jail-Free card — draw one from Chance/Chest';
    case 'BAD_PIN': return 'Wrong seat PIN — check the TV board';
    case 'NO_CONTROL': return 'This device no longer controls that seat — reclaim it in 🔀 Switch';
    case 'NOT_HOST': return 'Only the host device can do that';
    case 'BAD_SEAT': return 'That seat is unavailable';
    default: return code || 'Action failed';
  }
}
