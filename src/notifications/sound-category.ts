import type { ExplicitNotificationEvent } from './index.js';

export type SoundCategory = 'success' | 'warning' | 'error';

const CATEGORIES: Record<ExplicitNotificationEvent, SoundCategory> = {
  manual: 'success',
  'plugin-note': 'success',
  question: 'warning',
  'harness-idle': 'warning',
  'auto-approve': 'warning',
  'auto-resume': 'warning',
  'schedule-late': 'warning',
  'remote-session-terminated': 'warning',
  'remote-session': 'warning',
  'launch-refused': 'warning',
  'launch-workspace-cleaned': 'warning',
  'launch-root-cloned': 'warning',
  'remote-refused': 'warning',
  'plugin-failure': 'error',
  'e2e-browser-gone': 'error',
  'file-operation': 'error',
  'open-unsupported': 'error',
  'transcript-unavailable': 'error',
  'ssh-recording-failed': 'error',
  'harness-recording-failed': 'error',
  'shell-recording-failed': 'error',
  'editor-suggest': 'error',
};

export function soundCategory(event: string): SoundCategory | undefined {
  return Object.hasOwn(CATEGORIES, event) ? CATEGORIES[event as ExplicitNotificationEvent] : undefined;
}
