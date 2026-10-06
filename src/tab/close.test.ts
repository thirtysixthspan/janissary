import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { closeTabOp } from './close.js';
import { makeTab } from './index.js';
import type { Tab } from './types.js';
import { messageBus } from '../bus.js';
import { MANAGER_TAB_RELEASE, type Managers } from '../managers.js';

function makeManagers(): Managers {
  const managers: Record<string, unknown> = {
    workspace: { release: vi.fn(), cancel: vi.fn() },
    tab: { deleteBusy: vi.fn() },
  };
  for (const name of MANAGER_TAB_RELEASE) managers[name] = { closeTab: vi.fn() };
  (managers.database as Record<string, unknown>).closeAll = vi.fn();
  return managers as unknown as Managers;
}

function close(tabs: Tab[], index: number, managers: Managers): { applied: boolean } {
  const result = { applied: false };
  closeTabOp(
    tabs, 0, index, managers, new Map(), () => {}, vi.fn<() => number | undefined>(),
    () => { result.applied = true; },
  );
  return result;
}

// Closing the last non-docked tab is `quit` by another name: it exits before releasing anything.
describe('closeTabOp', () => {
  let emit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emit = vi.spyOn(messageBus, 'emit');
  });

  afterEach(() => {
    emit.mockRestore();
  });

  it('exits on the last non-docked tab without releasing it', () => {
    const managers = makeManagers();

    const { applied } = close([makeTab('main', 'red')], 0, managers);

    expect(emit).toHaveBeenCalledWith('app', { type: 'exit' });
    expect(applied).toBe(false);
    for (const name of MANAGER_TAB_RELEASE) expect(managers[name].closeTab).not.toHaveBeenCalled();
  });

  it('releases a tab that is not the last, without exiting', () => {
    const managers = makeManagers();

    const { applied } = close([makeTab('main', 'red'), makeTab('bob', 'blue')], 1, managers);

    expect(emit).not.toHaveBeenCalledWith('app', { type: 'exit' });
    expect(applied).toBe(true);
    expect(managers.shell.closeTab).toHaveBeenCalledWith('bob');
  });

  // A docked tab never counts toward the last-tab rule, so one center tab remaining is no reason to
  // close the app-wide SQLite connections.
  it('closes a docked tab beside the one center tab without exiting or closing every database', () => {
    const managers = makeManagers();
    const docked: Tab = { ...makeTab('files', 'green'), dock: 'left' };

    const { applied } = close([makeTab('main', 'red'), docked], 1, managers);

    expect(emit).not.toHaveBeenCalledWith('app', { type: 'exit' });
    expect(applied).toBe(true);
    expect(managers.database.closeAll).not.toHaveBeenCalled();
    expect(managers.fileNavigator.closeTab).toHaveBeenCalledWith('files');
  });
});
