import { describe, expect, it } from 'vitest';
import type { HostRow } from '@shared/plugins/hosts/shared';
import {
  hostClickSelection, hostIdentity, hostTooltip, nextHostSelection,
} from './hosts-keys';

const FILE = '/home/me/.janissary/hosts.json';

function row(overrides: Partial<HostRow> = {}): HostRow {
  return {
    name: 'lab', user: 'admin', destination: 'devbox:2222', path: '/srv/ws',
    ...overrides,
  };
}

function identity(overrides: Partial<HostRow> = {}, filePath = FILE) {
  return hostIdentity(row(overrides), filePath);
}

describe('hostClickSelection', () => {
  it('highlights on a first click and opens on a second click of the same row', () => {
    const current = identity();
    expect(hostClickSelection(0, null, null, current)).toEqual({ selected: 0, opens: false });
    expect(hostClickSelection(0, 0, current, current)).toEqual({ selected: 0, opens: true });
  });

  it('requires a first click after keyboard navigation clears the confirmation', () => {
    const current = identity();
    expect(hostClickSelection(1, null, current, current)).toEqual({ selected: 1, opens: false });
  });

  it('does not open when the click lands on a different row', () => {
    expect(hostClickSelection(2, 0, identity(), identity({ name: 'other' })))
      .toEqual({ selected: 2, opens: false });
  });

  it('does not inherit confirmation when a different row replaces the old one at the same index', () => {
    const previous = identity({ name: 'lab' });
    expect(hostClickSelection(1, 1, previous, identity({ name: ' Lab ' })))
      .toEqual({ selected: 1, opens: false });
    expect(hostClickSelection(1, 1, previous, identity({ user: 'root' })))
      .toEqual({ selected: 1, opens: false });
    expect(hostClickSelection(1, 1, previous, identity({ destination: 'other:22' })))
      .toEqual({ selected: 1, opens: false });
    expect(hostClickSelection(1, 1, previous, identity({ path: '/opt' })))
      .toEqual({ selected: 1, opens: false });
  });

  it('does not inherit confirmation when the catalog at the same index changes', () => {
    const previous = identity();
    const current = identity({}, '/workspace/.janissary/hosts.json');
    expect(hostClickSelection(0, 0, previous, current)).toEqual({ selected: 0, opens: false });
  });
});

describe('hostTooltip', () => {
  it('shows the full user and destination on one line', () => {
    expect(hostTooltip('admin', 'devbox:2222', '')).toBe('admin@devbox:2222');
  });

  it('falls back to the bare destination when there is no user', () => {
    expect(hostTooltip('', 'devbox', '')).toBe('devbox');
  });

  it('puts a nonempty path on the next line', () => {
    expect(hostTooltip('admin', 'devbox:2222', '/srv/ws')).toBe('admin@devbox:2222\n/srv/ws');
  });
});

describe('nextHostSelection', () => {
  it('moves down and up without wrapping past either end', () => {
    expect(nextHostSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextHostSelection(3, 2, 'ArrowDown')).toBe(2);
    expect(nextHostSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextHostSelection(3, 0, 'ArrowUp')).toBe(0);
  });

  it('jumps to the ends on Home and End', () => {
    expect(nextHostSelection(3, 2, 'Home')).toBe(0);
    expect(nextHostSelection(3, 0, 'End')).toBe(2);
  });

  it('selects nothing in an empty list and ignores any other key', () => {
    expect(nextHostSelection(0, null, 'ArrowDown')).toBeNull();
    expect(nextHostSelection(3, 1, 'PageDown')).toBe(1);
  });
});
