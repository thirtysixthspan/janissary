import { describe, expect, it } from 'vitest';
import type { LauncherTabRow } from '@shared/plugins/launcher/shared';
import { launcherTiers } from './tiers';

function row(label: string, overrides: Partial<LauncherTabRow> = {}): LauncherTabRow {
  return {
    label, busy: false, hasUnread: false, needsInput: false,
    lastActivity: 60_000, cwd: '/repo', ...overrides,
  };
}

// The busiest realistic rail: one of everything, in an order the sort is expected to rearrange.
const MIXED: LauncherTabRow[] = [
  row('idle-only'),
  row('busy-one', { busy: true }),
  row('active-one'),
  row('unread-one', { hasUnread: true }),
  row('needs-one', { needsInput: true }),
  row('idle-two'),
];

describe('the five tiers', () => {
  it('puts a tab waiting on the user above every other state', () => {
    const tiers = launcherTiers(MIXED);

    expect(tiers[0]?.key).toBe('needsInput');
    expect(tiers[0]?.rows.map((entry) => entry.label)).toEqual(['needs-one']);
  });

  it('orders unread above the active tab, and busy above idle', () => {
    const tiers = launcherTiers(MIXED);

    expect(tiers.map((tier) => tier.key)).toEqual(['needsInput', 'unread', 'busy', 'idle']);
    expect(tiers[1]?.rows.map((entry) => entry.label)).toEqual(['unread-one']);
    expect(tiers[2]?.rows.map((entry) => entry.label)).toEqual(['busy-one']);
    // Nothing named the active tab here, so the row is merely idle and sits in strip order.
    expect(tiers[3]?.rows.map((entry) => entry.label)).toEqual(['idle-only', 'active-one', 'idle-two']);
  });

  it('lifts the named active tab into its own tier', () => {
    const tiers = launcherTiers(MIXED, 'active-one');

    expect(tiers.map((tier) => tier.key)).toEqual(['needsInput', 'unread', 'active', 'busy', 'idle']);
    expect(tiers[2]?.rows.map((entry) => entry.label)).toEqual(['active-one']);
    expect(tiers[3]?.rows.map((entry) => entry.label)).toEqual(['busy-one']);
    expect(tiers[4]?.rows.map((entry) => entry.label)).toEqual(['idle-only', 'idle-two']);
  });

  it('keeps the strip order inside a tier, so a row never moves under the pointer', () => {
    const rows = [
      row('third'), row('first'), row('second'),
    ];

    const tiers = launcherTiers(rows);

    expect(tiers[0]?.rows.map((entry) => entry.label)).toEqual(['third', 'first', 'second']);
  });

  it('does not draw a tier no row is in', () => {
    const tiers = launcherTiers([row('busy-one', { busy: true })]);

    expect(tiers.map((tier) => tier.key)).toEqual(['busy']);
  });

  it('gives every tier a label, because the rail has no section headings of its own', () => {
    const tiers = launcherTiers(MIXED, 'active-one');

    expect(tiers.map((tier) => tier.label)).toEqual(['Needs you', 'Unread', 'Active', 'Working', 'Idle']);
  });

  it('draws nothing at all for a rail with no rows', () => {
    expect(launcherTiers([])).toEqual([]);
  });

  // The badge is the more actionable statement, so it outranks the active position: the tier order puts
  // unread above active, exactly as the tab strip's own badge survives a three-second dwell.
  it('reads a badged active tab as unread, above one that is merely active', () => {
    const tiers = launcherTiers([
      row('active-unread', { hasUnread: true }),
      row('active-clean'),
    ], 'active-clean');

    expect(tiers.map((tier) => tier.key)).toEqual(['unread', 'active']);
  });

  it('reads a needs-input tab above one that is merely unread', () => {
    const tiers = launcherTiers([
      row('unread-one', { hasUnread: true, busy: true }),
      row('needs-one', { needsInput: true, busy: true }),
    ]);

    expect(tiers.map((tier) => tier.key)).toEqual(['needsInput', 'unread']);
  });
});
