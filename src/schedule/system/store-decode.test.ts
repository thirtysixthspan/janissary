import { describe, expect, it } from 'vitest';
import { decodeSystemScheduleSnapshot } from './store-decode.js';
import { parseEverySchedule } from '../every-schedule.js';

const entry = {
  key: 'opaque-1', id: 'morning', command: 'script morning', spec: 'every day at 8am',
  nextRun: 1_800_000_000_000, recurring: true, timeOfDay: { hour: 8, minute: 0 }, script: 'morning',
};

describe('system schedule store decoding', () => {
  it('accepts duplicate display ids when opaque keys differ', () => {
    const result = decodeSystemScheduleSnapshot({ version: 1, entries: [entry, { ...entry, key: 'opaque-2' }] });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid recurrence data and duplicate keys', () => {
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [{ ...entry, intervalMs: 10 }] }).ok).toBe(false);
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [entry, entry] }).ok).toBe(false);
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [{ ...entry, nextRun: Infinity }] }).ok).toBe(false);
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [{ ...entry, timeOfDay: { hour: 24, minute: 0 } }] }).ok).toBe(false);
  });

  it('round-trips recurrence entries produced by the schedule parser', () => {
    const now = new Date(1_800_000_000_000);
    const forms = [
      ['every', '5m', 'script', 'morning'],
      ['every', 'monday', 'at', '8am', 'script', 'morning'],
      ['every', 'day', 'at', '9pm', 'script', 'morning'],
    ];
    const entries = forms.map((tokens, index) => {
      const parsed = parseEverySchedule(tokens, now);
      if (parsed.action !== 'add') throw new Error('expected a schedule entry');
      return { key: `opaque-${index}`, id: `timer-${index}`, script: 'morning', ...parsed.entry };
    });
    expect(decodeSystemScheduleSnapshot({ version: 1, entries }).ok).toBe(true);
  });

  it('rejects a stored entry that violates a parser rule', () => {
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [{ ...entry, timeOfDay: { hour: 8, minute: 60 } }] }).ok).toBe(false);
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [{ ...entry, weekday: 7 }] }).ok).toBe(false);
  });

  it('decodes version-2 snapshots with and without paused entries', () => {
    expect(decodeSystemScheduleSnapshot({ version: 2, entries: [entry] })).toEqual({
      ok: true, snapshot: { version: 2, entries: [entry] },
    });
    expect(decodeSystemScheduleSnapshot({ version: 2, entries: [{ ...entry, paused: true }] })).toEqual({
      ok: true, snapshot: { version: 2, entries: [{ ...entry, paused: true }] },
    });
  });

  it('rejects paused in a version-1 entry', () => {
    expect(decodeSystemScheduleSnapshot({ version: 1, entries: [{ ...entry, paused: true }] }).ok).toBe(false);
  });

  it('rejects a non-true paused value in a version-2 entry', () => {
    expect(decodeSystemScheduleSnapshot({ version: 2, entries: [{ ...entry, paused: false }] }).ok).toBe(false);
    expect(decodeSystemScheduleSnapshot({ version: 2, entries: [{ ...entry, paused: 1 }] }).ok).toBe(false);
  });

  it('rejects a paused one-shot in a version-2 entry', () => {
    const oneShot = { ...entry, recurring: false, timeOfDay: undefined };
    expect(decodeSystemScheduleSnapshot({ version: 2, entries: [{ ...oneShot, paused: true }] }).ok).toBe(false);
  });

  it('distinguishes unsupported schema versions', () => {
    expect(decodeSystemScheduleSnapshot({ version: 3, entries: [] })).toEqual({ ok: false, kind: 'unsupported-version', version: 3 });
    expect(decodeSystemScheduleSnapshot([]).ok).toBe(false);
  });
});
