import { describe, it, expect } from 'vitest';
import type { ScheduleRow } from '@shared/plugins/schedules/shared';
import { sectionSchedules } from './schedules-sections';

const base = { spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: false, command: 'echo hi' };

function tabRow(id: string): ScheduleRow {
  return { ...base, id, tab: 'agent-1' };
}

function systemRow(id: string, key: string): ScheduleRow {
  return { ...base, id, tab: 'system', command: `script ${id}`, owner: 'system', key };
}

describe('sectionSchedules', () => {
  it('splits system rows from tab rows, keeping each group in its incoming order', () => {
    const entries = [tabRow('a'), systemRow('b', 'k1'), tabRow('c'), systemRow('d', 'k2')];

    const sections = sectionSchedules(entries);

    expect(sections.system.map((row) => row.id)).toEqual(['b', 'd']);
    expect(sections.tabs.map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('orders the flat list system rows first, then tab rows', () => {
    const entries = [tabRow('a'), systemRow('b', 'k1'), tabRow('c')];

    expect(sectionSchedules(entries).ordered.map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns empty groups for an empty list', () => {
    expect(sectionSchedules([])).toEqual({ system: [], tabs: [], ordered: [] });
  });

  it('leaves the system group empty when no project-owned rows exist', () => {
    const sections = sectionSchedules([tabRow('a')]);

    expect(sections.system).toEqual([]);
    expect(sections.ordered).toEqual(sections.tabs);
  });
});
