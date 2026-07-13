import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProfileEntries } from './agent-opener.js';
import { initProfileDir } from '../profiles.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { ProfileHarnessEntry, Tab } from '../types.js';

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
    },
    harness: { openFromProfile: harnessOpen },
    schedule: { set: vi.fn() },
    monitor: { stop: vi.fn(() => true), start: vi.fn(() => null) },
    fileTree: { open: fileTreeOpen },
  } as unknown as Managers;
  return { managers, harnessOpen, fileTreeOpen };
}

describe('openProfileEntries — group authoring', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profopen-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('uses the next free group when no entry authors one', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { label: 'claude', harness: 'claude' };

    openProfileEntries([entry], managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ label: 'claude' }), 'claude', 2, expect.any(String));
  });

  it('uses a harness entry\'s authored group instead of the next free one', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, harnessOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { label: 'claude', harness: 'claude', group: 1 };

    openProfileEntries([entry], managers, 'claude', 'janus', () => {});

    expect(harnessOpen).toHaveBeenCalledWith(expect.objectContaining({ label: 'claude' }), 'claude', 1, expect.any(String));
  });
});

describe('openProfileEntries — profile-level file navigator', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profopen-files-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('opens a file navigator rooted at the first newly opened tab once entries are up', () => {
    const dir = path.join(root, 'profiles', 'claude');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_files.json'), JSON.stringify([{ dock: 'left' }]));

    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, fileTreeOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { label: 'claude', harness: 'claude', group: 1 };

    openProfileEntries([entry], managers, 'claude', 'janus', () => {});

    expect(fileTreeOpen).toHaveBeenCalledWith('files on left', 'claude');
  });

  it('opens no file navigator when the profile has no _files.json', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers, fileTreeOpen } = makeManagers([janus]);
    const entry: ProfileHarnessEntry = { label: 'claude', harness: 'claude', group: 1 };

    openProfileEntries([entry], managers, 'claude', 'janus', () => {});

    expect(fileTreeOpen).not.toHaveBeenCalled();
  });
});
