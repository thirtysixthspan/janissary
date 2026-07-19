import { describe, it, expect, beforeEach } from 'vitest';
import { command } from './schedules.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('schedules command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('schedules');
  });

  it('matches schedules commands case-insensitively', () => {
    expect(command.match('schedules')).toBe(true);
    expect(command.match('SCHEDULES left')).toBe(true);
  });

  it('does not match non-schedules input', () => {
    expect(command.match('schedule')).toBe(false);
  });
});

describe('schedules command run', () => {
  let managers: Managers;
  let tab: { label: string };

  beforeEach(() => {
    managers = makeManagers();
    tab = { label: managers.tab.tabs[0].label };
  });

  const run = (command_: string) => command.run!(command_, tab as never, managers);

  it('opens a singleton schedules tab', () => {
    run('schedules');
    expect(managers.tab.tabs.filter((t) => t.view === 'schedules')).toHaveLength(1);
  });

  it('docks the tab into the requested sidebar', () => {
    run('schedules right');
    const scheduleTab = managers.tab.tabs.find((t) => t.view === 'schedules');
    expect(scheduleTab!.dock).toBe('right');
  });
});
