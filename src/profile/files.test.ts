import { describe, it, expect, vi } from 'vitest';
import { openProfileFiles } from './files.js';
import type { FileNavigatorOpenArgs } from '../file-navigator/args.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry } from './types.js';
import type { Tab } from '../tab/types.js';

const identityColor = (_group: number, fallbackDotColor: string): string => fallbackDotColor;

function openArgs(overrides: Partial<FileNavigatorOpenArgs> = {}): FileNavigatorOpenArgs {
  return { kind: 'open', inLabel: undefined, dock: null, details: undefined, steps: [], target: '', ...overrides };
}

function expectOpenCall(open: ReturnType<typeof vi.fn>, args: FileNavigatorOpenArgs, label: string): void {
  expect(open).toHaveBeenCalledWith(args, label, expect.any(Function));
}

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
  const run = (files: ProfileFilesEntry[], defaultLabel: string, notes: string[] = []) => {
    const { managers, open, restoreView } = makeManagers();
    const opened = openProfileFiles(files, managers, defaultLabel, notes, 1, identityColor);
    return { open, notes, restoreView, opened, managers };
  };

  it('opens a bare files tab at the default label when neither dock nor in is set', () => {
    const { open, notes } = run([{}], 'claude');
    expectOpenCall(open, openArgs(), 'claude');
    expect(notes).toEqual(['Opened file navigator.']);
  });

  it('passes the dock and default label when only dock is set', () => {
    const { open, notes } = run([{ dock: 'left' }], 'claude');
    expectOpenCall(open, openArgs({ dock: 'left' }), 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('passes the source label and targets it instead of the default', () => {
    const { open } = run([{ in: 'other' }], 'claude');
    expectOpenCall(open, openArgs({ inLabel: 'other' }), 'other');
  });

  it('passes a multiword profile label without quoting or reparsing it', () => {
    const label = 'review team';
    const { open } = run([{ in: label }], 'claude');

    expectOpenCall(open, openArgs({ inLabel: label }), label);
  });

  it('passes embedded quotes in a profile label unchanged', () => {
    const label = 'review "team"';
    const { open } = run([{ in: label }], 'claude');

    expectOpenCall(open, openArgs({ inLabel: label }), label);
  });

  it('passes source label and dock when both are set', () => {
    const { open } = run([{ in: 'other', dock: 'right' }], 'claude');
    expectOpenCall(open, openArgs({ inLabel: 'other', dock: 'right' }), 'other');
  });

  it('passes the target alongside the dock when path is set', () => {
    const { open, notes } = run([{ dock: 'left', path: '$root' }], 'claude');
    expectOpenCall(open, openArgs({ dock: 'left', target: '$root' }), 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('passes the target when only path is set', () => {
    const { open } = run([{ path: '$root' }], 'claude');
    expectOpenCall(open, openArgs({ target: '$root' }), 'claude');
  });

  it('passes a profile path ending in a backslash unchanged', () => {
    const { open } = run([{ path: 'folder\\' }], 'claude');
    expectOpenCall(open, openArgs({ target: 'folder\\' }), 'claude');
  });

  it('passes in, dock, and path together', () => {
    const { open } = run([{ in: 'other', dock: 'right', path: './sub' }], 'claude');
    expectOpenCall(open, openArgs({ inLabel: 'other', dock: 'right', target: './sub' }), 'other');
  });

  it('passes a saved detail mode alongside the target', () => {
    const { open } = run([{ details: 'size', path: './sub' }], 'claude');
    expectOpenCall(open, openArgs({ details: 'size', target: './sub' }), 'claude');
  });

  it('passes detail mode with in and dock', () => {
    const { open } = run([{ in: 'other', dock: 'right', details: 'modified' }], 'claude');
    expectOpenCall(open, openArgs({ inLabel: 'other', dock: 'right', details: 'modified' }), 'other');
  });

  it('passes paths that match files clauses or view keywords unchanged', () => {
    for (const target of ['select notes', 'left', 'in', 'print', 'expand']) {
      const { open } = run([{ path: target }], 'claude');
      expectOpenCall(open, openArgs({ target }), 'claude');
    }
  });

  it('passes double quotes in a profile path unchanged', () => {
    const { open } = run([{ path: 'docs/"notes".md' }], 'claude');
    expectOpenCall(open, openArgs({ target: 'docs/"notes".md' }), 'claude');
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
