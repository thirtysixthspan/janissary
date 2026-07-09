import { describe, it, expect } from 'vitest';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { EditorTabHandle } from './EditorTab';
import { anyDirtyEditor } from './dirtyEditors';

function makeTab(label: string, hasEditor: boolean): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false, editor: hasEditor ? { name: 'a.txt', path: '/a.txt', size: '1 B', url: '/open/1' } : undefined,
  } as unknown as TabView;
}

function makeHandles(dirty: Record<string, boolean>): React.RefObject<Map<string, EditorTabHandle>> {
  const map = new Map<string, EditorTabHandle>();
  for (const [label, isDirty] of Object.entries(dirty)) {
    map.set(label, { isDirty: () => isDirty, save: async () => {}, focus: () => {} });
  }
  return { current: map };
}

describe('anyDirtyEditor', () => {
  it('is false when there are no editor tabs', () => {
    expect(anyDirtyEditor([makeTab('a', false)], makeHandles({}))).toBe(false);
  });

  it('is false when every editor tab is clean', () => {
    expect(anyDirtyEditor([makeTab('a', true)], makeHandles({ a: false }))).toBe(false);
  });

  it('is true when any editor tab is dirty', () => {
    expect(anyDirtyEditor([makeTab('a', true), makeTab('b', true)], makeHandles({ a: false, b: true }))).toBe(true);
  });

  it('is false when a tab has an editor view but no registered handle yet', () => {
    expect(anyDirtyEditor([makeTab('a', true)], makeHandles({}))).toBe(false);
  });
});
