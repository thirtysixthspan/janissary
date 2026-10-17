import { describe, expect, it } from 'vitest';
import { decodeSystemScheduleSnapshot } from './store-decode.js';

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

  it('distinguishes unsupported schema versions', () => {
    expect(decodeSystemScheduleSnapshot({ version: 2, entries: [] })).toEqual({ ok: false, kind: 'unsupported-version', version: 2 });
    expect(decodeSystemScheduleSnapshot([]).ok).toBe(false);
  });
});
