import { describe, it, expect } from 'vitest';
import type { TabView } from '@shared/protocol';
import {
  isHarnessTabView, isEditorTabView, isFilesTabView, isPluginTabView, isMonitorTabView, indexedTabs,
} from './tab-view-guards';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'a', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false,
    ...overrides,
  };
}

const HARNESS = { name: 'claude', ptyId: 'p1', status: 'running' } as NonNullable<TabView['harness']>;
const EDITOR = { name: 'a.txt', path: '/repo/a.txt', size: '1 B', url: '/open/1' } as NonNullable<TabView['editor']>;
const FILES = { root: '/repo', rows: [] } as unknown as NonNullable<TabView['files']>;
const PLUGIN = { id: 'image' } as unknown as NonNullable<TabView['plugin']>;
const MONITOR = { suggestions: [], persona: 'security', targets: '', contextBytes: 0 };

describe.each([
  ['harness', isHarnessTabView, 'harness', { harness: HARNESS }] as const,
  ['editor', isEditorTabView, 'editor', { editor: EDITOR }] as const,
  ['files', isFilesTabView, 'files', { files: FILES }] as const,
  ['plugin', isPluginTabView, 'plugin', { plugin: PLUGIN }] as const,
  ['monitor', isMonitorTabView, 'monitor', { monitor: MONITOR }] as const,
])('is%sTabView', (_kind, guard, view, payload) => {
  it('admits a tab with both the view and the payload', () => {
    expect(guard(makeTab({ view, ...payload }))).toBe(true);
  });

  it('rejects a tab of that view whose payload is absent', () => {
    expect(guard(makeTab({ view }))).toBe(false);
  });

  it('rejects a tab carrying the payload under another view', () => {
    expect(guard(makeTab({ view: 'agent', ...payload }))).toBe(false);
  });

  it('rejects a plain agent tab', () => {
    expect(guard(makeTab({ view: 'agent' }))).toBe(false);
    expect(guard(makeTab())).toBe(false);
  });
});

describe('indexedTabs', () => {
  const strip = [
    makeTab({ label: 'conversations' }),
    makeTab({ label: 'claude', view: 'harness', harness: HARNESS }),
    makeTab({ label: 'notes', view: 'editor', editor: EDITOR }),
    makeTab({ label: 'ssh', view: 'harness', harness: HARNESS }),
  ];

  it('keeps only the tabs the guard admits', () => {
    expect(indexedTabs(strip, isHarnessTabView).map(({ t }) => t.label)).toEqual(['claude', 'ssh']);
  });

  // The property a filter-then-map would break: these indices address the *whole* strip, and the
  // pane layout, close, and split handlers route by them.
  it('carries each tab index from the unfiltered strip, not the filtered one', () => {
    expect(indexedTabs(strip, isHarnessTabView).map(({ index }) => index)).toEqual([1, 3]);
    expect(indexedTabs(strip, isEditorTabView).map(({ index }) => index)).toEqual([2]);
  });

  it('skips a tab of the right view whose payload is missing', () => {
    const withGap = [...strip, makeTab({ label: 'provisioning', view: 'harness' })];
    expect(indexedTabs(withGap, isHarnessTabView).map(({ t }) => t.label)).toEqual(['claude', 'ssh']);
  });

  it('returns nothing for a strip with no matching tab', () => {
    expect(indexedTabs(strip, isMonitorTabView)).toEqual([]);
  });
});
