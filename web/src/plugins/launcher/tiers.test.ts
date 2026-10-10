import { describe, expect, it } from 'vitest';
import type { LauncherTabRow } from '@shared/plugins/launcher/shared';
import { launcherTiers } from './tiers';

function row(label: string, overrides: Partial<LauncherTabRow> = {}): LauncherTabRow {
  return {
    label, type: 'shell', group: 1, groupColor: '#5b9cff', dotColor: '#5b9cff', active: false,
    busy: false, hasUnread: false, needsInput: false, lastActivity: 60_000, cwd: '/repo', ...overrides,
  };
}

describe('grouped status tiers', () => {
  it('organizes groups before status and keeps strip order inside each tier', () => {
    const rows = [
      row('group-two-idle', { group: 2, groupColor: '#c678dd' }),
      row('group-one-needs', { needsInput: true, groupColor: '#5b9cff' }),
      row('group-two-unread', { hasUnread: true, group: 2, groupColor: '#c678dd' }),
      row('group-one-idle', { groupColor: '#5b9cff' }),
    ];

    const groups = launcherTiers(rows);

    expect(groups.map((group) => group.number)).toEqual([2, 1]);
    expect(groups[0]?.color).toBe('#c678dd');
    expect(groups[0]?.tiers.map((tier) => tier.key)).toEqual(['unread', 'idle']);
    expect(groups[0]?.tiers.flatMap((tier) => tier.rows.map((entry) => entry.label)))
      .toEqual(['group-two-unread', 'group-two-idle']);
    expect(groups[1]?.tiers.map((tier) => tier.key)).toEqual(['needsInput', 'idle']);
    expect(groups[1]?.tiers.flatMap((tier) => tier.rows.map((entry) => entry.label)))
      .toEqual(['group-one-needs', 'group-one-idle']);
  });

  it('lifts the active row within its own group', () => {
    const groups = launcherTiers([
      row('first', { group: 1 }),
      row('second', { group: 2, busy: true }),
      row('active', { group: 2 }),
    ], 'active');

    expect(groups[0]?.tiers.map((tier) => tier.key)).toEqual(['idle']);
    expect(groups[1]?.tiers.map((tier) => tier.key)).toEqual(['active', 'busy']);
  });

  it('draws no groups when there are no rows', () => {
    expect(launcherTiers([])).toEqual([]);
  });
});
