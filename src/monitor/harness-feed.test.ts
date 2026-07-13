import { describe, it, expect } from 'vitest';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';
import type { ScreenCapture } from '../harness/screen.js';
import { harnessFeedEntries } from './harness-feed.js';

function harnessTab(label: string, group = 1): Tab {
  return { label, view: 'harness', group } as unknown as Tab;
}

function makeManagers(tabs: Tab[], captures: Record<string, ScreenCapture | undefined>): Managers {
  return {
    tab: { tabs },
    harness: { latestScreenText: (label: string) => captures[label] },
  } as unknown as Managers;
}

describe('harnessFeedEntries', () => {
  it('emits one entry per harness-view target on first sight', () => {
    const tabs = [harnessTab('claude'), harnessTab('opencode')];
    const managers = makeManagers(tabs, {
      claude: { text: 'screen A', capturedAt: 100 },
      opencode: { text: 'screen B', capturedAt: 100 },
    });
    const entries = harnessFeedEntries(managers, [{ kind: 'tab', label: 'claude' }, { kind: 'tab', label: 'opencode' }], new Map());
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => ({ tabLabel: e.tabLabel, output: e.entry.output }))).toEqual([
      { tabLabel: 'claude', output: 'screen A' },
      { tabLabel: 'opencode', output: 'screen B' },
    ]);
  });

  it('emits nothing for a non-harness target', () => {
    const tabs = [{ label: 'janus', group: 1 } as unknown as Tab];
    const managers = makeManagers(tabs, {});
    expect(harnessFeedEntries(managers, [{ kind: 'tab', label: 'janus' }], new Map())).toEqual([]);
  });

  it('emits nothing on a repeat with an unchanged capturedAt', () => {
    const tabs = [harnessTab('claude')];
    const managers = makeManagers(tabs, { claude: { text: 'screen', capturedAt: 100 } });
    const seen = new Map<string, number>();
    expect(harnessFeedEntries(managers, [{ kind: 'tab', label: 'claude' }], seen)).toHaveLength(1);
    expect(harnessFeedEntries(managers, [{ kind: 'tab', label: 'claude' }], seen)).toHaveLength(0);
  });

  it('emits a fresh entry once capturedAt advances', () => {
    const tabs = [harnessTab('claude')];
    const captures: Record<string, ScreenCapture> = { claude: { text: 'first', capturedAt: 100 } };
    const managers = makeManagers(tabs, captures);
    const seen = new Map<string, number>();
    harnessFeedEntries(managers, [{ kind: 'tab', label: 'claude' }], seen);
    captures.claude = { text: 'second', capturedAt: 200 };
    const entries = harnessFeedEntries(managers, [{ kind: 'tab', label: 'claude' }], seen);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.output).toBe('second');
  });

  it('resolves a group target to its harness member tabs', () => {
    const tabs = [harnessTab('claude', 2), harnessTab('opencode', 2), harnessTab('other', 3)];
    const managers = makeManagers(tabs, {
      claude: { text: 'A', capturedAt: 1 },
      opencode: { text: 'B', capturedAt: 1 },
      other: { text: 'C', capturedAt: 1 },
    });
    const entries = harnessFeedEntries(managers, [{ kind: 'group', group: 2 }], new Map());
    expect(entries.map((e) => e.tabLabel)).toEqual(['claude', 'opencode']);
  });
});
