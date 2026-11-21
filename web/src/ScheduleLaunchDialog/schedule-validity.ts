import type { ScheduleFields } from './schedule-command';

export function isValid(fields: ScheduleFields): boolean {
  if (!fields.name.trim()) return false;
  if (fields.target.kind === 'system' ? !fields.script : !fields.command.trim()) return false;
  switch (fields.type) {
    case 'at': { return fields.time.trim() !== ''; }
    case 'on': { return fields.date.trim() !== ''; }
    case 'every': { return fields.interval.trim() !== ''; }
    case 'everyDay': { return fields.time.trim() !== ''; }
    case 'everyWeekday': { return fields.time.trim() !== ''; }
  }
}
