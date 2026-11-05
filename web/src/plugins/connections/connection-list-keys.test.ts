import { describe, expect, it } from 'vitest';
import type { ConnectionRow } from '@shared/plugins/connections/shared';
import {
  connectionActivity,
  connectionClickSelection,
  connectionKeyboardNavigation,
  connectionListOrder,
  connectionRowIdentity,
  nextConnectionSelection,
} from './connection-list-keys';

const row = (id: string): ConnectionRow => ({
  type: 'record', id, kind: 'acp', title: id, model: 'model', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 1, status: 'Closed', orderingTimestamp: 1,
});

const shell = (ownerLabel: string, display: string): ConnectionRow => ({
  type: 'live', id: 'zsh', kind: 'shell', display, host: 'Local', ownerLabel, ownerName: ownerLabel,
  status: 'Open', orderingTimestamp: 2,
});

describe('connections list selection helpers', () => {
  it('clamps keyboard movement and handles Home, End, and empty lists', () => {
    expect(nextConnectionSelection(3, 2, 'ArrowDown')).toBe(2);
    expect(nextConnectionSelection(3, 0, 'ArrowUp')).toBe(0);
    expect(nextConnectionSelection(3, 1, 'Home')).toBe(0);
    expect(nextConnectionSelection(3, 1, 'End')).toBe(2);
    expect(nextConnectionSelection(0, null, 'ArrowDown')).toBeNull();
  });

  it('opens only the second click on the same stable row identity', () => {
    const rows = [row('first'), row('second')];
    const first = connectionClickSelection(1, rows, null);
    expect(first.opens).toBe(false);
    expect(connectionClickSelection(1, rows, first.confirmation).opens).toBe(true);
    expect(connectionClickSelection(0, rows, first.confirmation).opens).toBe(false);
  });

  it('clears click confirmation on keyboard navigation', () => {
    expect(connectionKeyboardNavigation(2, 0, 'ArrowDown')).toEqual({ selected: 1, confirmation: null });
    expect(connectionKeyboardNavigation(2, 1, 'Home')).toEqual({ selected: 0, confirmation: null });
    expect(connectionKeyboardNavigation(2, 1, 'Enter')).toBeNull();
  });

  it('invalidates confirmation when identity or row order changes, even at the same length', () => {
    const rows = [row('first'), row('second')];
    const confirmation = connectionClickSelection(0, rows, null).confirmation;
    expect(connectionClickSelection(0, [row('replacement'), row('second')], confirmation).opens).toBe(false);
    expect(connectionClickSelection(0, [row('second'), row('first')], confirmation).opens).toBe(false);
    expect(connectionListOrder(rows)).not.toBe(connectionListOrder([row('second'), row('first')]));
  });

  it('gives same-id shell rows from different owners distinct identities and order', () => {
    const first = shell('first', 'shell:~/first');
    const second = shell('second', 'shell:~/second');
    const replacement = shell('replacement', 'shell:~/replacement');

    expect(connectionRowIdentity(first)).not.toBe(connectionRowIdentity(second));
    expect(connectionListOrder([first, second])).not.toBe(connectionListOrder([second, first]));
    expect(connectionListOrder([first, second])).not.toBe(connectionListOrder([first, replacement]));
    expect(connectionListOrder([first, second])).toBe(connectionListOrder([{ ...first }, { ...second }]));
  });

  it('does not carry a confirmation to another same-id shell row with a different owner', () => {
    const first = shell('first', 'shell:~/first');
    const second = shell('second', 'shell:~/second');
    const confirmation = connectionClickSelection(0, [first, second], null).confirmation;

    expect(connectionClickSelection(1, [first, second], confirmation).opens).toBe(false);
    expect(connectionClickSelection(0, [second, first], confirmation).opens).toBe(false);
    expect(connectionClickSelection(0, [first, second], confirmation).opens).toBe(true);
  });

  it('invalidates a same-id shell confirmation when another row is replaced at the same length', () => {
    const first = shell('first', 'shell:~/first');
    const second = shell('second', 'shell:~/second');
    const replacement = shell('replacement', 'shell:~/replacement');
    const confirmation = connectionClickSelection(0, [first, second], null).confirmation;

    expect(connectionClickSelection(1, [first, replacement], confirmation).opens).toBe(false);
    const fresh = connectionClickSelection(1, [first, replacement], confirmation);
    expect(connectionClickSelection(1, [first, replacement], fresh.confirmation).opens).toBe(true);
  });
});

describe('connectionActivity', () => {
  const NOW = 1_000_000_000;

  it('renders a known timestamp as relative age with its ISO stamp', () => {
    expect(connectionActivity(NOW - 2 * 60 * 60_000, NOW))
      .toEqual({ text: '2h ago', dateTime: new Date(NOW - 2 * 60 * 60_000).toISOString() });
  });

  it('renders no activity for the zero timestamp', () => {
    expect(connectionActivity(0, NOW)).toEqual({ text: '' });
  });
});
