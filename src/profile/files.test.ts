import { describe, it, expect, vi } from 'vitest';
import { openProfileFiles } from './files.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry, Tab } from '../types.js';

const identityColor = (_group: number, fallbackDotColor: string): string => fallbackDotColor;

// The navigator manager's `open` returns the label it opened; the mock appends a tab and makes it
// active, so the relocation path sees the same shape the real one does.
function makeManagers(initial: Tab[] = []): {
  managers: Managers; open: ReturnType<typeof vi.fn>; restoreView: ReturnType<typeof vi.fn>;
} {
  let tabs = initial;
  let activeTab = 0;
  const open = vi.fn(() => {
    tabs = [...tabs, makeTab('navigator', 'green', tabs.length + 1, [], [], undefined, 1, 'green')];
    activeTab = tabs.length - 1;
    return 'navigator';
  });
  const restoreView = vi.fn();
  const managers = {
    fileNavigator: { open, restoreView },
    tab: {
      get tabs() { return tabs; },
      set tabs(value: Tab[]) { tabs = value; },
      get activeTab() { return activeTab; },
      setActiveTab: vi.fn((index: number) => { activeTab = index; }),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    },
  } as unknown as Managers;
  return { managers, open, restoreView };
}

describe('openProfileFiles', () => {
  const run = (files: ProfileFilesEntry[], defaultLabel: string | undefined, notes: string[] = []) => {
    const { managers, open, restoreView } = makeManagers();
    const opened = openProfileFiles(files, managers, defaultLabel, notes, 1, identityColor);
    return { open, notes, restoreView, opened, managers };
  };

  it('opens a bare files tab at the default label when neither dock nor in is set', () => {
    const { open, notes } = run([{}], 'claude');
    expect(open).toHaveBeenCalledWith('files', 'claude');
    expect(notes).toEqual(['Opened file navigator.']);
  });

  it('builds "files on <side>" using the default label when only dock is set', () => {
    const { open, notes } = run([{ dock: 'left' }], 'claude');
    expect(open).toHaveBeenCalledWith('files on left', 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('builds "files in <label>" and targets that label instead of the default', () => {
    const { open } = run([{ in: 'other' }], 'claude');
    expect(open).toHaveBeenCalledWith('files in other', 'other');
  });

  it('builds "files in <label> on <side>" when both are set', () => {
    const { open } = run([{ in: 'other', dock: 'right' }], 'claude');
    expect(open).toHaveBeenCalledWith('files in other on right', 'other');
  });

  it('appends the path after the clauses when path is set', () => {
    const { open, notes } = run([{ dock: 'left', path: '$root' }], 'claude');
    expect(open).toHaveBeenCalledWith('files on left $root', 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('builds "files <path>" when only path is set', () => {
    const { open } = run([{ path: '$root' }], 'claude');
    expect(open).toHaveBeenCalledWith('files $root', 'claude');
  });

  it('combines in, dock, and path into one command', () => {
    const { open } = run([{ in: 'other', dock: 'right', path: './sub' }], 'claude');
    expect(open).toHaveBeenCalledWith('files in other on right ./sub', 'other');
  });

  it('skips with a note when there is no default label and the entry has no in', () => {
    const { open, notes } = run([{ dock: 'left' }], undefined);
    expect(open).not.toHaveBeenCalled();
    expect(notes).toEqual(['File navigator: no tab to root it at.']);
  });

  it('does nothing when there are no files entries', () => {
    const { open, notes } = run([], 'claude');
    expect(open).not.toHaveBeenCalled();
    expect(notes).toEqual([]);
  });

  it('restores an entry\'s saved tree state onto the tab it opened', () => {
    const entry: ProfileFilesEntry = {
      dock: 'left', expanded: ['src'], cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'],
    };
    const { restoreView } = run([entry], 'claude');
    expect(restoreView).toHaveBeenCalledWith('navigator', entry);
  });

  it('produces no launch candidate for a docked navigator', () => {
    const { opened } = run([{ dock: 'left' }], 'claude');
    expect(opened).toEqual([]);
  });

  it('relocates an undocked navigator into its authored group and returns a candidate', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'blue', 2, [], [], undefined, 2, 'blue');
    const { managers } = makeManagers([janus, other]);
    const colorForGroup = (group: number, fallback: string): string =>
      managers.tab.tabs.find((t) => t.group === group)?.groupColor ?? fallback;

    const opened = openProfileFiles(
      [{ path: '$root', group: 2, number: 5, pane: 'right' }], managers, 'janus', [], 1, colorForGroup,
    );

    expect(opened).toEqual([{ label: 'navigator', number: 5, focus: undefined, pane: 'right' }]);
    expect(managers.tab.tabs.map((t) => ({ label: t.label, group: t.group }))).toEqual([
      { label: 'janus', group: 1 },
      { label: 'other', group: 2 },
      { label: 'navigator', group: 2 },
    ]);
  });

  it('leaves an undocked navigator with no authored group in the launch default group', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);

    openProfileFiles([{ path: '$root' }], managers, 'janus', [], 4, identityColor);

    expect(managers.tab.tabs.find((t) => t.label === 'navigator')?.group).toBe(4);
  });
});
