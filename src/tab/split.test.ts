import { describe, expect, it } from 'vitest';
import type { Tab } from '../types.js';
import { centerPane, moveToOtherPane } from './split.js';

function tab(label: string, extra: Partial<Tab> = {}): Tab {
  return {
    label, dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
    log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0, ...extra,
  };
}

describe('moveToOtherPane', () => {
  it('creates a split and restores the most recent eligible tab on the left', () => {
    const result = moveToOtherPane(
      [tab('one'), tab('two'), tab('three')], 'three', 'three', undefined, ['one', 'two'],
    );
    expect(result?.tabs.find((item) => item.label === 'three')?.pane).toBe('right');
    expect(result?.activeLabel).toBe('three');
    expect(result?.secondaryLabel).toBe('two');
  });

  it('does not split a single center tab', () => {
    expect(moveToOtherPane([tab('one')], 'one', 'one', undefined, [])).toBeUndefined();
  });

  it('moves right to left and preserves a selection in the source pane', () => {
    const result = moveToOtherPane(
      [tab('left'), tab('right', { pane: 'right' }), tab('other-right', { pane: 'right' })],
      'right', 'right', 'left', ['other-right'],
    );
    expect(centerPane(result!.tabs.find((item) => item.label === 'right')!)).toBe('left');
    expect(result?.secondaryLabel).toBe('other-right');
  });

  it('collapses and normalizes when the source pane becomes empty', () => {
    const result = moveToOtherPane(
      [tab('left'), tab('right', { pane: 'right' })], 'right', 'right', 'left', [],
    );
    expect(result?.tabs.every((item) => item.pane === undefined)).toBe(true);
    expect(result?.secondaryLabel).toBeUndefined();
  });

  it.each([
    ['missing', {}],
    ['docked', { dock: 'left' as const }],
    ['monitor', { view: 'monitor' as const }],
    ['notifications', { view: 'notifications' as const }],
  ])('rejects %s targets', (_name, extra) => {
    const tabs = [tab('one'), tab('target', extra)];
    expect(moveToOtherPane(tabs, _name === 'missing' ? 'nope' : 'target', 'one', undefined, [])).toBeUndefined();
  });
});
