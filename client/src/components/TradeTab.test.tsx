/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TradeTab } from './TradeTab';
import { mkTestPlayer, mkTestRoom } from './testFixtures';

function tradeRoom() {
  // Mediterranean Ave ($60) vs Oriental Ave ($100): uneven on purpose.
  const me = mkTestPlayer({ id: 'me', name: 'Me', properties: [1], cash: 1500, jailCards: 1 });
  const peer = mkTestPlayer({ id: 'peer', name: 'Peer', properties: [6], cash: 900, jailCards: 0 });
  const room = mkTestRoom({ trades: [] }, [me, peer]);
  return { me, peer, room };
}

function incomingRoom() {
  const { me, peer } = tradeRoom();
  // Peer offers Oriental ($100) for $100 cash: exactly even.
  const room = mkTestRoom(
    {
      trades: [
        {
          id: 't1',
          fromId: 'peer',
          toId: 'me',
          giveTiles: [6],
          giveCash: 0,
          giveCards: 0,
          wantTiles: [],
          wantCash: 100,
          wantCards: 0,
          createdAt: 1,
          expiresAt: Date.now() + 60000,
        },
      ],
    },
    [me, peer],
  );
  return { me, peer, room };
}

describe('TradeTab offers', () => {
  it('accepts and declines an incoming offer with the trade id', () => {
    const { me, room } = incomingRoom();
    const emit = vi.fn();
    render(<TradeTab room={room} me={me} emit={emit} />);
    fireEvent.click(screen.getByText('Accept'));
    expect(emit).toHaveBeenCalledWith('tradeRespond', { tradeId: 't1', accept: true });
    fireEvent.click(screen.getByText('Decline'));
    expect(emit).toHaveBeenCalledWith('tradeRespond', { tradeId: 't1', accept: false });
  });

  it('rates an even offer as a fair trade', () => {
    const { me, room } = incomingRoom();
    render(<TradeTab room={room} me={me} emit={() => {}} />);
    expect(screen.getByText('✅ Fair trade')).toBeTruthy();
  });

  it('sends the selected deed with the right payload', () => {
    const { me, room } = tradeRoom();
    const emit = vi.fn();
    render(<TradeTab room={room} me={me} emit={emit} />);
    // Mediterranean chip (mine) → summary values the deed at face $60.
    // Title uses the short board name rendered on the chip.
    fireEvent.click(screen.getByTitle('Med Ave'));
    expect(screen.getByText(/You give/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Send offer to Peer/));
    expect(emit).toHaveBeenCalledWith(
      'tradeOffer',
      expect.objectContaining({ to: 'peer', giveTiles: [1], giveCash: 0 }),
      expect.anything(),
    );
  });
});
