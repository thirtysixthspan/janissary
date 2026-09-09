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
// `open-unsupported` reports that `open` found no opener for a file's extension — a deliberate
// action's answer, and the one dispatcher error a file navigator activation can produce, where the
// originating tab renders rows rather than a transcript.
// `plugin-note` is a line a tab plugin reported through
// its own `notifyUser` capability — a track a playlist had to drop, say — as opposed to
// `plugin-failure`, which the host reports when a plugin breaks. `e2e-browser-gone` reports that a
// `-b` tab's browser is no longer there — a failed launch, a browser that exited, or a guard that
// died are one event to the user, since the consequence is the same: `connect()` now fails.
// Explicit events are always eligible and bypass focus suppression.
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
  | 'e2e-browser-gone'
  | 'file-operation'
  | 'open-unsupported'
  | 'plugin-failure'
  | 'plugin-note';

// A background tab's own activity. Both the per-event opt-in toggle and focus suppression (the
// active tab never notifies about its own activity) apply to these five.
export type AmbientNotificationEvent =
  | 'state-change'
  | 'incoming-message'
  | 'schedule-fire'
  | 'agent-start'
  | 'rate-limited';

// Everything else, derived rather than restated: a new member of `NotificationEventType` lands here
// automatically and then fails `EXPLICIT_EVENTS` below until it is classified.
export type ExplicitNotificationEvent = Exclude<NotificationEventType, AmbientNotificationEvent>;

// Each ambient event and the config toggle that opts into it. Keyed by the union, and valued by a
// key of the config, so neither a new ambient event nor a renamed toggle can slip through — the
// same reason `CLIENT_FRAME_TYPES` and `CAPABILITIES` are keyed by their unions.
export const AMBIENT_EVENTS: Record<AmbientNotificationEvent, keyof NotificationConfig['events']> = {
  'state-change': 'stateChange',
  'incoming-message': 'incomingMessage',
  'schedule-fire': 'scheduleFire',
  'agent-start': 'agentStart',
  'rate-limited': 'rateLimited',
};

// The events that are always eligible and bypass focus suppression. `manual` is an explicit
// `notify`, `auto-approve` an auto-approved permission gate, `editor-suggest` a persona query's
// failure, `question` an agent waiting on a human, `open-unsupported` an `open` that found no
// opener. The rest — a lost transcript, an abandoned
// recording, a dead browser, a failed file operation, a plugin's own note or breakage — bypass it
// for one shared reason: the tab it happened to is very often the tab the user is watching, which
// is exactly the case focus suppression would discard.
//
// Keyed by the union so an eighteenth event stops compiling here until it is classified, rather
// than falling through a `default` arm to `false` and never reaching the feed.
export const EXPLICIT_EVENTS: Record<ExplicitNotificationEvent, true> = {
  manual: true,
  'auto-approve': true,
  'editor-suggest': true,
  question: true,
  'transcript-unavailable': true,
  'ssh-recording-failed': true,
  'harness-recording-failed': true,
  'e2e-browser-gone': true,
  'file-operation': true,
  'open-unsupported': true,
  'plugin-failure': true,
  'plugin-note': true,
};

function isAmbient(event: NotificationEventType): event is AmbientNotificationEvent {
  return Object.hasOwn(AMBIENT_EVENTS, event);
}

// Whether an event should be recorded, given the config and the active tab. Defensive against the
// tab feeding itself. An explicit trigger always fires, subject only to the tab being open (enforced
// in `notify`); an ambient one is subject to its toggle and to focus suppression.
export function shouldNotify(
  config: NotificationConfig | undefined,
  event: NotificationEventType,
  tabLabel: string,
  activeLabel: string,
): boolean {
  if (tabLabel === NOTIFICATIONS_LABEL) return false;
  if (!isAmbient(event)) return EXPLICIT_EVENTS[event];
  if (tabLabel === activeLabel) return false;
  if (!config) return false;
  return config.events[AMBIENT_EVENTS[event]];
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
    case 'file-operation':
    case 'open-unsupported': { return detail ?? ''; }
    case 'plugin-failure':
    case 'plugin-note': { return detail ?? ''; }
    case 'question': { return `Question from ${tabLabel}`; }
    case 'transcript-unavailable': { return 'no harness transcript found'; }
    case 'ssh-recording-failed': { return 'ssh recording failed'; }
    case 'harness-recording-failed': { return 'harness recording failed'; }
    case 'e2e-browser-gone': { return detail ?? 'e2e browser stopped'; }
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
  const fromColor = managers.tab.byLabel(tabLabel)?.dotColor;
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
