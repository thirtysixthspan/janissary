import { describe, expect, it, vi } from 'vitest';
import { buildHarnessSchedule, oneShotRunEntry } from './harness-schedule.js';
import type { ProfileHarnessEntry } from './types.js';

function entry(over: Partial<ProfileHarnessEntry> = {}): ProfileHarnessEntry {
  return { name: 'lint', tool: 'claude', ...over } as ProfileHarnessEntry;
}

describe('oneShotRunEntry', () => {
  it('builds an entry that fires once, immediately', () => {
    const built = oneShotRunEntry('run-1', 'npm run lint');
    expect(built).toMatchObject({ id: 'run-1', command: 'npm run lint', spec: 'once', recurring: false });
    expect(built.nextRun).toBeLessThanOrEqual(Date.now());
  });
});

describe('buildHarnessSchedule', () => {
  it('builds an entry for each authored schedule, named after it', () => {
    const report = vi.fn();
    const entries = buildHarnessSchedule(entry({ schedule: ['t1 every 5m echo hi'] }), report);
    expect(report).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 't1', command: 'echo hi', spec: 'every 5m', recurring: true });
  });

  // A profile's `schedule` array is authored declaratively, so a management verb there is a mistake
  // in the file rather than a request — and running it would clear the tab's whole schedule.
  it('reports a management verb as not a new schedule, and skips it', () => {
    const report = vi.fn();
    const entries = buildHarnessSchedule(entry({ schedule: ['list', 't1 every 5m echo hi'] }), report);
    expect(report).toHaveBeenCalledWith('Schedule "list" for "lint" is not a new schedule.');
    expect(entries.map((e) => e.id)).toEqual(['t1']);
  });

  // `in <tab>` would attach the timer to a different tab than the harness this schedule belongs to.
  it('reports a schedule that names another tab, and skips it', () => {
    const report = vi.fn();
    const entries = buildHarnessSchedule(entry({ schedule: ['t1 in other every 5m echo hi'] }), report);
    expect(report).toHaveBeenCalledWith('Schedule "t1 in other every 5m echo hi" for "lint" cannot target another tab.');
    expect(entries).toEqual([]);
  });

  // Two timers with one name would leave `schedule cancel <name>` ambiguous, so the first wins and
  // the duplicate is said out loud rather than silently overwriting.
  it('keeps the first of two schedules sharing a name, and says so', () => {
    const report = vi.fn();
    const entries = buildHarnessSchedule(
      entry({ schedule: ['t1 every 5m echo first', 't1 every 9m echo second'] }), report,
    );
    expect(report).toHaveBeenCalledWith('Duplicate schedule name "t1" for "lint"; kept the first.');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 't1', command: 'echo first', spec: 'every 5m' });
  });

  it('reports a line it cannot parse, naming the raw line and the harness', () => {
    const report = vi.fn();
    expect(buildHarnessSchedule(entry({ schedule: ['t1 whenever'] }), report)).toEqual([]);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('Schedule "t1 whenever" for "lint": '));
  });

  // The two sources share one list but not one namespace: run lines are numbered rather than named,
  // so an authored schedule can never collide with one.
  it('appends each run line as a numbered one-shot after the schedules', () => {
    const report = vi.fn();
    const entries = buildHarnessSchedule(
      entry({ schedule: ['t1 every 5m echo hi'], run: ['npm run lint', 'npm test'] }), report,
    );
    expect(report).not.toHaveBeenCalled();
    expect(entries.map((e) => [e.id, e.spec])).toEqual([
      ['t1', 'every 5m'], ['run-1', 'once'], ['run-2', 'once'],
    ]);
  });

  it('builds an empty schedule from an entry that asks for neither', () => {
    const report = vi.fn();
    expect(buildHarnessSchedule(entry(), report)).toEqual([]);
    expect(buildHarnessSchedule(entry({ schedule: [], run: [] }), report)).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });
});
