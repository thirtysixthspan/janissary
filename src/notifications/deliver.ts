import type { Managers } from '../managers.js';
import type { RecordedNotification } from './queue.js';
import { messageBus } from '../bus.js';
import { appendNotification, notificationsFeedVisible, showNotificationsFeed } from './tab.js';
import { appendNotificationRecord, clearNotificationRecord } from './record.js';

// Where a notification that has already passed `shouldNotify` goes. Holding it and rendering it are
// separate steps here: it always reaches the queue and the record, and only then is a surface
// chosen — the feed when one is on screen, an escalation when this is a burst, a toast otherwise.

// Make the feed visible and empty the corner in the same breath. The feed now renders those same
// notifications, so leaving toasts up would show one line in two places at once.
export function escalateToFeed(managers: Managers): void {
  showNotificationsFeed(managers);
  messageBus.emit('notifications', { type: 'clear' });
}

// Empty everything a notification was held in — the queue, the record file, and the corner — for
// `notifications clear`. Opens nothing: a feed already open simply goes empty.
export function clearNotifications(managers: Managers): void {
  managers.notifications.clear();
  clearNotificationRecord();
  messageBus.emit('notifications', { type: 'clear' });
}

// `replayed` marks a notification a caller detected earlier and is reporting now — a remote
// harness's queued auto-approvals, replayed on reattach. Those reach the queue, the record, and the
// feed, but never a toast: a toast carries no time, and one cannot honestly represent something
// that happened hours or days ago. They still count toward the burst, so a reattach delivering
// several of them docks the feed open — silence in the corner, history in the feed.
export function deliverNotification(
  managers: Managers,
  notification: RecordedNotification,
  replayed: boolean,
): void {
  managers.notifications.append(notification);
  appendNotificationRecord(notification);
  appendNotification(managers, notification.entry);
  if (notificationsFeedVisible(managers)) return;
  if (managers.notifications.isBurst(notification.recordedAt)) { escalateToFeed(managers); return; }
  if (replayed) return;
  messageBus.emit('notifications', {
    type: 'toast',
    from: notification.tabLabel,
    message: notification.message,
    ...(notification.color && { color: notification.color }),
  });
}
