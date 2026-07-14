import { describe, it, expect } from 'vitest';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';
import { pageFeedEntries } from './page-feed.js';

function makeManagers(tabs: Tab[]): Managers {
  return { tab: { tabs } } as unknown as Managers;
}

function pageTab(label: string, domain = 'example.org', group = 1): Tab {
  return { label, view: 'page', group, page: { url: `https://${domain}`, domain, number: 1 } } as unknown as Tab;
}

describe('pageFeedEntries', () => {
  it('emits the full current content on first sight', () => {
    const tab = pageTab('site');
    tab.pageSnapshot = { text: 'visible text', capturedAt: Date.now() };
    const managers = makeManagers([tab]);
    const entries = pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0].tabLabel).toBe('site');
    expect(entries[0].entry.output).toBe('visible text');
  });

  it('emits nothing when the page content is unchanged since the last feed', () => {
    const tab = pageTab('site');
    tab.pageSnapshot = { text: 'same', capturedAt: Date.now() };
    const managers = makeManagers([tab]);
    const seen = new Map<string, string>();
    expect(pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], seen)).toHaveLength(1);
    expect(pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], seen)).toHaveLength(0);
  });

  it('emits a unified diff once the page content changes', () => {
    const tab = pageTab('site');
    tab.pageSnapshot = { text: 'original text', capturedAt: Date.now() };
    const managers = makeManagers([tab]);
    const seen = new Map<string, string>();
    pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], seen);
    tab.pageSnapshot = { text: 'changed text', capturedAt: Date.now() };
    const entries = pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], seen);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.output).toContain('-original text');
    expect(entries[0].entry.output).toContain('+changed text');
  });

  it('truncates an oversized entry with a trailing note', () => {
    const tab = pageTab('site');
    tab.pageSnapshot = { text: 'x'.repeat(30_000), capturedAt: Date.now() };
    const managers = makeManagers([tab]);
    const entries = pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.output).toMatch(/… diff truncated \(\d+ bytes total\)$/);
  });

  it('emits nothing for a page tab whose content script has not reported yet', () => {
    const tab = pageTab('site');
    const managers = makeManagers([tab]);
    expect(pageFeedEntries(managers, [{ kind: 'tab', label: 'site' }], new Map())).toHaveLength(0);
  });

  it('ignores a non-page target', () => {
    const managers = makeManagers([{ label: 'claude', view: 'harness', group: 1 } as unknown as Tab]);
    expect(pageFeedEntries(managers, [{ kind: 'tab', label: 'claude' }], new Map())).toEqual([]);
  });
});
