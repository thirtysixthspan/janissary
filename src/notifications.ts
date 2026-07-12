import type { NotificationConfig } from './types.js';
import type { Managers } from './managers.js';
import { getConfig } from './config.js';
import { NOTIFICATIONS_LABEL, notificationsTab, appendNotification } from './notifications-tab.js';

// The events that can feed the notifications tab. Four are ambient (a background tab's own
// activity); `manual` is an explicit `notify <message>` and `auto-approve` is a workspaced
// harness's auto-approved permission gate — both are always eligible and bypass focus suppression.
export type NotificationEventType =
  | 'state-change'
  | 'incoming-message'
  | 'schedule-fire'
  | 'agent-start'
  | 'manual'
  | 'auto-approve';

// Whether an event should be recorded, given the config and the active tab. Defensive against the
// tab feeding itself. For the four ambient events, both the per-event opt-in toggle and focus
// suppression (the active tab never notifies about its own activity) apply; the `manual` event
// bypasses both — an explicit trigger always fires (subject only to the tab being open, enforced
// in `notify`).
export function shouldNotify(
  config: NotificationConfig | undefined,
  event: NotificationEventType,
  tabLabel: string,
  activeLabel: string,
): boolean {
  if (tabLabel === NOTIFICATIONS_LABEL) return false;
  if (event === 'manual' || event === 'auto-approve') return true;
  if (tabLabel === activeLabel) return false;
  if (!config) return false;
  switch (event) {
    case 'state-change': { return config.events.stateChange; }
    case 'incoming-message': { return config.events.incomingMessage; }
    case 'schedule-fire': { return config.events.scheduleFire; }
    case 'agent-start': { return config.events.agentStart; }
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
// `incoming-message`, the user's message for `manual`, and the approver's message for
// `auto-approve`. The `manual` and `auto-approve` bodies are the message alone — the tab label
// already leads the line via the header, so repeating it here would double it.
export function notificationText(event: NotificationEventType, tabLabel: string, detail?: string): string {
  switch (event) {
    case 'state-change': { return `Agent '${tabLabel}' finished`; }
    case 'agent-start': { return `Agent '${tabLabel}' started`; }
    case 'schedule-fire': { return `Scheduled: ${detail} in ${tabLabel}`; }
    case 'incoming-message': { return `Message from ${detail} in ${tabLabel}`; }
    case 'manual':
    case 'auto-approve': { return detail ?? ''; }
  }
}

// Record a notification for an event on `tabLabel`. Returns immediately (costing nothing, and
// never creating the tab) while the notifications tab is closed, so the event path is free when the
// feed is not open. Otherwise it consults the config + focus rules via `shouldNotify` and, on pass,
// appends the derived line. `message` is the event-specific detail (see `notificationText`).
export function notify(managers: Managers, event: NotificationEventType, tabLabel: string, message?: string): void {
  if (!notificationsTab(managers)) return;
  const activeLabel = managers.tab.cur().label;
  if (!shouldNotify(getConfig().notifications, event, tabLabel, activeLabel)) return;
  const fromColor = managers.tab.tabs.find((t) => t.label === tabLabel)?.dotColor;
  // The dot label is the notification's provenance header — when, then who — so the line reads
  // `● 8:32pm janus: <message>`. `fromColor` (looked up from tabLabel) still colors the dot.
  const from = `${formatTimestamp(new Date())} ${tabLabel}`;
  const output = notificationText(event, tabLabel, message);
  appendNotification(managers, { input: '', output, from, fromColor });
}
