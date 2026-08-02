import { describe, expect, it, vi } from 'vitest';
import { openProfileEditors } from './editors.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const identityColor = (_group: number, fallbackDotColor: string): string => fallbackDotColor;

function makeManagers(): { managers: Managers; edit: ReturnType<typeof vi.fn> } {
  const edit = vi.fn();
  const managers = {
    openFile: { edit },
    tab: { tabs: [{ label: 'editor', group: 1, dotColor: 'green' }], activeTab: 0, setActiveTab: vi.fn(), findIndex: vi.fn() },
  } as unknown as Managers;
  return { managers, edit };
}

// A mutable-tabs mock, matching the one `agent-opener.test.ts` uses, needed to exercise the
// relocation path (which reads/writes `managers.tab.tabs` and `activeTab` after `edit` runs).
function makeMutableManagers(tabs: Tab[]): { managers: Managers; edit: ReturnType<typeof vi.fn> } {
  let activeTab = 0;
  const edit = vi.fn((_command: string, _target: string, label: string) => {
    const creator = tabs.find((t) => t.label === label);
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? 'green';
    tabs = [...tabs, makeTab('editor', 'green', tabs.length + 1, [], [], undefined, group, groupColor)];
    activeTab = tabs.length - 1;
  });
  const managers = {
    openFile: { edit },
    tab: {
      get tabs() { return tabs; },
      set tabs(value: Tab[]) { tabs = value; },
      get activeTab() { return activeTab; },
      setActiveTab: vi.fn((index: number) => { activeTab = index; }),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    },
  } as unknown as Managers;
  return { managers, edit };
}

describe('openProfileEditors', () => {
  it('opens an editor at the default label and returns its focus presentation', () => {
    const { managers, edit } = makeManagers();
    const opened = openProfileEditors([{ path: '$root/product/backlog/features.md', number: 2, focus: true }], managers, 'agent', [], 1, identityColor);

    expect(edit).toHaveBeenCalledWith('edit $root/product/backlog/features.md', '$root/product/backlog/features.md', 'agent', undefined);
    expect(opened).toEqual([{ label: 'editor', number: 2, focus: true, pane: undefined }]);
  });

  it('carries authored pane placement into the launch candidate', () => {
    const { managers } = makeManagers();
    const opened = openProfileEditors([
      { path: 'notes.md', pane: 'right' },
    ], managers, 'agent', [], 1, identityColor);
    expect(opened).toEqual([
      { label: 'editor', number: undefined, focus: undefined, pane: 'right' },
    ]);
  });

  it('uses the named resolving tab and passes a requested line through', () => {
    const { managers, edit } = makeManagers();
    openProfileEditors([{ path: './notes.txt', in: 'harness', line: 8 }], managers, 'agent', [], 1, identityColor);

    expect(edit).toHaveBeenCalledWith('edit ./notes.txt', './notes.txt', 'harness', 8);
  });

  it('skips an unrooted editor with a note', () => {
    const { managers, edit } = makeManagers();
    const notes: string[] = [];
    expect(openProfileEditors([{ path: 'new.txt' }], managers, undefined, notes, 1, identityColor)).toEqual([]);
    expect(edit).not.toHaveBeenCalled();
    expect(notes).toEqual(['Editor tab: no tab to root it at.']);
  });

  it('passes a missing-file path to edit without checking the disk', () => {
    const { managers, edit } = makeManagers();
    openProfileEditors([{ path: './missing.txt' }], managers, 'agent', [], 1, identityColor);
    expect(edit).toHaveBeenCalledWith('edit ./missing.txt', './missing.txt', 'agent', undefined);
  });

  it('leaves an editor in its inherited group when that already matches the default group', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 2, 'red');
    const { managers } = makeMutableManagers([janus]);

    openProfileEditors([{ path: './notes.txt', in: 'janus' }], managers, 'janus', [], 2, identityColor);

    expect(managers.tab.tabs.map((t) => t.group)).toEqual([2, 2]);
  });

  it('relocates an editor into its own authored group, contiguous with that group and using its color', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const first = makeTab('janus-2', 'blue', 2, [], [], undefined, 2, 'blue');
    // `edit` is called rooted at "janus-2" (group 2), but the editor authors group 1 — it should
    // end up relocated next to "janus" (group 1) rather than staying in the inherited group 2.
    const { managers } = makeMutableManagers([janus, first]);
    const colorForGroup = (group: number, fallback: string): string =>
      managers.tab.tabs.find((t) => t.group === group)?.groupColor ?? fallback;

    openProfileEditors([{ path: './notes.txt', in: 'janus-2', group: 1 }], managers, 'janus-2', [], 3, colorForGroup);

    expect(managers.tab.tabs.map((t) => ({ label: t.label, group: t.group }))).toEqual([
      { label: 'janus', group: 1 },
      { label: 'editor', group: 1 },
      { label: 'janus-2', group: 2 },
    ]);
    expect(managers.tab.tabs.find((t) => t.label === 'editor')?.groupColor).toBe('red');
  });
});
