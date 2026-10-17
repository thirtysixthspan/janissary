import type { ScheduleRow } from '@shared/plugins/schedules/shared';

// Selection arithmetic for the schedules tab's keyboard navigation, kept separate from
// SchedulesTab.tsx so it's unit-testable without rendering. The non-wrapping Arrow/Home/End rule is
// the one every plugin record list shares, published by the plugin API.
export { nextListSelection as nextSelection } from '../api';

export function scheduleRowKey(row: ScheduleRow): string {
  return row.owner === 'system'
    ? JSON.stringify(['system', row.key])
    : JSON.stringify(['tab', row.tab, row.id]);
}
