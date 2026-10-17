import { describe, it, expect } from 'vitest';
import { buildScheduleCommand, type ScheduleFields } from './schedule-command';

function baseFields(overrides: Partial<ScheduleFields> = {}): ScheduleFields {
  return {
    name: 'fetch', target: { kind: 'tab', label: 'janus' }, activeTarget: 'janus', command: 'echo hi', script: 'deploy',
    type: 'at', time: '', date: '', interval: '', weekday: 'monday',
    ...overrides,
  };
}

describe('buildScheduleCommand', () => {
  it('builds an `at` form without an `in TAB` clause when the target is the active tab', () => {
    const text = buildScheduleCommand(baseFields({ type: 'at', time: '3pm' }));
    expect(text).toBe('schedule fetch at 3pm echo hi');
  });

  it('builds an `on` form with only a date', () => {
    const text = buildScheduleCommand(baseFields({ type: 'on', date: 'aug 12' }));
    expect(text).toBe('schedule fetch on aug 12 echo hi');
  });

  it('builds an `on` form with a date and time', () => {
    const text = buildScheduleCommand(baseFields({ type: 'on', date: 'aug 12', time: '9am' }));
    expect(text).toBe('schedule fetch on aug 12 at 9am echo hi');
  });

  it('builds an `every N` interval form', () => {
    const text = buildScheduleCommand(baseFields({ type: 'every', interval: '5m' }));
    expect(text).toBe('schedule fetch every 5m echo hi');
  });

  it('builds an `every day at TIME` form', () => {
    const text = buildScheduleCommand(baseFields({ type: 'everyDay', time: '9am' }));
    expect(text).toBe('schedule fetch every day at 9am echo hi');
  });

  it('builds an `every WEEKDAY at TIME` form', () => {
    const text = buildScheduleCommand(baseFields({ type: 'everyWeekday', weekday: 'friday', time: '5pm' }));
    expect(text).toBe('schedule fetch every friday at 5pm echo hi');
  });

  it('includes an `in TAB` clause when the target differs from the active tab', () => {
    const text = buildScheduleCommand(baseFields({ type: 'at', time: '3pm', target: { kind: 'tab', label: 'claude' }, activeTarget: 'janus' }));
    expect(text).toBe('schedule fetch in claude at 3pm echo hi');
  });

  it.each([
    ['at', { time: '3pm' }, 'at 3pm'],
    ['on', { date: 'aug 12' }, 'on aug 12'],
    ['every', { interval: '5m' }, 'every 5m'],
    ['everyDay', { time: '9am' }, 'every day at 9am'],
    ['everyWeekday', { weekday: 'friday', time: '5pm' }, 'every friday at 5pm'],
  ] as const)('builds a system %s form with a runscript only', (type, values, form) => {
    const text = buildScheduleCommand(baseFields({ target: { kind: 'system' }, type, ...values }));
    expect(text).toBe(`schedule system fetch ${form} script deploy`);
    expect(text).not.toContain('in system');
    expect(text).not.toContain('echo hi');
  });
});
