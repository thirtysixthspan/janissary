import { describe, expect, it } from 'vitest';
import { makeTab } from './index.js';
import { byLabel, editorTab, filesTab, harnessTab, monitorTab, pluginTab, editorTabByUrl, filesTabByRoot, harnessTabByPtyId, pluginTabByInstanceKey } from './lookup.js';
import type { Tab } from './types.js';

const withView = (label: string, view: Tab['view'], payload: Partial<Tab>): Tab =>
  ({ ...makeTab(label, '#aaa'), view, ...payload }) as Tab;

const HARNESS = withView('h', 'harness', { harness: { name: 'claude', program: 'claude', ptyId: 'p1', status: 'running' } });
const EDITOR = withView('e', 'editor', { editor: { name: 'a.txt', url: '/open/1', path: '/a.txt', size: '1 B' } as Tab['editor'] });
const FILES = withView('f', 'files', { files: { root: '/', rows: [], expanded: [] } as unknown as Tab['files'] });
const PLUGIN = withView('p', 'plugin', { plugin: { id: 'video', schemaVersion: 1, instanceKey: 'k1', payload: {} } as unknown as Tab['plugin'] });
const MONITOR = withView('m', 'monitor', {
  monitor: { suggestions: [], name: 'm', persona: 'reviewer', targets: '', contextBytes: 0 },
});

const TABS: Tab[] = [makeTab('plain', '#bbb'), HARNESS, EDITOR, FILES, PLUGIN, MONITOR];

describe('byLabel', () => {
  it('finds a tab by its label', () => {
    expect(byLabel(TABS, 'plain')?.label).toBe('plain');
  });

  it('is undefined for a label no tab carries', () => {
    expect(byLabel(TABS, 'ghost')).toBeUndefined();
  });

  // Behavior must not move: this replaces `tabs.find(...)` at fifty-two call sites, and `find`
  // answers with the first match.
  it('returns the first of two tabs sharing a label, exactly as find does', () => {
    const first = makeTab('dup', '#111');
    const second = makeTab('dup', '#222');
    expect(byLabel([first, second], 'dup')).toBe(first);
  });
});

const ACCESSORS = [
  ['harnessTab', harnessTab, HARNESS, 'harness'],
  ['editorTab', editorTab, EDITOR, 'editor'],
  ['filesTab', filesTab, FILES, 'files'],
  ['pluginTab', pluginTab, PLUGIN, 'plugin'],
  ['monitorTab', monitorTab, MONITOR, 'monitor'],
] as const;

describe('the guard-typed accessors', () => {
  it.each(ACCESSORS)('%s returns the tab of its own kind', (_name, accessor, tab) => {
    expect(accessor(TABS, tab.label)).toBe(tab);
  });

  it.each(ACCESSORS)('%s is undefined for a label no tab carries', (_name, accessor) => {
    expect(accessor(TABS, 'ghost')).toBeUndefined();
  });

  it.each(ACCESSORS)('%s is undefined for a tab of another kind', (_name, accessor, tab) => {
    const other = ACCESSORS.map((entry) => entry[2]).find((candidate) => candidate !== tab)!;
    expect(accessor(TABS, other.label)).toBeUndefined();
  });

  // The case the `tab?.<payload>` checks these replace got wrong in the other direction, and the
  // one they got wrong here: a tab whose `view` names the kind but whose payload never arrived —
  // a harness caught mid-provision, a plugin record dropped by a failed activation.
  it.each(ACCESSORS)('%s is undefined when the discriminant says %s but the payload is absent', (_name, accessor, _tab, view) => {
    const hollow = { ...makeTab('hollow', '#ccc'), view } as Tab;
    expect(accessor([hollow], 'hollow')).toBeUndefined();
  });

  it.each(ACCESSORS)('%s is undefined for a plain agent tab', (_name, accessor) => {
    expect(accessor(TABS, 'plain')).toBeUndefined();
  });
});

const KEYED = [
  ['harnessTabByPtyId', harnessTabByPtyId, HARNESS],
  ['editorTabByUrl', editorTabByUrl, EDITOR],
  ['pluginTabByInstanceKey', pluginTabByInstanceKey, PLUGIN],
  ['filesTabByRoot', filesTabByRoot, FILES],
] as const;

function keyOf(tab: Tab): [string, string] {
  if (tab.harness) return [tab.harness.ptyId, ''];
  if (tab.editor) return [tab.editor.url, ''];
  if (tab.files) return [tab.files.root, ''];
  return [tab.plugin?.id ?? '', tab.plugin?.instanceKey ?? ''];
}

describe('the keyed lookup helpers', () => {
  it.each(KEYED)('%s answers with its own tab', (_name, helper, tab) => {
    const [id, key] = keyOf(tab);
    expect(helper(TABS, id, key)).toBe(tab);
  });

  it.each(KEYED)('%s is undefined for a key nothing carries', (_name, helper) => {
    expect(helper(TABS, 'no-key', 'no-key')).toBeUndefined();
  });

  it.each(KEYED)('%s is undefined when the view names the kind but the payload is absent', (_name, helper, tab) => {
    const hollow = { ...makeTab('hollow', '#ccc'), view: tab.view } as Tab;
    const [id, key] = keyOf(tab);
    expect(hollow.files === undefined && hollow.editor === undefined).toBe(true);
    expect(helper([hollow], id, key)).toBeUndefined();
  });

  it.each(KEYED)('%s is undefined for a tab with the payload data but no view discriminant', (_name, helper, tab) => {
    const [id, key] = keyOf(tab);
    const bare = { ...makeTab('bare', '#ccc'), ...tab } as Tab & { view?: string };
    delete bare.view;
    expect(helper([bare], id, key)).toBeUndefined();
  });

  // The first match wins, as the scans these replace did.
  it.each(KEYED)('%s returns the first of two matching tabs', (_name, helper, tab) => {
    const clone = { ...tab, label: `${tab.label}-2` };
    const [id, key] = keyOf(tab);
    expect(helper([clone, tab], id, key)).toBe(clone);
  });
});
