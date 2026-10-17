import { describe, expect, it } from 'vitest';
import { aggregatedScheduleView } from './views.js';
import type { ScheduleEntry } from './types.js';
import type { SystemScheduleEntry } from './system/types.js';

const entry = (id: string, command: string, nextRun: number): ScheduleEntry => ({
  id, command, spec: 'at 9am', nextRun, recurring: false,
});

const systemEntry = (id: string, key: string, nextRun: number): SystemScheduleEntry => ({
  ...entry(id, `script ${id}`, nextRun), key, script: id,
});

describe('aggregatedScheduleView', () => {
  it('merges tab and system rows by raw time while keeping equal-time source order', () => {
    const tabRows = new Map([
      ['agent', [entry('same', 'build', 20), entry('tie-tab', 'test', 10)]],
      ['system', [entry('system', 'in system', 10)]],
    ]);

    const rows = aggregatedScheduleView(
      tabRows,
      [{ label: 'agent' }, { label: 'system' }] as never,
      [systemEntry('same', 'schedule-key', 10)],
    );

    expect(rows.map(({ id, owner, key }) => [id, owner, key])).toEqual([
      ['tie-tab', undefined, undefined],
      ['system', undefined, undefined],
      ['same', 'system', 'schedule-key'],
      ['same', undefined, undefined],
    ]);
    expect(rows[0]?.tab).toBe('agent');
    expect(rows[1]?.tab).toBe('system');
    expect(rows[2]).toMatchObject({ tab: 'system', command: 'script same' });
  });

  it('includes system rows when the managed system tab is absent', () => {
    expect(aggregatedScheduleView(new Map(), [], [systemEntry('build', 'key', 1)])).toMatchObject([
      { tab: 'system', id: 'build', command: 'script build', owner: 'system', key: 'key' },
    ]);
  });
});
