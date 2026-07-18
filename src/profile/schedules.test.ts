import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProfileSchedules } from './schedules.js';
import { schedulesTab } from '../schedules-tab.js';
import { initProfileDir } from '../profiles.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('openProfileSchedules', () => {
  let root: string;

  const writeSchedules = (profile: string, contents: string) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_schedules.json'), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profsched-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('opens a docked schedules tab and records the docked note', () => {
    writeSchedules('claude', JSON.stringify([{ dock: 'right' }]));
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileSchedules('claude', managers, notes);

    expect(schedulesTab(managers)!.dock).toBe('right');
    expect(notes).toEqual(['Opened schedules (docked right).']);
  });

  it('opens an undocked schedules tab and records the plain note', () => {
    writeSchedules('claude', JSON.stringify([{}]));
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileSchedules('claude', managers, notes);

    expect(schedulesTab(managers)!.dock).toBeUndefined();
    expect(notes).toEqual(['Opened schedules.']);
  });

  it('does nothing when the profile has no _schedules.json', () => {
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileSchedules('claude', managers, notes);

    expect(schedulesTab(managers)).toBeUndefined();
    expect(notes).toEqual([]);
  });
});
