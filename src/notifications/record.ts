import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, writeSync } from 'node:fs';
import path from 'node:path';
import type { RecordedNotification } from './queue.js';

// The durable trail of every notification the user was given, one JSON object per line, appended as
// each one is recorded and **never read back by the application**. The queue (see `queue.ts`) is
// run-scoped precisely because this file is not: the record outlives the process, the queue does
// not, and nothing rehydrates one from the other. Modelled on `TranscriptLogger`, which writes
// `.janissary/log/<date>.json` the same newline-delimited way.

let recordPath = '';

// Set once a write fails. A record file that cannot be written (no permission, disk full, a
// read-only checkout) must not cost a syscall per notification for the rest of the run, and must
// not be reported as a notification either — a notification about failing to record notifications
// would itself need recording.
let abandoned = false;

export function initNotificationRecord(projectDir?: string): void {
  abandoned = false;
  if (!projectDir) { recordPath = ''; return; }
  const dir = path.join(projectDir, '.janissary');
  try {
    mkdirSync(dir);
  } catch {
    // An existing directory is expected; validate it below before trusting the record path.
  }
  if (!isSafeDirectory(dir)) { recordPath = ''; return; }
  recordPath = path.join(dir, 'notifications.json');
}

function isSafeDirectory(dir: string): boolean {
  try {
    const stat = lstatSync(dir);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function writeRecord(contents: string, append: boolean): void {
  if (!isSafeDirectory(path.dirname(recordPath))) throw new Error('Unsafe notification record directory');
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK
    | (append ? constants.O_APPEND : constants.O_TRUNC);
  const descriptor = openSync(recordPath, flags, 0o666);
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error('Notification record is not a regular file');
    writeSync(descriptor, contents);
  } finally {
    closeSync(descriptor);
  }
}

export function notificationRecordPath(): string {
  return recordPath;
}

// One line per notification: the full ISO detection time (a file spanning runs needs an
// unambiguous date, which the feed's `8:32pm` is not), the event type (what makes the file
// greppable by kind, even though no surface shows it), the originating tab, the message body, and
// the link targets when the event carries them. The dot color is deliberately absent — it is a
// rendering detail of a session this file outlives.
export function appendNotificationRecord(notification: RecordedNotification): void {
  if (!recordPath || abandoned) return;
  const line = {
    detectedAt: notification.detectedAt.toISOString(),
    event: notification.event,
    tab: notification.tabLabel,
    message: notification.message,
    ...(notification.openFile && { openFile: notification.openFile }),
    ...(notification.openTab && { openTab: notification.openTab }),
  };
  try {
    writeRecord(JSON.stringify(line) + '\n', true);
  } catch {
    abandoned = true;
  }
}

// Empty the record without removing it, for `notifications clear`. A truncation that fails is
// swallowed on the same terms as a failed append.
export function clearNotificationRecord(): void {
  if (!recordPath) return;
  try {
    writeRecord('', false);
  } catch {
    abandoned = true;
  }
}
