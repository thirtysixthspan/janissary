import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from './tab/manager.js';
import type { Managers } from './managers.js';
import { openSchedulesTab, schedulesTab } from './schedules-tab.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('openSchedulesTab', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('creates exactly one schedules tab and reuses it on a second call', () => {
    openSchedulesTab(managers);
    expect(managers.tab.tabs.filter((t) => t.view === 'schedules')).toHaveLength(1);
    openSchedulesTab(managers);
    expect(managers.tab.tabs.filter((t) => t.view === 'schedules')).toHaveLength(1);
  });

  it('docks the tab into the requested sidebar when a dock argument is given', () => {
    openSchedulesTab(managers, 'right');
    expect(schedulesTab(managers)!.dock).toBe('right');
  });

  it('undocks an existing docked tab back to center when reopened bare', () => {
    openSchedulesTab(managers, 'left');
    openSchedulesTab(managers);
    expect(schedulesTab(managers)!.dock).toBeUndefined();
  });
});
