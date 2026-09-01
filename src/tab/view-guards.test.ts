import { describe, it, expect } from 'vitest';
import { makeTab } from './index.js';
import type { Tab } from './types.js';
import {
  isHarnessTab, isEditorTab, isFilesTab, isPluginTab, isMonitorTab,
} from './view-guards.js';

const tab = (overrides: Partial<Tab>): Tab => ({ ...makeTab('t', '#fff'), ...overrides });

const HARNESS = { name: 'claude', ptyId: 'p1', status: 'running' } as NonNullable<Tab['harness']>;
const EDITOR = { name: 'a.txt', path: '/repo/a.txt', size: '1 B', url: '/open/1' } as NonNullable<Tab['editor']>;
const FILES = { root: '/repo', rows: [] } as unknown as NonNullable<Tab['files']>;
const PLUGIN = { id: 'image', instanceKey: '/repo/a.png' } as unknown as NonNullable<Tab['plugin']>;
const MONITOR = { suggestions: [], persona: 'security', targets: '', contextBytes: 0 };

// Each guard has to check both halves of the record's prose invariant. The payload half is the one
// that matters at runtime: a tab carrying the right `view` but no payload is exactly the case the
// non-null assertions these guards replaced used to turn into a TypeError.
describe.each([
  ['harness', isHarnessTab, 'harness', { harness: HARNESS }] as const,
  ['editor', isEditorTab, 'editor', { editor: EDITOR }] as const,
  ['files', isFilesTab, 'files', { files: FILES }] as const,
  ['plugin', isPluginTab, 'plugin', { plugin: PLUGIN }] as const,
  ['monitor', isMonitorTab, 'monitor', { monitor: MONITOR }] as const,
])('is%sTab', (kind, guard, view, payload) => {
  it('admits a tab with both the view and the payload', () => {
    expect(guard(tab({ view, ...payload }))).toBe(true);
  });

  it('rejects a tab of that view whose payload is absent', () => {
    expect(guard(tab({ view }))).toBe(false);
  });

  it('rejects a tab carrying the payload under another view', () => {
    expect(guard(tab({ view: 'agent', ...payload }))).toBe(false);
  });

  it('rejects a plain agent tab', () => {
    expect(guard(tab({ view: 'agent' }))).toBe(false);
    expect(guard(tab({}))).toBe(false);
  });

  it(`narrows the payload for a ${kind} tab`, () => {
    const candidate = tab({ view, ...payload });
    expect(guard(candidate) && candidate.view).toBe(view);
  });
});
