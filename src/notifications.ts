import type { NotificationConfig } from './config.js';
import type { Managers } from './managers.js';
import { getConfig } from './config.js';
import { NOTIFICATIONS_LABEL, notificationsTab, appendNotification } from './notifications-tab.js';

// The events that can feed the notifications tab. Five are ambient (a background tab's own
// activity); `manual` is an explicit `notify <message>`, `auto-approve` is a workspaced harness's
// auto-approved permission gate, `editor-suggest` is an in-editor persona-suggestion query's
// failure or empty reply, `question` is an agent waiting for a human answer,
// `transcript-unavailable` reports that a harness tab's session record could not be found, so the
// tab is limited to screen snapshots, `ssh-recording-failed` and `harness-recording-failed` report
// that an ssh tab's or a harness tab's session recording was abandoned, so nothing more of that
// session lands on disk, and `file-operation`
// reports a failed file-navigator copy, paste, move, delete, or undo/redo replay.
// `plugin-note` is a line a tab plugin reported through
// its own `notifyUser` capability — a track a playlist had to drop, say — as opposed to
// `plugin-failure`, which the host reports when a plugin breaks. Explicit events are always
// eligible and bypass focus suppression.
export type NotificationEventType =
  | 'state-change'
  | 'incoming-message'
  | 'schedule-fire'
  | 'agent-start'
  | 'rate-limited'
  | 'manual'
  | 'auto-approve'
  | 'editor-suggest'
  | 'question'
  | 'transcript-unavailable'
  | 'ssh-recording-failed'
  | 'harness-recording-failed'
  | 'file-operation'
  | 'plugin-failure'
  | 'plugin-note';

// Whether an event should be recorded, given the config and the active tab. Defensive against the
// tab feeding itself. For the five ambient events, both the per-event opt-in toggle and focus
// suppression (the active tab never notifies about its own activity) apply; `manual`,
// `auto-approve`, `editor-suggest`, and `question` bypass both — an explicit trigger always fires (subject
// only to the tab being open, enforced in `notify`). `ssh-recording-failed` and
// `harness-recording-failed` bypass them for the same reason `plugin-note` does: the tab whose
// recording just failed is very often the tab the user is watching, which is exactly the case focus
// suppression would discard.
export function shouldNotify(
  config: NotificationConfig | undefined,
  event: NotificationEventType,
  tabLabel: string,
  activeLabel: string,
): boolean {
  if (tabLabel === NOTIFICATIONS_LABEL) return false;
  switch (event) {
    case 'manual':
    case 'auto-approve':
    case 'editor-suggest':
    case 'question':
    case 'transcript-unavailable':
    case 'ssh-recording-failed':
    case 'harness-recording-failed':
    case 'file-operation': { return true; }
    // `plugin-note` is explicit rather than ambient so focus suppression cannot swallow it: the
    // case that matters most — a plugin reporting on the very tab the user is watching — is the one
    // the ambient rule would have discarded.
    case 'plugin-failure':
    case 'plugin-note': { return true; }
    default: { break; }
  }
  if (tabLabel === activeLabel) return false;
  if (!config) return false;
  switch (event) {
    case 'state-change': { return config.events.stateChange; }
    case 'incoming-message': { return config.events.incomingMessage; }
    case 'schedule-fire': { return config.events.scheduleFire; }
    case 'agent-start': { return config.events.agentStart; }
    case 'rate-limited': { return config.events.rateLimited; }
    default: { return false; }
  }
}

// A compact 12-hour clock time (e.g. `8:32pm`) — hour without a leading zero, two-digit minutes,
// lowercase am/pm, no seconds. Leads each notification line's provenance header.
export function formatTimestamp(date: Date): string {
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = date.getHours() < 12 ? 'am' : 'pm';
  const hour12 = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  return `${hour12}:${minutes}${period}`;
}

// The message body for an event, rendered after the `<time> <tabLabel>:` header. `detail` carries
// the event-specific extra: the command for `schedule-fire`, the sender label for
// `incoming-message`, the user's message for `manual`, the approver's message for `auto-approve`,
// and the persona name plus outcome for `editor-suggest`. The `manual`, `auto-approve`, and
// `editor-suggest` bodies are the message alone — the tab label already leads the line via the
// header, so repeating it here would double it.
export function notificationText(event: NotificationEventType, tabLabel: string, detail?: string): string {
  switch (event) {
    case 'state-change': { return `Agent '${tabLabel}' finished`; }
    case 'agent-start': { return `Agent '${tabLabel}' started`; }
    case 'rate-limited': { return `Agent '${tabLabel}' is being rate limited`; }
    case 'schedule-fire': { return `Scheduled: ${detail} in ${tabLabel}`; }
    case 'incoming-message': { return `Message from ${detail} in ${tabLabel}`; }
    case 'manual':
    case 'auto-approve':
    case 'editor-suggest':
    case 'file-operation': { return detail ?? ''; }
    case 'plugin-failure':
    case 'plugin-note': { return detail ?? ''; }
    case 'question': { return `Question from ${tabLabel}`; }
    case 'transcript-unavailable': { return 'no harness transcript found'; }
    case 'ssh-recording-failed': { return 'ssh recording failed'; }
    case 'harness-recording-failed': { return 'harness recording failed'; }
  }
}

// Record a notification for an event on `tabLabel`. Returns immediately (costing nothing, and
// never creating the tab) while the notifications tab is closed, so the event path is free when the
// feed is not open. Otherwise it consults the config + focus rules via `shouldNotify` and, on pass,
// appends the derived line. `message` is the event-specific detail (see `notificationText`).
export function notify(
  managers: Managers,
  event: NotificationEventType,
  tabLabel: string,
  message?: string,
  openFile?: string,
  openTab?: string,
): void {
  if (!notificationsTab(managers)) return;
  const activeLabel = managers.tab.cur().label;
  if (!shouldNotify(getConfig().notifications, event, tabLabel, activeLabel)) return;
  const fromColor = managers.tab.tabs.find((t) => t.label === tabLabel)?.dotColor;
  // The dot label is the notification's provenance header — when, then who — so the line reads
  // `● 8:32pm janus: <message>`. `fromColor` (looked up from tabLabel) still colors the dot.
  const from = `${formatTimestamp(new Date())} ${tabLabel}`;
  const output = notificationText(event, tabLabel, message);
  appendNotification(managers, {
    input: '',
    output,
    from,
    fromColor,
    ...(openFile && { openFile }),
    ...(openTab && { openTab }),
  });
}
