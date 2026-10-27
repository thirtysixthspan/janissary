import type { NativeNotificationEvent } from '../protocol/events.js';
import type { NotificationEventType } from './index.js';

export type AlertSound = NonNullable<NativeNotificationEvent['category']> | 'none';
export type NotificationAlert = { desktop: boolean; sound: AlertSound };

export const NOTIFICATION_ALERT_DEFAULTS: Record<NotificationEventType, NotificationAlert> = {
  'agent-start': { desktop: false, sound: 'none' },
  'auto-approve': { desktop: true, sound: 'warning' },
  'auto-approve-no-workspace': { desktop: true, sound: 'warning' },
  'auto-resume': { desktop: true, sound: 'warning' },
  'e2e-browser-gone': { desktop: true, sound: 'error' },
  'editor-suggest': { desktop: true, sound: 'error' },
  'file-operation': { desktop: true, sound: 'error' },
  'harness-idle': { desktop: true, sound: 'warning' },
  'harness-recording-failed': { desktop: true, sound: 'error' },
  'launch-refused': { desktop: true, sound: 'warning' },
  'launch-root-cloned': { desktop: true, sound: 'warning' },
  'launch-workspace-cleaned': { desktop: true, sound: 'warning' },
  layout: { desktop: true, sound: 'warning' },
  manual: { desktop: true, sound: 'success' },
  'open-unsupported': { desktop: true, sound: 'error' },
  'plugin-failure': { desktop: true, sound: 'error' },
  'plugin-note': { desktop: true, sound: 'success' },
  question: { desktop: true, sound: 'warning' },
  'rate-limited': { desktop: false, sound: 'none' },
  'remote-refused': { desktop: true, sound: 'warning' },
  'remote-session': { desktop: true, sound: 'warning' },
  'remote-session-terminated': { desktop: true, sound: 'warning' },
  'schedule-fire': { desktop: false, sound: 'none' },
  'schedule-late': { desktop: true, sound: 'warning' },
  'shell-recording-failed': { desktop: true, sound: 'error' },
  'shell-transcript-failed': { desktop: true, sound: 'error' },
  'ssh-recording-failed': { desktop: true, sound: 'error' },
  'state-change': { desktop: false, sound: 'none' },
  'system-schedule-fire': { desktop: true, sound: 'warning' },
  tab: { desktop: true, sound: 'warning' },
  'transcript-unavailable': { desktop: true, sound: 'error' },
};
