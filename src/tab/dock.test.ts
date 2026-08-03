import { describe, expect, it, vi } from 'vitest';
import { applyDock } from './dock.js';
import { makeTab, makePluginTab } from './index.js';
import type { Tab } from './types.js';

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
});
