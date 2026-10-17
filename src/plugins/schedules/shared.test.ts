import { describe, expect, it } from 'vitest';
import type { AggregatedScheduleView } from '../../protocol.js';
import { isSchedulesPayload, type ScheduleRow } from './shared.js';

const ROW: ScheduleRow = {
  id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: true,
  tab: 'agent-1', command: 'echo hi',
};
const SYSTEM_ROW: ScheduleRow = {
  ...ROW, tab: 'system', id: 'build', command: 'script build', owner: 'system', key: 'stable-key',
};

// The shared contract has to stay import-free, so its row shape is re-declared rather than imported
// from the wire type the topic actually delivers. These two assignments are the pin that keeps the
// copy honest: either shape gaining or losing a field fails to compile here.
const asWireRow: AggregatedScheduleView = ROW;
const asPluginRow: ScheduleRow = asWireRow;
const asSystemWireRow: AggregatedScheduleView = SYSTEM_ROW;
const asSystemPluginRow: ScheduleRow = asSystemWireRow;

describe('schedules shared contract', () => {
  it('re-declares the aggregated schedule row exactly', () => {
    expect(asPluginRow).toEqual(ROW);
    expect(asSystemPluginRow).toEqual(SYSTEM_ROW);
  });

  it('accepts a complete payload', () => {
    expect(isSchedulesPayload({ entries: [] })).toBe(true);
    expect(isSchedulesPayload({ entries: [ROW] })).toBe(true);
    expect(isSchedulesPayload({ entries: [SYSTEM_ROW] })).toBe(true);
  });

  it('rejects null, an array, a missing entries list, and a malformed row', () => {
    expect(isSchedulesPayload(null)).toBe(false);
    expect(isSchedulesPayload([ROW])).toBe(false);
    expect(isSchedulesPayload({})).toBe(false);
    expect(isSchedulesPayload({ entries: {} })).toBe(false);
    for (const field of Object.keys(ROW)) {
      const partial: Record<string, unknown> = { ...ROW };
      delete partial[field];
    expect(isSchedulesPayload({ entries: [partial] })).toBe(false);
    }
    expect(isSchedulesPayload({ entries: [{ ...SYSTEM_ROW, key: undefined }] })).toBe(false);
    expect(isSchedulesPayload({ entries: [{ ...SYSTEM_ROW, owner: 'system', key: 1 }] })).toBe(false);
    expect(isSchedulesPayload({ entries: [{ ...SYSTEM_ROW, owner: 'tab' }] })).toBe(false);
  });
});
