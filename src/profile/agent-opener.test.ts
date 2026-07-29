import { describe, it, expect, vi } from 'vitest';
import { openProfileEntries } from './agent-opener.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { AgentState, LoadedProfile, ProfileEntry, ProfileHarnessEntry, Tab } from '../types.js';

function makeManagers(tabs: Tab[]): { managers: Managers; harnessOpen: ReturnType<typeof vi.fn>; fileNavigatorOpen: ReturnType<typeof vi.fn>; edit: ReturnType<typeof vi.fn> } {
  const harnessOpen = vi.fn((_entry: ProfileHarnessEntry, label: string, group: number, groupColor: string): string | undefined => {
    tabs = [...tabs, makeTab(label, 'blue', tabs.length + 1, [], [], undefined, group, groupColor)];
  });
  const fileNavigatorOpen = vi.fn();
  let activeTab = 0;
  const edit = vi.fn((_command: string, _target: string, label: string) => {
    const creator = tabs.find((t) => t.label === label);
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? 'green';
    tabs = [...tabs, makeTab(`editor-${tabs.length}`, 'green', tabs.length + 1, [], [], undefined, group, groupColor)];
    activeTab = tabs.length - 1;
  });
  // `open <image>` in this mock produces an image tab carrying the resolved path, which is the
  // identity `openProfileViewTabs` matches on.
  const run = vi.fn((command: string) => {
    const target = command.replace(/^open\s+/, '').replace('$root', '/proj');
    const tab = makeTab(`image-${tabs.length}`, 'purple', tabs.length + 1, [], [], undefined, 1, 'purple');
    tabs = [...tabs, { ...tab, view: 'image' as const, image: { name: 'a.png', path: target, size: '1KB', url: '/open/1' } }];
    activeTab = tabs.length - 1;
  });
  const managers = {
    tab: {
      get tabs() { return tabs; },
      set tabs(value: Tab[]) { tabs = value; },
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
      closeTab: vi.fn(),
      setCwd: vi.fn(),
      setContext: vi.fn(),
      persist: vi.fn(),
      buildAgentState: vi.fn(() => ({ name: 'x', dotColor: 'red', active: true })),
      cwdOf: () => '/cwd',
      setActiveTab: vi.fn(),
      placeProfileTabs: vi.fn((candidates: { label: string; pane?: 'left' | 'right' }[]) => {
        for (const candidate of candidates) {
          const tab = tabs.find((item) => item.label === candidate.label);
          if (tab) tab.pane = candidate.pane === 'right' ? 'right' : undefined;
        }
      }),
      get activeTab() { return activeTab; },
      launchDir: '/proj',
    },
    harness: { openFromProfile: harnessOpen },
    schedule: { set: vi.fn() },
    monitor: { stop: vi.fn(() => true), start: vi.fn(() => null) },
    fileNavigator: { open: fileNavigatorOpen },
    openFile: { edit, run },
  } as unknown as Managers;
  return { managers, harnessOpen, fileNavigatorOpen, edit };
}

function loaded(entries: ProfileEntry[], extra: Partial<LoadedProfile> = {}): LoadedProfile {
  return {
    entries, monitors: [], files: [], editors: [], notifications: [], schedules: [], views: [],
    layout: null, ...extra,
  };
}

describe('openProfileEntries — editor tabs and focus', () => {
  it('opens editors after entries and activates the lowest-numbered focused entry', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen, edit } = makeManagers([janus]);
    const first: ProfileHarnessEntry = { name: 'first', tool: 'claude', number: 2, focus: true };
    const second: ProfileHarnessEntry = { name: 'second', tool: 'claude', number: 1, focus: true };

    openProfileEntries(loaded([first, second], { editors: [{ path: '$root/notes.md' }] }), managers, 'demo', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledBefore(edit);
    expect(edit).toHaveBeenCalledWith('edit $root/notes.md', '$root/notes.md', 'first', undefined);
    // "second" (number 1) is the lowest-numbered focused entry, so it's activated — and the
    // reorder pass below has already moved it ahead of "first" (number 2) in the tab strip.
    expect(managers.tab.setActiveTab).toHaveBeenLastCalledWith(1);
    expect(managers.tab.tabs.map((t) => t.label)).toEqual(['janus', 'second', 'first', 'editor-3']);
  });

  it('batches authored pane placement before applying the focus winner', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const left: ProfileHarnessEntry = { name: 'left', tool: 'claude', number: 2 };
    const right: ProfileHarnessEntry = {
      name: 'right', tool: 'claude', number: 1, pane: 'right', focus: true,
    };

    openProfileEntries(loaded([left, right]), managers, 'demo', 'janus', () => {});

    expect(managers.tab.placeProfileTabs).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'left', pane: undefined }),
      expect.objectContaining({ label: 'right', pane: 'right' }),
    ]);
    expect(managers.tab.tabs.find((tab) => tab.label === 'right')?.pane).toBe('right');
    expect(managers.tab.setActiveTab).toHaveBeenLastCalledWith(1);
  });

  it('keeps the first newly opened tab active when nothing declares focus', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'first', tool: 'claude' };

    openProfileEntries(loaded([entry]), managers, 'demo', 'janus', () => {});

    expect(managers.tab.setActiveTab).toHaveBeenLastCalledWith(1);
  });
});

describe('openProfileEntries — tab strip ordering', () => {
  it('interleaves editor tabs among harness/agent entries by tab number', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const harnessEntry: ProfileHarnessEntry = { name: 'first', tool: 'claude', number: 1 };
    const agentEntry: AgentState = { name: 'third', dotColor: 'blue', active: false, number: 3 };

    openProfileEntries(
      loaded([harnessEntry, agentEntry], { editors: [{ path: '$root/notes.md', number: 2 }] }),
      managers, 'demo', 'janus', () => {},
    );

    expect(managers.tab.tabs.map((t) => t.label)).toEqual(['janus', 'first', 'editor-3', 'third']);
  });

  it('interleaves a view tab among harness entries by tab number', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const first: ProfileHarnessEntry = { name: 'first', tool: 'claude', number: 1, group: 2 };
    const third: ProfileHarnessEntry = { name: 'third', tool: 'claude', number: 3, group: 2 };

    openProfileEntries(
      loaded([first, third], { views: [{ type: 'image', path: '$root/a.png', number: 2, group: 2 }] }),
      managers, 'demo', 'janus', () => {},
    );

    expect(managers.tab.tabs.map((t) => t.label)).toEqual(['janus', 'first', 'image-3', 'third']);
  });

  it('leaves a same-group tab with no authored number in its relative position', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const first: ProfileHarnessEntry = { name: 'first', tool: 'claude' };
    const numbered: ProfileHarnessEntry = { name: 'numbered', tool: 'claude', number: 1 };

    openProfileEntries(loaded([first, numbered]), managers, 'demo', 'janus', () => {});

    // "numbered" (number 1) sorts ahead of any unnumbered entry, but the unnumbered "first" keeps
    // its existing relative order (stable sort) rather than being placed arbitrarily.
    expect(managers.tab.tabs.map((t) => t.label)).toEqual(['janus', 'numbered', 'first']);
  });

  it('does not reorder tabs belonging to a different, already-open group', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'green', 2, [], [], undefined, 2, 'green');
    const { managers } = makeManagers([janus, other]);
    const first: ProfileHarnessEntry = { name: 'first', tool: 'claude', number: 2 };
    const second: ProfileHarnessEntry = { name: 'second', tool: 'claude', number: 1 };

    openProfileEntries(loaded([first, second]), managers, 'demo', 'janus', () => {});

    const labels = managers.tab.tabs.map((t) => t.label);
    expect(labels.indexOf('other')).toBe(1);
    expect(labels.slice(2)).toEqual(['second', 'first']);
  });
});

describe('openProfileEntries — group authoring', () => {
  it('uses the next free group when no entry authors one', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude' };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'claude' }), 'claude', 2, expect.any(String));
  });

  it('uses a harness entry\'s authored group instead of the next free one', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', group: 1 };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'claude' }), 'claude', 1, expect.any(String));
  });

  it('splits entries across their own authored groups plus the shared default for unnumbered ones', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'yellow', 2, [], [], undefined, 5, 'yellow');
    const { managers, harnessOpen } = makeManagers([janus, other]);
    const joinsJanus: ProfileHarnessEntry = { name: 'a', tool: 'claude', group: 1 };
    const joinsOther: ProfileHarnessEntry = { name: 'b', tool: 'claude', group: 5 };
    const noGroup: ProfileHarnessEntry = { name: 'c', tool: 'claude' };

    openProfileEntries(loaded([joinsJanus, joinsOther, noGroup]), managers, 'demo', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'a' }), 'a', 1, 'red');
    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'b' }), 'b', 5, 'yellow');
    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'c' }), 'c', 6, expect.any(String));
  });

  it('inserts an agent entry contiguously into an existing group instead of appending past it', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'yellow', 2, [], [], undefined, 5, 'yellow');
    const { managers } = makeManagers([janus, other]);
    const joinsJanus: AgentState = { name: 'a', dotColor: 'blue', active: false, group: 1 };
    const newGroup: AgentState = { name: 'b', dotColor: 'green', active: false };

    openProfileEntries(loaded([joinsJanus, newGroup]), managers, 'demo', 'janus', () => {});

    expect(managers.tab.tabs.map((t) => ({ label: t.label, group: t.group }))).toEqual([
      { label: 'janus', group: 1 },
      { label: 'a', group: 1 },
      { label: 'other', group: 5 },
      { label: 'b', group: 6 },
    ]);
    expect(managers.tab.tabs.find((t) => t.label === 'a')?.groupColor).toBe('red');
    const bTab = managers.tab.tabs.find((t) => t.label === 'b');
    expect(bTab?.groupColor).toBe(bTab?.dotColor);
  });
});

describe('openProfileEntries — profile-level file navigator', () => {
  it('opens a file navigator rooted at the first newly opened tab once entries are up', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, fileNavigatorOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', group: 1 };

    openProfileEntries(loaded([entry], { files: [{ dock: 'left' }] }), managers, 'claude', 'janus', () => {});

    expect(fileNavigatorOpen).toHaveBeenCalledWith('files on left', 'claude');
  });

  it('opens no file navigator when the profile has no files section', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, fileNavigatorOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', group: 1 };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(fileNavigatorOpen).not.toHaveBeenCalled();
  });
});

describe('openProfileEntries — cwd expansion', () => {
  it('expands a $root-relative harness entry cwd to an absolute path before opening', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', cwd: '$root/src' };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/proj/src' }), 'claude', expect.any(Number), expect.any(String));
  });

  it('leaves a legacy absolute harness entry cwd unchanged', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', cwd: '/elsewhere/src' };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/elsewhere/src' }), 'claude', expect.any(Number), expect.any(String));
  });

  it('expands a $root-relative agent entry cwd to an absolute path before setting it', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const entry: AgentState = { name: 'bob', dotColor: 'blue', active: false, cwd: '$root/src' };

    openProfileEntries(loaded([entry]), managers, 'demo', 'janus', () => {});

    expect(managers.tab.setCwd).toHaveBeenCalledWith('bob', '/proj/src');
  });
});

describe('openProfileEntries — semantic launch-time checks (Decision 7)', () => {
  it('skips a structurally valid entry naming an unknown model, without opening it', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', model: 'not-a-real-model' };
    const messages: string[] = [];

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', (text) => { messages.push(text); });

    expect(harnessOpen).not.toHaveBeenCalled();
    expect(messages.join(' ')).toMatch(/Skipped/);
    expect(messages.join(' ')).toMatch(/Unknown model/);
  });

  it('launches a codex entry with autoApprove, reaching openFromProfile', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'codex', tool: 'codex', autoApprove: true };
    const messages: string[] = [];

    openProfileEntries(loaded([entry]), managers, 'codex', 'janus', (text) => { messages.push(text); });

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ tool: 'codex', autoApprove: true }), 'codex', expect.any(Number), expect.any(String));
    expect(messages.join(' ')).not.toMatch(/Skipped/);
  });

  it('skips an opencode entry with autoApprove, reporting the updated message', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'opencode', tool: 'opencode', autoApprove: true };
    const messages: string[] = [];

    openProfileEntries(loaded([entry]), managers, 'opencode', 'janus', (text) => { messages.push(text); });

    expect(harnessOpen).not.toHaveBeenCalled();
    expect(messages.join(' ')).toMatch(/Skipped/);
    expect(messages.join(' ')).toMatch('autoApprove (-y) is only supported for the claude and codex harnesses');
  });
});

describe('openProfileEntries — effort field', () => {
  it('opens an entry with an effort set successfully, regardless of the value', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', tool: 'claude', effort: 'not-a-real-effort-level' };
    const messages: string[] = [];

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', (text) => { messages.push(text); });

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ effort: 'not-a-real-effort-level' }), 'claude', expect.any(Number), expect.any(String));
    expect(messages.join(' ')).not.toMatch(/Skipped/);
  });
});
