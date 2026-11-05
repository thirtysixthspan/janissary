const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The relative last-activity column the sessions and connections tables share. Coarse on purpose:
// the question a row answers is "recently, or a while ago", and a live seconds counter would redraw
// the list for no information.
export function relativeActivity(activity: number, now: number): string {
  const elapsed = Math.max(0, now - activity);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}
