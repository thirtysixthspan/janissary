import { describe, expect, it, vi } from 'vitest';
import { applyDock } from './dock.js';
import { makeTab, makePluginTab } from './index.js';
import type { Tab } from './types.js';
import { UNREAD_DWELL_MS } from './dwell.js';

function pluginTab(label: string, id: string, number: number): Tab {
  return makePluginTab(label, '#fff', number, 1, '#fff', label, {
    id, instanceKey: `/tmp/${label}`, schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'janus',
  });
}

// A sidebar holds one tab of each *kind* at a time, and every plugin tab shares the same view kind.
// Comparing view alone would therefore let any plugin's docked tab displace any other's.
describe('applyDock occupant rule for plugin tabs', () => {
  it('leaves a different plugin\'s docked tab where it is', () => {
    const tabs = [makeTab('janus', '#fff'), pluginTab('image', 'image', 2), pluginTab('audio', 'audio', 3)];
    tabs[1].dock = 'left';

    applyDock(tabs, 0, 2, 'left', vi.fn());

    expect(tabs[1].dock).toBe('left');
    expect(tabs[2].dock).toBe('left');
  });

  it('displaces a docked tab belonging to the same plugin', () => {
    const tabs = [makeTab('janus', '#fff'), pluginTab('image', 'image', 2), pluginTab('image-2', 'image', 3)];
    tabs[1].dock = 'left';

    applyDock(tabs, 0, 2, 'left', vi.fn());

    expect(tabs[1].dock).toBeUndefined();
    expect(tabs[2].dock).toBe('left');
  });

  it('still displaces a docked tab of the same built-in kind', () => {
    const tabs = [makeTab('janus', '#fff'), makeTab('files', '#fff'), makeTab('files-2', '#fff')];
    tabs[1].view = 'files';
    tabs[2].view = 'files';
    tabs[1].dock = 'left';

    applyDock(tabs, 0, 2, 'left', vi.fn());

    expect(tabs[1].dock).toBeUndefined();
    expect(tabs[2].dock).toBe('left');
  });

  it('leaves a docked tab of another built-in kind alone', () => {
    const tabs = [makeTab('janus', '#fff'), makeTab('files', '#fff'), makeTab('notifications', '#fff')];
    tabs[1].view = 'files';
    tabs[2].view = 'notifications';
    tabs[1].dock = 'left';

    applyDock(tabs, 0, 2, 'left', vi.fn());

    expect(tabs[1].dock).toBe('left');
    expect(tabs[2].dock).toBe('left');
  });

  // The booked bug: `plugin?.id === plugin?.id` compared `undefined === undefined` as a match, so
  // docking a plugin tab that lost its plugin record displaced any other plugin tab that had too.
  it('leaves a docked tab alone when both plugin tabs are missing their plugin record', () => {
    const tabs = [makeTab('janus', '#fff'), makeTab('plugin-a', '#fff'), makeTab('plugin-b', '#fff')];
    tabs[1].view = 'plugin';
    tabs[2].view = 'plugin';
    tabs[1].dock = 'left';

    applyDock(tabs, 0, 2, 'left', vi.fn());

    expect(tabs[1].dock).toBe('left');
    expect(tabs[2].dock).toBe('left');
  });
});

// Undocking back to the center strip makes the tab the active one, so its unread badge waits out the
// dwell rather than going with the undock. Docking *into* a sidebar is the opposite case: the tab is
// now permanently visible chrome that was never selected, so no dwell is coming and the badge is
// deliberately left alone for want of anything that could clear it.
describe('applyDock and the unread dwell', () => {
  it('defers the badge of a tab undocked back to the center', () => {
    vi.useFakeTimers();
    try {
      const tabs = [makeTab('janus', '#fff'), makeTab('other', '#fff'), makeTab('target', '#fff')];
      tabs[2].dock = 'right';
      tabs[2].hasUnread = true;

      const activeTab = applyDock(tabs, 0, 2, null, vi.fn(), () => tabs);

      expect(activeTab).toBe(2);
      expect(tabs[2].hasUnread).toBe(true);
      vi.advanceTimersByTime(UNREAD_DWELL_MS);
      expect(tabs[2].hasUnread).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a docked tab badged and arms no dwell for it', () => {
    vi.useFakeTimers();
    try {
      const tabs = [makeTab('janus', '#fff'), makeTab('target', '#fff')];
      tabs[1].hasUnread = true;

      applyDock(tabs, 0, 1, 'left', vi.fn(), () => tabs);

      expect(tabs[1].dock).toBe('left');
      expect(tabs[1].hasUnread).toBe(true);
      vi.advanceTimersByTime(UNREAD_DWELL_MS * 2);
      expect(tabs[1].hasUnread).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
