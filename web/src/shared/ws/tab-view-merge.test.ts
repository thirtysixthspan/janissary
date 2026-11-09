import { describe, expect, it } from 'vitest';
import type { StateEvent, TabView } from '@shared/protocol';
import { mergeTabView } from './tab-view-merge';

const tab = (label: string, busy = false) => ({ label, busy, bufferLines: [] }) as unknown as TabView;
const state = { t: 'state', tabs: [tab('a'), tab('b')], activeTab: 1, theme: 'dark' } as unknown as StateEvent;

describe('mergeTabView', () => {
  it('replaces only the named tab and keeps the rest of the snapshot', () => {
    const updated = tab('b', true);

    const merged = mergeTabView(state, { t: 'tab-view-updated', tab: updated });

    expect(merged?.tabs).toEqual([state.tabs[0], updated]);
    expect(merged?.tabs[0]).toBe(state.tabs[0]);
    expect(merged).toMatchObject({ activeTab: 1, theme: 'dark' });
  });

  it('returns undefined when the snapshot has no such tab', () => {
    expect(mergeTabView(state, { t: 'tab-view-updated', tab: tab('c') })).toBeUndefined();
  });
});
