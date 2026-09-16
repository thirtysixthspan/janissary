import type { ScheduleEntry, TimeOfDay } from './types.js';
import { MONTHS } from './parsing.js';

export function formatLateDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function fmtTime({ hour, minute }: TimeOfDay): string {
  const ap = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, '0')}${ap}`;
}

export function fmtNextRun(ts: number): string {
  const d = new Date(ts);
  const mon = MONTHS[d.getMonth()];
  const month = mon[0].toUpperCase() + mon.slice(1, 3);
  return `${month} ${d.getDate()} ${fmtTime({ hour: d.getHours(), minute: d.getMinutes() })}`;
}

export function formatSchedule(entries: ScheduleEntry[]): string {
  if (entries.length === 0) return 'No scheduled commands.';
  return entries
    .map((e) => `${e.id}  ${e.spec}  (next: ${fmtNextRun(e.nextRun)})  ${e.command}`)
    .join('\n');
}
