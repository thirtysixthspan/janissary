// Formatting for the two facts a replay reports about itself that are not numbers to paste: a
// duration, and a wall-clock start time. Both come from the recording's own header, so both are shown
// in the session's own local time rather than in whatever zone the viewer happens to be in.

// `m:ss`, or `h:mm:ss` once a recording runs past an hour — an unattended run does.
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

// A 12-hour clock time, matching how the notifications feed renders one, so the two do not disagree
// about what a recording started at.
export function formatStartedAt(epochSeconds: number): string {
  if (!epochSeconds) return '';
  const at = new Date(epochSeconds * 1000);
  const hours = at.getHours() % 12 || 12;
  return `${hours}:${String(at.getMinutes()).padStart(2, '0')}${at.getHours() < 12 ? 'am' : 'pm'}`;
}
