import { describe, it, expect, vi } from 'vitest';
import { openProfileEntries } from './agent-opener.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { AgentState, LoadedProfile, ProfileEntry, ProfileHarnessEntry, Tab } from '../types.js';

function makeManagers(tabs: Tab[]): { managers: Managers; harnessOpen: ReturnType<typeof vi.fn>; fileTreeOpen: ReturnType<typeof vi.fn> } {
  const harnessOpen = vi.fn((_entry: ProfileHarnessEntry, label: string, group: number, groupColor: string): string | undefined => {
    tabs = [...tabs, makeTab(label, 'blue', tabs.length + 1, [], [], undefined, group, groupColor)];
  });
  const fileTreeOpen = vi.fn();
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
      launchDir: '/proj',
    },
    harness: { openFromProfile: harnessOpen },
    schedule: { set: vi.fn() },
    monitor: { stop: vi.fn(() => true), start: vi.fn(() => null) },
    fileTree: { open: fileTreeOpen },
  } as unknown as Managers;
  return { managers, harnessOpen, fileTreeOpen };
}

function loaded(entries: ProfileEntry[], extra: Partial<LoadedProfile> = {}): LoadedProfile {
  return { entries, monitors: [], files: [], notifications: [], schedules: [], layout: null, ...extra };
}

describe('openProfileEntries — group authoring', () => {
  it('uses the next free group when no entry authors one', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude' };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'claude' }), 'claude', 2, expect.any(String));
  });

  it('uses a harness entry\'s authored group instead of the next free one', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', group: 1 };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'claude' }), 'claude', 1, expect.any(String));
  });
});

describe('openProfileEntries — profile-level file navigator', () => {
  it('opens a file navigator rooted at the first newly opened tab once entries are up', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, fileTreeOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', group: 1 };

    openProfileEntries(loaded([entry], { files: [{ dock: 'left' }] }), managers, 'claude', 'janus', () => {});

    expect(fileTreeOpen).toHaveBeenCalledWith('files on left', 'claude');
  });

  it('opens no file navigator when the profile has no files section', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, fileTreeOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', group: 1 };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(fileTreeOpen).not.toHaveBeenCalled();
  });
});

describe('openProfileEntries — cwd expansion', () => {
  it('expands a $root-relative harness entry cwd to an absolute path before opening', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', cwd: '$root/src' };

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/proj/src' }), 'claude', expect.any(Number), expect.any(String));
  });

  it('leaves a legacy absolute harness entry cwd unchanged', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', cwd: '/elsewhere/src' };

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
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', model: 'not-a-real-model' };
    const messages: string[] = [];

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', (text) => { messages.push(text); });

    expect(harnessOpen).not.toHaveBeenCalled();
    expect(messages.join(' ')).toMatch(/Skipped/);
    expect(messages.join(' ')).toMatch(/Unknown model/);
  });
});

describe('openProfileEntries — effort field', () => {
  it('opens an entry with an effort set successfully, regardless of the value', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { name: 'claude', type: 'claude', effort: 'not-a-real-effort-level' };
    const messages: string[] = [];

    openProfileEntries(loaded([entry]), managers, 'claude', 'janus', (text) => { messages.push(text); });

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ effort: 'not-a-real-effort-level' }), 'claude', expect.any(Number), expect.any(String));
    expect(messages.join(' ')).not.toMatch(/Skipped/);
  });
});
