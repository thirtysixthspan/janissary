export const SCHEDULES_PAYLOAD_SCHEMA_VERSION = 1;

// One row of the aggregated list: a scheduled command, the tab that owns it, and when it next runs.
// Deliberately re-declared rather than imported from the host's `AggregatedScheduleView`: this
// contract has to stay import-free so the client can run its guards without pulling server
// resolution into the browser graph. `shared.test.ts` pins the two shapes against each other.
export type ScheduleRow = {
  id: string;
  spec: string;
  next: string;
  recurring: boolean;
  tab: string;
  command: string;
};

export type SchedulesPayload = { entries: ScheduleRow[] };

export type CancelIntent = { tab: string; id: string };
export type FocusOwnerIntent = { tab: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScheduleRow(value: unknown): value is ScheduleRow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.spec === 'string'
    && typeof value.next === 'string'
    && typeof value.recurring === 'boolean'
    && typeof value.tab === 'string'
    && typeof value.command === 'string';
}

export function isSchedulesPayload(value: unknown): value is SchedulesPayload {
  return isRecord(value)
    && Array.isArray(value.entries)
    && value.entries.every((entry) => isScheduleRow(entry));
}

export function isCancelIntent(value: unknown): value is CancelIntent {
  return isRecord(value) && typeof value.tab === 'string' && typeof value.id === 'string';
}

export function isFocusOwnerIntent(value: unknown): value is FocusOwnerIntent {
  return isRecord(value) && typeof value.tab === 'string';
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}
