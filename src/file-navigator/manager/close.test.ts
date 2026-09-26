import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeFileNavigatorTabs } from './close.js';
import type { FilesTabState } from '../state.js';
import type { Managers } from '../../managers.js';

afterEach(() => {
  vi.useRealTimers();
});

function stateFor(overrides: Partial<FilesTabState> = {}): FilesTabState {
  return {
    root: '/ws',
    watchers: new Map(),
    filesystem: { dispose: vi.fn() },
    ...overrides,
  } as unknown as FilesTabState;
}

// A tab list that answers `findIndex` and `closeTab` for real, so the deferred removal is the same
// splice the tab manager would do rather than a call recorded out of context.
function makeManagers(labels: string[] = []) {
  const release = vi.fn();
  const closeTab = vi.fn((index: number) => labels.splice(index, 1)[0]);
  const tabs = labels.map((label) => ({ label }));
  const managers = {
    remote: { release },
    tab: { tabs, findIndex: (label: string) => labels.indexOf(label), closeTab },
  } as unknown as Managers;
  return { managers, release, closeTab, labels };
}

const remote = () => ({ host: 'devbox', address: 'devbox' });

describe('closeFileNavigatorTabs', () => {
  it('drops the named navigator\'s state and releases the remote it held', () => {
    const { managers, release } = makeManagers(['files-1']);
    const dispose = vi.fn();
    const tabs = new Map([['files-1', stateFor({ remote: remote(), filesystem: { dispose } } as never)]]);

    closeFileNavigatorTabs(managers, tabs, 'files-1');

    expect(tabs.has('files-1')).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith('files-1');
  });

  it('drops a local navigator\'s state without releasing any remote', () => {
    const { managers, release } = makeManagers();
    const tabs = new Map([['files-1', stateFor()]]);

    closeFileNavigatorTabs(managers, tabs, 'files-1');

    expect(tabs.size).toBe(0);
    expect(release).not.toHaveBeenCalled();
  });

  // A remote navigator is tied to the source tab that opened it, so closing the source has to take
  // the navigators it owns with it. The visible tab comes down on the next turn, not inline, so
  // source-tab cleanup is never re-entered from inside itself.
  it('also closes the navigators the tab owns, removing their tabs on the next turn', async () => {
    vi.useFakeTimers();
    const { managers, release, closeTab, labels } = makeManagers(['agent', 'files-1', 'files-2']);
    const tabs = new Map([
      ['files-1', stateFor({ ownerLabel: 'agent', remote: remote() } as never)],
      ['files-2', stateFor({ ownerLabel: 'agent' } as never)],
    ]);

    closeFileNavigatorTabs(managers, tabs, 'agent');
    expect(tabs.size).toBe(0);
    expect(release).toHaveBeenCalledWith('files-1');
    // Still all three: nothing is removed from the visible list until the deferred turn.
    expect(labels).toEqual(['agent', 'files-1', 'files-2']);

    await vi.advanceTimersByTimeAsync(0);
    // Each removal re-resolves its own index, so the second finds the slot the first left behind.
    expect(closeTab.mock.calls).toEqual([[1], [1]]);
    expect(labels).toEqual(['agent']);
  });

  it('leaves a navigator another tab owns alone', () => {
    const { managers, closeTab } = makeManagers(['other', 'files-2']);
    const tabs = new Map([
      ['files-1', stateFor()],
      ['files-2', stateFor({ ownerLabel: 'other' } as never)],
    ]);

    closeFileNavigatorTabs(managers, tabs, 'files-1');

    expect([...tabs.keys()]).toEqual(['files-2']);
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing for a label that names no navigator', () => {
    const { managers, release, closeTab } = makeManagers(['files-1']);
    const tabs = new Map([['files-1', stateFor({ remote: remote() } as never)]]);

    closeFileNavigatorTabs(managers, tabs, 'gone');

    expect(tabs.size).toBe(1);
    expect(release).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
  });

  // The navigator's state can outlive its visible tab, so the deferred removal has to tolerate the
  // index coming back as "no such tab" rather than closing whatever shifted into that slot.
  it('tolerates an owned navigator whose visible tab is already gone', async () => {
    vi.useFakeTimers();
    const { managers, closeTab } = makeManagers(['agent']);
    const tabs = new Map([['files-2', stateFor({ ownerLabel: 'agent' } as never)]]);

    closeFileNavigatorTabs(managers, tabs, 'agent');
    await vi.advanceTimersByTimeAsync(0);

    expect(tabs.size).toBe(0);
    expect(closeTab).not.toHaveBeenCalled();
  });
});
