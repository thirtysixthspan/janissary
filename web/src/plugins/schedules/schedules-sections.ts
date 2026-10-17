import type { ScheduleRow } from '@shared/plugins/schedules/shared';

export type ScheduleSections = {
  system: ScheduleRow[];
  tabs: ScheduleRow[];
  ordered: ScheduleRow[];
};

// Splits the aggregated list into project-owned system rows and tab-owned rows. Each group keeps the
// next-to-run order it arrived in. `ordered` is the on-screen sequence (system first), which the tab
// uses for selection, numbering, and keyboard navigation.
export function sectionSchedules(entries: ScheduleRow[]): ScheduleSections {
  const system = entries.filter((entry) => entry.owner === 'system');
  const tabs = entries.filter((entry) => entry.owner !== 'system');
  return { system, tabs, ordered: [...system, ...tabs] };
}
