import { describe, it, expect } from 'vitest';
import { captureTab, newCaptureState } from './route.js';
import type { Managers } from '../../managers.js';
import type { Tab } from '../../tab/types.js';

// `captureTab` is the per-tab routing table `profile save` walks the tab strip with. The writers it
// calls are covered in index.test.ts against a whole profile; what is only visible here is the
// routing itself — which view lands in which bucket, and which one is deliberately dropped.

const JANUS = '/project';

function managers(tabs: Tab[]): Managers {
  return {
    tab: { tabs, activeTab: 0, launchDir: JANUS, cwdOf: () => JANUS },
    fileNavigator: { expandedPaths: () => [], detailOf: () => 'name' },
    plugins: { declarations: [] },
  } as unknown as Managers;
}

function tab(overrides: Partial<Tab> & Pick<Tab, 'label' | 'view'>): Tab {
  return {
    dotColor: '#fff', number: 1, group: 1, groupColor: '#fff', ...overrides,
  } as unknown as Tab;
}

function route(view: Tab['view'], overrides: Partial<Tab> = {}): ReturnType<typeof newCaptureState> {
  const subject = tab({ label: 'subject', view, ...overrides });
  const state = newCaptureState();
  captureTab(subject, managers([subject]), state);
  return state;
}

describe('captureTab routing', () => {
  // A tab mid-provision carries its view but not its payload yet. Counting it would write an entry
  // with nothing in it, so it is reported as skipped instead and the editor counter stays put.
  it('skips an editor tab that has no editor payload yet', () => {
    const state = route('editor');

    expect(state.tabEntries).toEqual([]);
    expect(state.editors).toBe(0);
    expect(state.skipped).toEqual(['subject']);
  });

  it('skips a plugin tab that has no plugin payload yet', () => {
    const state = route('plugin');

    expect(state.tabEntries).toEqual([]);
    expect(state.plugins).toBe(0);
    expect(state.skipped).toEqual([]);
  });

  it('skips a file navigator that is remote, which the tree capture cannot describe', () => {
    const state = route('files', { files: { root: '/r', absoluteRoot: '/r', remote: { host: 'h', address: 'h:/p' } } as never });

    expect(state.tabEntries).toEqual([]);
    expect(state.fileNavigators).toBe(0);
    expect(state.skipped).toEqual([]);
  });

  // A monitor reporting tab is captured through the monitor manager's snapshot instead, so routing
  // it here would write a second, thinner copy of the same thing. It is a no-op, not a skip.
  it('drops a monitor tab without counting or reporting it', () => {
    const state = route('monitor');

    expect(state.tabEntries).toEqual([]);
    expect(state.skipped).toEqual([]);
  });

  it('skips a view it does not recognise rather than writing it blind', () => {
    const state = route('something-new' as Tab['view']);

    expect(state.tabEntries).toEqual([]);
    expect(state.skipped).toEqual(['subject']);
  });

  it('captures a notifications tab only when it is docked', () => {
    const docked = route('notifications', { dock: 'left' });
    expect(docked.tabEntries).toEqual([{ type: 'notifications', dock: 'left' }]);
    expect(docked.dockedViews).toBe(1);

    const floating = route('notifications');
    expect(floating.tabEntries).toEqual([]);
    expect(floating.dockedViews).toBe(0);
  });
});
