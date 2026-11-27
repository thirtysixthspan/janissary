import { describe, it, expect } from 'vitest';
import type { ScheduleRow } from '@shared/plugins/schedules/shared';
import { canPauseRow, nextSelection, scheduleRowKey } from './schedules-keys';

describe('nextSelection', () => {
  it('ArrowDown moves forward by one and clamps at the last index', () => {
    expect(nextSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextSelection(3, 2, 'ArrowDown')).toBe(2);
  });

  it('ArrowUp moves back by one and clamps at zero', () => {
    expect(nextSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextSelection(3, 0, 'ArrowUp')).toBe(0);
  });

  it('ArrowDown/ArrowUp with no prior selection start from index 0', () => {
    expect(nextSelection(3, null, 'ArrowDown')).toBe(1);
    expect(nextSelection(3, null, 'ArrowUp')).toBe(0);
  });

  it('Home jumps to the first index, End jumps to the last', () => {
    expect(nextSelection(5, 3, 'Home')).toBe(0);
    expect(nextSelection(5, 1, 'End')).toBe(4);
  });

  it('an unrelated key returns the selection unchanged', () => {
    expect(nextSelection(5, 2, 'a')).toBe(2);
    expect(nextSelection(5, null, 'a')).toBeNull();
  });

  it('length 0 always returns null regardless of key', () => {
    expect(nextSelection(0, 2, 'ArrowDown')).toBeNull();
    expect(nextSelection(0, null, 'Home')).toBeNull();
  });
});

describe('scheduleRowKey', () => {
  it('keeps duplicate system names distinct by immutable key', () => {
    const base = { id: 'build', spec: 'at 9am', next: 'later', recurring: false, tab: 'system', command: 'script build' };
    expect(scheduleRowKey({ ...base, owner: 'system', key: 'first' }))
      .not.toBe(scheduleRowKey({ ...base, owner: 'system', key: 'second' }));
  });

  it('keeps a system-tab timer distinct from a project-owned system row', () => {
    const base = { id: 'build', spec: 'at 9am', next: 'later', recurring: false, tab: 'system', command: 'script build' };
    expect(scheduleRowKey(base)).not.toBe(scheduleRowKey({ ...base, owner: 'system', key: 'first' }));
  });
});

describe('canPauseRow', () => {
  const base = { id: 'ping', spec: 'every 1m', next: 'in 1m', tab: 'system', command: 'script ping' };

  it('accepts a recurring system row with a key', () => {
    expect(canPauseRow({ ...base, owner: 'system', key: 'ping', recurring: true })).toBe(true);
  });

  it('stays true for a paused recurring system row', () => {
    expect(canPauseRow({ ...base, owner: 'system', key: 'ping', recurring: true, paused: true })).toBe(true);
  });

  it('refuses a one-shot system row', () => {
    expect(canPauseRow({ ...base, owner: 'system', key: 'ping', recurring: false })).toBe(false);
  });

  it('refuses a tab row even when it recurs', () => {
    expect(canPauseRow({ ...base, tab: 'agent-1', recurring: true })).toBe(false);
  });

  it('refuses a system row without a key', () => {
    const withoutKey = { ...base, owner: 'system', recurring: true } as unknown as ScheduleRow;
    expect(canPauseRow(withoutKey)).toBe(false);
  });
});
