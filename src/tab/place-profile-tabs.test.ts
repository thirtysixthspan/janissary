import { describe, expect, it } from 'vitest';
import type { Tab } from './types.js';
import { applyProfileTabPanes, resolveProfileTabFocus } from './place-profile-tabs.js';

function tab(label: string, extra: Partial<Tab> = {}): Tab {
  return {
    label, dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
    log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0, ...extra,
  };
}

describe('applyProfileTabPanes', () => {
  it('sets pane to right for a matching center-action tab requesting the right pane', () => {
    const tabs = [tab('one')];
    applyProfileTabPanes(tabs, [{ label: 'one', pane: 'right' }]);
    expect(tabs[0]?.pane).toBe('right');
  });

  it('clears pane for a matching tab not requesting the right pane', () => {
    const tabs = [tab('one', { pane: 'right' })];
    applyProfileTabPanes(tabs, [{ label: 'one' }]);
    expect(tabs[0]?.pane).toBeUndefined();
  });

  it('ignores candidates with no matching tab', () => {
    const tabs = [tab('one')];
    applyProfileTabPanes(tabs, [{ label: 'missing', pane: 'right' }]);
    expect(tabs[0]?.pane).toBeUndefined();
  });

  it('ignores a matching tab that is not a center-action tab', () => {
    const tabs = [tab('one', { dock: 'bottom' })];
    applyProfileTabPanes(tabs, [{ label: 'one', pane: 'right' }]);
    expect(tabs[0]?.pane).toBeUndefined();
  });
});

describe('resolveProfileTabFocus', () => {
  it('returns both an active and secondary tab when candidates fill both panes', () => {
    const tabs = [tab('left'), tab('right', { pane: 'right' })];
    const result = resolveProfileTabFocus(
      tabs, 0,
      [{ label: 'left' }, { label: 'right', pane: 'right' }],
      (label) => tabs.findIndex((item) => item.label === label),
    );
    expect(result).toEqual({ activeTab: 0, secondaryTabLabel: 'right' });
  });

  it('activates the left candidate when only a left candidate is placed and the active tab is not on the right', () => {
    const tabs = [tab('left')];
    const result = resolveProfileTabFocus(
      tabs, 0, [{ label: 'left' }],
      (label) => tabs.findIndex((item) => item.label === label),
    );
    expect(result).toEqual({ activeTab: 0 });
  });

  it('makes the left candidate secondary when the active tab is already on the right', () => {
    const tabs = [tab('right', { pane: 'right' })];
    const result = resolveProfileTabFocus(
      tabs, 0, [{ label: 'left' }],
      (label) => tabs.findIndex((item) => item.label === label),
    );
    expect(result).toEqual({ secondaryTabLabel: 'left' });
  });

  it('activates the right candidate when the active tab is already on the right', () => {
    const tabs = [tab('right', { pane: 'right' })];
    const result = resolveProfileTabFocus(
      tabs, 0, [{ label: 'right', pane: 'right' }],
      (label) => tabs.findIndex((item) => item.label === label),
    );
    expect(result).toEqual({ activeTab: 0 });
  });

  it('makes the right candidate secondary when the active tab is not on the right', () => {
    const tabs = [tab('left')];
    const result = resolveProfileTabFocus(
      tabs, 0, [{ label: 'right', pane: 'right' }],
      (label) => tabs.findIndex((item) => item.label === label),
    );
    expect(result).toEqual({ secondaryTabLabel: 'right' });
  });

  it('returns an empty object when there are no candidates', () => {
    const tabs = [tab('left')];
    const result = resolveProfileTabFocus(tabs, 0, [], (label) => tabs.findIndex((item) => item.label === label));
    expect(result).toEqual({});
  });
});
