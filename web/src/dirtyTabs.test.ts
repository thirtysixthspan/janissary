import { describe, it, expect } from 'vitest';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { DirtyTabHandle } from './tab-handles';
import { anyDirtyTab } from './dirtyTabs';

function makeTab(label: string, hasEditor: boolean): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false, editor: hasEditor ? { name: 'a.txt', path: '/a.txt', size: '1 B', url: '/open/1' } : undefined,
  } as unknown as TabView;
}

function makePluginTab(label: string): TabView {
  return {
    ...makeTab(label, false),
    view: 'plugin',
    plugin: { id: 'image', schemaVersion: 1, payload: {} },
  } as unknown as TabView;
}

function makeHandles(dirty: Record<string, boolean>): React.RefObject<Map<string, DirtyTabHandle>> {
  const map = new Map<string, DirtyTabHandle>();
  for (const [label, isDirty] of Object.entries(dirty)) {
    map.set(label, { isDirty: () => isDirty, save: async () => {}, focus: () => {} });
  }
  return { current: map };
}

describe('anyDirtyTab', () => {
  it('is false when there are no editor tabs', () => {
    expect(anyDirtyTab([makeTab('a', false)], makeHandles({}))).toBe(false);
  });

  it('is false when every editor tab is clean', () => {
    expect(anyDirtyTab([makeTab('a', true)], makeHandles({ a: false }))).toBe(false);
  });

  it('is true when any editor tab is dirty', () => {
    expect(anyDirtyTab([makeTab('a', true), makeTab('b', true)], makeHandles({ a: false, b: true }))).toBe(true);
  });

  it('is false when a tab has an editor view but no registered handle yet', () => {
    expect(anyDirtyTab([makeTab('a', true)], makeHandles({}))).toBe(false);
  });

  // Dropping the editor-only filter widened the query to any tab holding a registered handle, which
  // is what lets an image tab with an unsaved crop reach the whole-app close paths.
  it('is true when a plugin tab has registered a dirty handle', () => {
    expect(anyDirtyTab([makePluginTab('img')], makeHandles({ img: true }))).toBe(true);
  });

  it('is false for a clean plugin tab and for one with no handle at all', () => {
    expect(anyDirtyTab([makePluginTab('img')], makeHandles({ img: false }))).toBe(false);
    expect(anyDirtyTab([makePluginTab('img')], makeHandles({}))).toBe(false);
  });

  it('still answers for a dirty editor tab alongside a clean plugin tab', () => {
    expect(anyDirtyTab(
      [makePluginTab('img'), makeTab('a', true)],
      makeHandles({ img: false, a: true }),
    )).toBe(true);
  });
});
