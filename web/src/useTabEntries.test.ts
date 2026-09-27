import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { reorderTabEntries, useTabEntries } from './useTabEntries';

// Two things the strip needs from this module, and one thing it must never get wrong. Each entry
// keeps its index in the server's full tab list for RPCs, because a tab docked into a sidebar leaves
// the strip while staying in that array — so a reorder that sent the entry's *position* would move
// the wrong tab as soon as anything was docked.

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  } as TabView;
}

function fakeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('reorderTabEntries', () => {
  it('sends the tabs\' own server indices, not their positions in the strip', () => {
    const { client, send } = fakeClient();
    // The strip shows server tabs 2 and 5: the others are docked and still occupy indices.
    const entries = [{ tab: makeTab({ label: 'a' }), index: 2 }, { tab: makeTab({ label: 'b' }), index: 5 }];

    reorderTabEntries(client, entries, 0, 1);

    expect(send).toHaveBeenCalledWith({ method: 'reorderTabTo', params: { from: 2, to: 5 } });
  });

  it('sends the indices the other way round for a backwards drag', () => {
    const { client, send } = fakeClient();
    const entries = [{ tab: makeTab({ label: 'a' }), index: 2 }, { tab: makeTab({ label: 'b' }), index: 5 }];

    reorderTabEntries(client, entries, 1, 0);

    expect(send).toHaveBeenCalledWith({ method: 'reorderTabTo', params: { from: 5, to: 2 } });
  });
});

describe('useTabEntries', () => {
  it('splits the center strip from the reporting tabs below the bar', () => {
    const tabs = [
      makeTab({ label: 'janus' }),
      makeTab({ label: 'writer', view: 'monitor' }),
      makeTab({ label: 'notes' }),
    ];

    const { result } = renderHook(() => useTabEntries(tabs));

    expect(result.current.actionEntries.map((entry) => entry.tab.label)).toEqual(['janus', 'notes']);
    expect(result.current.reportingEntries.map((entry) => entry.tab.label)).toEqual(['writer']);
  });

  it('keeps each entry\'s index in the server\'s full tab list', () => {
    const tabs = [
      makeTab({ label: 'a', dock: 'left' }),
      makeTab({ label: 'b' }),
      makeTab({ label: 'writer', view: 'monitor' }),
    ];

    const { result } = renderHook(() => useTabEntries(tabs));

    expect(result.current.actionEntries).toEqual([{ tab: tabs[1], index: 1 }]);
    expect(result.current.reportingEntries).toEqual([{ tab: tabs[2], index: 2 }]);
  });

  it('leaves a docked tab out of the strip entirely', () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'side', dock: 'right' })];

    const { result } = renderHook(() => useTabEntries(tabs));

    expect(result.current.actionEntries.map((entry) => entry.tab.label)).toEqual(['a']);
    expect(result.current.reportingEntries).toEqual([]);
  });

  it('re-derives when the tabs change', () => {
    const first = [makeTab({ label: 'a' })];
    const { result, rerender } = renderHook(({ tabs }) => useTabEntries(tabs), { initialProps: { tabs: first } });
    expect(result.current.actionEntries).toHaveLength(1);

    rerender({ tabs: [...first, makeTab({ label: 'b' })] });

    expect(result.current.actionEntries.map((entry) => entry.tab.label)).toEqual(['a', 'b']);
  });
});
