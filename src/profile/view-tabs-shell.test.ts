import { describe, expect, it, vi } from 'vitest';
import { openProfileViewTabs } from './view-tabs.js';
import { makePluginTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

// A shell plugin entry opens a new tab on every run, and every tab it opens matches the entry, so
// a profile launched beside the launch shell has two candidates for the entry's tab.
function shellTab(label: string, number: number, instanceKey: string): Tab {
  return makePluginTab(label, '#5b9cff', number, 1, '#5b9cff', label, {
    id: 'shell', instanceKey, schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'janus',
  });
}

function makeManagers(initial: Tab[]): Managers {
  let tabs = initial;
  let activeTab = 0;
  // Rebuilds every record it keeps, as an open in the real tab manager does, so nothing can tell the
  // new tab from the old ones by object identity.
  const runCommand = vi.fn(async () => {
    await Promise.resolve();
    tabs = [
      ...tabs.map((tab) => ({ ...tab })),
      { ...shellTab(`shell-${tabs.length}`, tabs.length + 1, `shell-${tabs.length}`), dotColor: '#ee5a24' },
    ];
    activeTab = tabs.length - 1;
  });
  return {
    tab: {
      get tabs() { return tabs; },
      set tabs(value: Tab[]) { tabs = value; },
      get activeTab() { return activeTab; },
      setActiveTab: vi.fn((index: number) => { activeTab = index; }),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
      cwdOf: () => '/proj',
      launchDir: '/proj',
    },
    plugins: { declarations: [{ id: 'shell', fileExtensions: {}, command: 'zsh' }], runCommand },
  } as unknown as Managers;
}

describe('openProfileViewTabs with the launch shell open', () => {
  it('places the shell the entry opened, leaving the launch shell in its own group', async () => {
    const managers = makeManagers([shellTab('janus', 1, 'shell-1')]);

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'shell', group: 2 }], managers, 'janus', 2,
      (_group, fallbackDotColor) => fallbackDotColor, [],
    );

    expect(opened.map((candidate) => candidate.label)).toEqual(['shell-1']);
    expect(managers.tab.tabs.map((t) => ({ label: t.label, group: t.group, groupColor: t.groupColor }))).toEqual([
      { label: 'janus', group: 1, groupColor: '#5b9cff' },
      { label: 'shell-1', group: 2, groupColor: '#ee5a24' },
    ]);
  });
});
