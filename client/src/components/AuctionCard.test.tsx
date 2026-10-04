/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Auction } from '@monopoly/shared';
import { AuctionCard } from './AuctionCard';
import { mkTestPlayer, mkTestRoom } from './testFixtures';

function auctionRoom(bids: Auction['bids']) {
  const me = mkTestPlayer({ id: 'me', name: 'Me', cash: 1500 });
  const rival = mkTestPlayer({ id: 'rival', name: 'Rival', cash: 1500 });
  const room = mkTestRoom(
    {
      auction: { id: 'a1', tile: 1, startedBy: 'rival', bids, endsAt: Date.now() + 30000 },
      log: [],
    },
    [me, rival],
  );
  return { me, room };
}

describe('AuctionCard bidding', () => {
  it('shows the floor price with no bids', () => {
    const { me, room } = auctionRoom([]);
    render(<AuctionCard room={room} me={me} emit={() => {}} />);
    expect(screen.getByText('No bids yet — min $10')).toBeTruthy();
  });

  it('quick-bids the computed target for the top bidder', () => {
    const { me, room } = auctionRoom([
      { playerId: 'rival', amount: 50, at: 1 },
      { playerId: 'me', amount: 80, at: 2 },
    ]);
    const emit = vi.fn();
    render(<AuctionCard room={room} me={me} emit={emit} />);
    // Top $80 → min next $81; +25 quick bid targets max(81, 80 + 25).
    // Matcher reads full text: the label is split across button + span nodes.
    const quick25 = screen.getByText((_, el) => el?.tagName === 'BUTTON' && (el.textContent ?? '') === '+$25 $105');
    fireEvent.click(quick25);
    expect(emit).toHaveBeenCalledWith('auctionBid', { amount: 105 }, expect.anything());
  });

  it('clamps a typed bid up to the minimum next bid', () => {
    const { me, room } = auctionRoom([
      { playerId: 'me', amount: 50, at: 1 },
      { playerId: 'rival', amount: 80, at: 2 },
    ]);
    const emit = vi.fn();
    render(<AuctionCard room={room} me={me} emit={emit} />);
    expect(screen.getByText(/Outbid by/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('81'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Bid', { exact: true }));
    expect(emit).toHaveBeenCalledWith('auctionBid', { amount: 81 }, expect.anything());
  });

  it('renders nothing without a live auction', () => {
    const me = mkTestPlayer({ id: 'me' });
    const room = mkTestRoom({ auction: null }, [me]);
    const { container } = render(<AuctionCard room={room} me={me} emit={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
