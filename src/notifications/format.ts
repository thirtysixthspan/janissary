import type { NotificationEventType } from './index.js';

// How a notification reads, separated from what notifies: `index.ts` decides whether an event
// becomes a notification at all, and this module renders the one it accepted. Nothing here touches
// the config, the tabs, or the queue — every function is a pure string transform.

// A compact 12-hour clock time (e.g. `8:32pm`) — hour without a leading zero, two-digit minutes,
// lowercase am/pm, no seconds. Leads each notification line's provenance header.
export function formatTimestamp(date: Date): string {
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = date.getHours() < 12 ? 'am' : 'pm';
  const hour12 = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  return `${hour12}:${minutes}${period}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A notification's provenance timestamp: `formatTimestamp`'s bare time for a `detectedAt` on
// today's calendar day, or a short date ahead of it (`Sep 20 9:05am`) for one from an earlier
// day — a replayed auto-approval from a multi-day detachment must not read as having happened
// today. The comparison is calendar day, not elapsed hours, so an event from 11pm last night is
// dated even though it is only a few hours old.
export function provenanceTimestamp(detectedAt: Date, now: Date = new Date()): string {
  const sameDay = detectedAt.getFullYear() === now.getFullYear()
    && detectedAt.getMonth() === now.getMonth() && detectedAt.getDate() === now.getDate();
  if (sameDay) return formatTimestamp(detectedAt);
  return `${SHORT_MONTHS[detectedAt.getMonth()]} ${detectedAt.getDate()} ${formatTimestamp(detectedAt)}`;
}

// The message body for an event, rendered after the `<time> <tabLabel>:` header. `detail` carries
// the event-specific extra: the command for `schedule-fire`, the sender label for
// `incoming-message`, the user's message for `manual`, the approver's message for `auto-approve`,
// and the persona name plus outcome for `editor-suggest`. The `manual`, `auto-approve`, and
// `editor-suggest` bodies are the message alone — the tab label already leads the line via the
// header, so repeating it here would double it.
export function notificationText(event: NotificationEventType, tabLabel: string, detail?: string): string {
  switch (event) {
    case 'schedule-late':
    case 'remote-session':
    case 'remote-session-terminated': { return detail ?? ''; }
    case 'state-change': { return `Agent '${tabLabel}' finished`; }
    case 'agent-start': { return `Agent '${tabLabel}' started`; }
    case 'rate-limited': { return `Agent '${tabLabel}' is being rate limited`; }
    case 'schedule-fire': { return `Scheduled: ${detail} in ${tabLabel}`; }
    case 'incoming-message': { return `Message from ${detail} in ${tabLabel}`; }
    case 'manual':
    case 'auto-approve':
    case 'editor-suggest':
    case 'file-operation':
    case 'open-unsupported': { return detail ?? ''; }
    case 'plugin-failure':
    case 'plugin-note':
    case 'launch-refused':
    case 'launch-workspace-cleaned':
    case 'remote-refused': { return detail ?? ''; }
    case 'question': { return `Question from ${tabLabel}`; }
    case 'transcript-unavailable': { return 'no harness transcript found'; }
    case 'ssh-recording-failed': { return 'ssh recording failed'; }
    case 'harness-recording-failed': { return 'harness recording failed'; }
    case 'e2e-browser-gone': { return detail ?? 'e2e browser stopped'; }
  }
}
