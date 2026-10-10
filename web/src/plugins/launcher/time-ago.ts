// A tab's activity, rendered as "4m ago" on a row and "4m ago since" in its hover card. Two shapes for
// the same duration because the two surfaces read differently.
//
// The number itself arrives already minute-rounded from the host: a tab's activity is its own
// transcript, and second resolution there would turn every append into a new row. The rounding is
// invisible here, because a row that reads "4m ago" cannot tell a rounded minute from an exact one.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The prefix a hover card puts before the duration, so the line reads as a fact about the tab rather
// than as a row's label.
export const timeAgoPrefix = 'active ';

// The duration since `at`, in the coarsest unit that still says something. A tab that has done nothing
// at all has no time value to show.
export function relativeTime(at: number, now: number = Date.now()): string {
  if (at <= 0) return '';
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  return `${Math.floor(elapsed / DAY)}d`;
}
