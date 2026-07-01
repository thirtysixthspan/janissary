import { describe, it, expect, beforeEach } from 'vitest';
import { command } from './schedule.js';
import type { ScheduleEntry, LogEntry } from '../types.js';


describe('schedule command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('schedule');
  });

  it('matches schedule commands case-insensitively', () => {
    expect(command.match('schedule every 5m echo hi')).toBe(true);
    expect(command.match('SCHEDULE list')).toBe(true);
    expect(command.match('schedule')).toBe(true);
  });

  it('does not match non-schedule input', () => {
    expect(command.match('scheduled')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('schedule command run', () => {
  let schedule: ScheduleEntry[];
  let outputs: string[];
  let tab: { label: string; index: number };
  let managers: unknown;

  beforeEach(() => {
    schedule = [];
    outputs = [];
    tab = { label: 'janus', index: 0 };
    managers = {
      schedule: {
        get: () => schedule,
        set: (_label: string, next: ScheduleEntry[]) => { schedule = next; },
      },
      tab: {
        append: (_label: string, entry: LogEntry) => { outputs.push(entry.output); },
        tabs: [{ label: 'janus' }],
        persist: () => {},
        buildAgentState: () => ({}),
      },
    };
  });

  const run = (command_: string) => command.run!(command_, tab, managers as never);

  it('adds a named entry and records it', () => {
    run('schedule fetch every 5m echo hi');
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({ id: 'fetch', command: 'echo hi', spec: 'every 5m', recurring: true });
    expect(outputs.at(-1)).toContain('Scheduled fetch');
  });

  it('errors on a named timer with no schedule form and leaves state untouched', () => {
    run('schedule deploy');
    expect(outputs.at(-1)).toContain('Usage:');
    expect(schedule).toHaveLength(0);
  });

  it('lists entries by name', () => {
    run('schedule a every 5m echo a');
    run('schedule b at 3pm echo b');
    expect(schedule.map((entry) => entry.id)).toEqual(['a', 'b']);

    run('schedule list');
    const listing = outputs.at(-1);
    expect(listing).toContain('a');
    expect(listing).toContain('b');
    expect(listing).toContain('echo a');
  });

  it('cancels a single entry by name', () => {
    run('schedule a every 5m echo a');
    run('schedule b every 1h echo b');
    run('schedule cancel a');
    expect(schedule.map((entry) => entry.id)).toEqual(['b']);
    expect(outputs.at(-1)).toBe('Cancelled a.');
  });

  it('reports cancelling an unknown name', () => {
    run('schedule cancel nope');
    expect(outputs.at(-1)).toBe('No scheduled command "nope".');
  });

  it('clears all entries', () => {
    run('schedule a every 5m echo a');
    run('schedule clear');
    expect(schedule).toHaveLength(0);
    expect(outputs.at(-1)).toContain('Cleared 1');
  });

  it('rejects a duplicate name', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule deploy every 5m echo hi');
    expect(schedule).toHaveLength(1);
    expect(outputs.at(-1)).toContain('already exists');
  });

  it('cancels a named entry by name', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule cancel deploy');
    expect(schedule).toHaveLength(0);
    expect(outputs.at(-1)).toBe('Cancelled deploy.');
  });
});
