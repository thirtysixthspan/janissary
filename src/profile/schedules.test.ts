import { describe, it, expect } from 'vitest';
import { openProfileSchedules } from './schedules.js';
import { schedulesTab } from '../schedules-tab.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import type { ProfileSchedulesEntry } from '../types.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('openProfileSchedules', () => {
  it('opens a docked schedules tab and records the docked note', () => {
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileSchedules([{ dock: 'right' }], managers, notes);

    expect(schedulesTab(managers)!.dock).toBe('right');
    expect(notes).toEqual(['Opened schedules (docked right).']);
  });

  it('opens an undocked schedules tab and records the plain note', () => {
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileSchedules([{}], managers, notes);

    expect(schedulesTab(managers)!.dock).toBeUndefined();
    expect(notes).toEqual(['Opened schedules.']);
  });

  it('does nothing when there are no schedules entries', () => {
    const managers = makeManagers();
    const notes: string[] = [];
    const empty: ProfileSchedulesEntry[] = [];

    openProfileSchedules(empty, managers, notes);

    expect(schedulesTab(managers)).toBeUndefined();
    expect(notes).toEqual([]);
  });
});
