export const SCHEDULES_PAYLOAD_SCHEMA_VERSION = 2;

// One row of the aggregated list: a scheduled command, the tab that owns it, and when it next runs.
// Deliberately re-declared rather than imported from the host's `AggregatedScheduleView`: this
// contract is import-free, so the client can run its guards without pulling server resolution into
// the browser graph. `shared.test.ts` pins the two row shapes against each other.
export type ScheduleRow = {
  id: string;
  spec: string;
  next: string;
  recurring: boolean;
  tab: string;
  command: string;
} & ({ owner?: 'tab'; key?: never } | { owner: 'system'; key: string });

export type SchedulesPayload = { entries: ScheduleRow[] };

type ScheduleOwnerIntent = { tab: string; owner?: 'tab'; key?: never }
  | { tab: 'system'; owner: 'system'; key: string };
export type CancelIntent = ScheduleOwnerIntent & { id: string };
export type FocusOwnerIntent = ScheduleOwnerIntent;
export type ClearIntent = { owner: 'system' | 'tab' };

function isScheduleRow(value: unknown): value is ScheduleRow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.spec === 'string'
    && typeof value.next === 'string'
    && typeof value.recurring === 'boolean'
    && typeof value.tab === 'string'
    && typeof value.command === 'string'
    && (value.owner === undefined && value.key === undefined
      || value.owner === 'tab' && value.key === undefined
      || value.owner === 'system' && typeof value.key === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSchedulesPayload(value: unknown): value is SchedulesPayload {
  return isRecord(value)
    && Array.isArray(value.entries)
    && value.entries.every((entry) => isScheduleRow(entry));
}

export function isCancelIntent(value: unknown): value is CancelIntent {
  return isRecord(value) && typeof value.tab === 'string' && typeof value.id === 'string'
    && isScheduleOwnerIntent(value);
}

export function isFocusOwnerIntent(value: unknown): value is FocusOwnerIntent {
  return isRecord(value) && typeof value.tab === 'string' && isScheduleOwnerIntent(value);
}

function isScheduleOwnerIntent(value: Record<string, unknown>): boolean {
  return value.owner === undefined && value.key === undefined
    || value.owner === 'tab' && value.key === undefined
    || value.owner === 'system' && value.tab === 'system' && typeof value.key === 'string';
}

export function isClearIntent(value: unknown): value is ClearIntent {
  return isRecord(value) && Object.keys(value).length === 1
    && (value.owner === 'system' || value.owner === 'tab');
}
