import { describe, expect, it } from 'vitest';
import type { ConnectionRow } from '@shared/plugins/connections/shared';
import {
  connectionClickSelection,
  connectionKeyboardNavigation,
  connectionListOrder,
  nextConnectionSelection,
} from './connection-list-keys';

const row = (id: string): ConnectionRow => ({
  type: 'record', id, kind: 'acp', title: id, model: 'model', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 1, status: 'Closed', orderingTimestamp: 1,
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
});
