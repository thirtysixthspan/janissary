import type { Managers } from '../managers.js';
import type { RecordedNotification } from './queue.js';
import { messageBus } from '../bus.js';
import { getConfig } from '../config.js';
import {
  appendNotification, clearNotificationsFeed, notificationsFeedVisible, replaceLatestNotification, showNotificationsFeed,
} from './tab.js';
import { appendNotificationRecord, clearNotificationRecord } from './record.js';
import { soundCategory } from './sound-category.js';

// Where a notification that has already passed `shouldNotify` goes. Holding it and rendering it are
// separate steps here: it always reaches the queue and the record, and only then is a surface
// chosen — the feed when one is on screen, an escalation when this is a burst, a toast otherwise.

// Make the feed visible and empty the corner in the same breath. The feed now renders those same
// notifications, so leaving toasts up would show one line in two places at once.
export function escalateToFeed(managers: Managers): void {
  const feed = showNotificationsFeed(managers);
  messageBus.emit('notifications', { type: 'reveal', dock: feed.dock ?? 'right' });
  messageBus.emit('notifications', { type: 'clear' });
}

// Empty everything a notification was held in — the queue, the record file, and the corner — for
// `notifications clear`. Opens nothing: a feed already open simply goes empty.
export function clearNotifications(managers: Managers): void {
  managers.notifications.clear();
  clearNotificationRecord();
  clearNotificationsFeed(managers);
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
  const { held, repeated } = managers.notifications.append(notification);
  appendNotificationRecord(notification);
  if (repeated) replaceLatestNotification(managers, held.entry);
  else appendNotification(managers, held.entry);
  if (!replayed) emitNativeNotification(notification);
  if (notificationsFeedVisible(managers)) return;
  if (managers.notifications.isBurst(notification.recordedAt)) { escalateToFeed(managers); return; }
  if (replayed) return;
  messageBus.emit('notifications', {
    type: 'toast',
    from: notification.tabName ?? notification.tabLabel,
    message: notification.message,
    ...(notification.color && { color: notification.color }),
  });
}

function emitNativeNotification(notification: RecordedNotification): void {
  const category = soundCategory(notification.event);
  if (!category) return;
  const config = getConfig();
  const volume = {
    success: config.terminalBellMuteSuccess ? 0 : config.terminalBellVolumeSuccess,
    warning: config.terminalBellMuteWarning ? 0 : config.terminalBellVolumeWarning,
    error: config.terminalBellMuteError ? 0 : config.terminalBellVolumeError,
  }[category];
  const effectiveVolume = config.terminalBell ? volume : 0;
  if (!config.osNotifications && effectiveVolume === 0) return;
  messageBus.emit('notifications', {
    type: 'native-notification',
    tab: notification.tabLabel,
    from: notification.tabName ?? notification.tabLabel,
    message: notification.message,
    category,
    desktop: config.osNotifications,
    volume: effectiveVolume,
  });
}
