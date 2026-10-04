/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeedModal } from './DeedModal';
import { mkTestPlayer, mkTestRoom } from './testFixtures';

const noop = () => {};

function ownRoom(mortgaged: number[] = []) {
  const me = mkTestPlayer({ id: 'me', name: 'Me', properties: [1], mortgaged });
  const other = mkTestPlayer({ id: 'rival', name: 'Rival' });
  return { me, room: mkTestRoom({}, [me, other]) };
}

describe('DeedModal money display', () => {
  it('quotes the mortgage payout for an unmortgaged own deed', () => {
    const { me, room } = ownRoom();
    render(<DeedModal tileIndex={1} room={room} me={me} onClose={noop} emit={() => {}} />);
    // Mediterranean Ave ($60): half rounded.
    expect(screen.getByText('Mortgage (Receive $30)')).toBeTruthy();
  });

  it('quotes the shared unmortgage fee for a mortgaged own deed', () => {
    const { me, room } = ownRoom([1]);
    render(<DeedModal tileIndex={1} room={room} me={me} onClose={noop} emit={() => {}} />);
    // 60% of $60 — the 1.1x misquote ($33) fails here.
    expect(screen.getByText('Unmortgage (Pay $36)')).toBeTruthy();
  });

  it('emits mortgage for the shown tile', () => {
    const { me, room } = ownRoom();
    const emit = vi.fn();
    render(<DeedModal tileIndex={1} room={room} me={me} onClose={noop} emit={emit} />);
    fireEvent.click(screen.getByText('Mortgage (Receive $30)'));
    expect(emit).toHaveBeenCalledWith('mortgage', { tile: 1 });
  });

  it('shows no actions for another seat’s deed', () => {
    const me = mkTestPlayer({ id: 'me', name: 'Me' });
    const holder = mkTestPlayer({ id: 'rival', name: 'Rival', properties: [3] });
    const room2 = mkTestRoom({}, [me, holder]);
    render(<DeedModal tileIndex={3} room={room2} me={me} onClose={noop} emit={() => {}} />);
    expect(screen.queryByText(/Mortgage \(Receive/)).toBeNull();
    expect(screen.queryByText(/Unmortgage \(Pay/)).toBeNull();
  });

  it('renders nothing without a tile', () => {
    const { me, room } = ownRoom();
    const { container } = render(<DeedModal tileIndex={null} room={room} me={me} onClose={noop} />);
    expect(container.firstChild).toBeNull();
  });
});
