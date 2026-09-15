/**
 * TV Host speech announcer using browser Web Speech API (speechSynthesis).
 * Turns terse game log entries into natural, energetic spectator commentary.
 * Completely offline-safe, zero audio assets.
 */

let announcerEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('monopoly.announcer') === '1';

export function isAnnouncerEnabled(): boolean {
  return announcerEnabled;
}

export function setAnnouncerEnabled(enabled: boolean) {
  announcerEnabled = enabled;
  try {
    localStorage.setItem('monopoly.announcer', enabled ? '1' : '0');
  } catch {
    // noop
  }
}

/**
 * Converts log text into natural spoken speech.
 * Returns null if the event is too minor to speak (e.g. routine roll or turn end).
 */
export function formatSpeech(logText: string): string | null {
  if (!logText) return null;
  const text = logText.trim();

  // Rent payment: "Siva paid $1050 rent to Anu"
  const rentMatch = text.match(/^(.+?)\s+paid\s+\$?(\d+)\s+rent\s+to\s+(.+)$/i);
  if (rentMatch) {
    const [, debtor, amount, creditor] = rentMatch;
    return `Rent! ${debtor} paid ${amount} dollars rent to ${creditor}!`;
  }

  // Passing GO: "Anu passed GO (+$200)"
  const goMatch = text.match(/^(.+?)\s+passed GO/i);
  if (goMatch) {
    return `${goMatch[1]} passed GO and collected 200 dollars!`;
  }

  // Property bought: "Zed bought Boardwalk for $400"
  const buyMatch = text.match(/^(.+?)\s+bought\s+(.+?)\s+for\s+\$?(\d+)$/i);
  if (buyMatch) {
    const [, buyer, property, price] = buyMatch;
    return `${buyer} acquired ${property} for ${price} dollars!`;
  }

  // Building built: "Siva built on Park Place"
  const buildMatch = text.match(/^(.+?)\s+built\s+on\s+(.+)$/i);
  if (buildMatch) {
    return `${buildMatch[1]} upgraded property on ${buildMatch[2]}!`;
  }

  // Game Won: "Siva wins the game!"
  if (text.includes('wins the game')) {
    return `${text} Congratulations to our champion!`;
  }

  // Bankruptcy: "Anu is bankrupt"
  if (text.includes('bankrupt')) {
    const p = text.replace(/is bankrupt.*/i, '').trim();
    return `${p || 'A player'} has declared bankruptcy! What a dramatic exit!`;
  }

  // Sent to jail: "Mia sent to JAIL" or "went to JAIL"
  if (text.includes('JAIL')) {
    const p = text.replace(/sent to JAIL|went to JAIL.*/i, '').trim();
    return `${p || 'A player'} is caught and sent directly to jail!`;
  }

  // Auction start: "Auction started for ..."
  if (text.includes('Auction started for')) {
    return text.replace('Auction started for', 'Auction opened for') + '! Place your bids!';
  }

  // Auction won: "Anu won Boardwalk auction for $350"
  const auctionWonMatch = text.match(/^(.+?)\s+won\s+(.+?)\s+auction\s+for\s+\$?(\d+)$/i);
  if (auctionWonMatch) {
    const [, winner, prop, price] = auctionWonMatch;
    return `Sold! ${winner} won ${prop} for ${price} dollars!`;
  }

  return null;
}

/**
 * Speak an announcement if announcer is enabled and browser supports speech.
 */
export function announce(spokenText: string) {
  if (!announcerEnabled) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    const synth = window.speechSynthesis;
    // Cancel currently speaking message so we don't lag behind fast action
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 1.05;
    utterance.pitch = 1.05;
    utterance.volume = 0.9;
    synth.speak(utterance);
  } catch {
    // noop if synthesis fails or is blocked by browser policy
  }
}

/**
 * Formats and speaks a log event.
 */
export function announceLogEvent(logText: string) {
  const speech = formatSpeech(logText);
  if (speech) {
    announce(speech);
  }
}
