import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../value-guards.js';
import type { RecordedNotification } from './queue.js';

// The durable trail of every notification the user was given, one JSON object per line, appended as
// each one is recorded and **never read back by the application**. The queue (see `queue.ts`) is
// run-scoped precisely because this file is not: the record outlives the process, the queue does
// not, and nothing rehydrates one from the other. It lives under `.janissary/logs/`, alongside the
// other files that outlive a run. Modelled on `ActivityLogger`, which writes newline-delimited
// JSON the same way.

let recordPath = '';

// Set once a write fails. A record file that cannot be written (no permission, disk full, a
// read-only checkout) must not cost a syscall per notification for the rest of the run, and must
// not be reported as a notification either — a notification about failing to record notifications
// would itself need recording.
let abandoned = false;

export function initNotificationRecord(projectDir?: string): void {
  abandoned = false;
  if (!projectDir) { recordPath = ''; return; }
  const stateDir = path.join(projectDir, '.janissary');
  try {
    mkdirSync(stateDir);
  } catch {
    // An existing directory is expected; validate it below before trusting the record path.
  }
  if (!isSafeDirectory(stateDir)) { recordPath = ''; return; }
  const logDir = path.join(stateDir, 'logs');
  try {
    mkdirSync(logDir);
  } catch {
    // An existing directory is expected; validate it below before trusting the record path.
  }
  if (!isSafeDirectory(logDir)) { recordPath = ''; return; }
  recordPath = path.join(logDir, 'notifications.json');
  migrateLegacyRecord(stateDir, recordPath);
}

// Before the record moved into `logs/`, the trail lived at the state root — the path the notification
// config now owns. Move a recognizable legacy record aside on the first launch after the move so its
// lines survive. A file that is not a record (the new config, a link, a FIFO) is left untouched.
function migrateLegacyRecord(stateDir: string, destination: string): void {
  const legacy = path.join(stateDir, 'notifications.json');
  try {
    if (existsSync(destination)) return;
    const stat = lstatSync(legacy);
    if (!stat.isFile() || stat.isSymbolicLink()) return;
    const firstLine = readFileSync(legacy, 'utf8').split('\n', 1)[0];
    if (!firstLine) return;
    const entry: unknown = JSON.parse(firstLine);
    if (!isRecord(entry) || typeof entry.detectedAt !== 'string' || typeof entry.event !== 'string') return;
    renameSync(legacy, destination);
  } catch {
    // Best effort: a legacy record that cannot be moved is simply left where it is.
  }
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
