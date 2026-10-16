import { initHarnessCaptureDirectory, clearCaptureDirectory } from '../harness/capture/file.js';
import { initHarnessRecordingDirectory, clearHarnessRecordingDirectory } from '../harness/recording-file.js';
import { initHarnessTranscriptDirectory, clearHarnessTranscriptDirectory } from '../harness/transcript-file.js';
import { initShellTranscriptDirectory, clearShellTranscriptDirectory } from '../shell/transcript/transcript-file.js';
import { initBrowserLogDirectory, clearBrowserLogDirectory } from '../browser/browser-log.js';
import { initGitFailureDirectory, clearGitFailureDirectory } from '../git/failure-output.js';
import { initGlobalHistory } from '../global-history.js';
import { initDbDir } from '../connections.js';
import { initProfileDir } from '../profiles.js';
import { initWorkspaceDir, clearWorkspaceDir } from '../workspace/index.js';
import { initRemoteFileCache, clearRemoteFileCache } from '../file-navigator/remote/file-cache.js';
import { initRemoteSessionStore } from '../sessions/store.js';
import { initNotificationRecord } from '../notifications/record.js';
import { TranscriptLogger } from '../transcript/logger.js';

// The per-subsystem init/clear pairs of the state directory, in the order `boot()` established.
// Everything that owns state under `.janissary/` has exactly one entry here, so wiring a new
// subsystem in with its init cannot forget its clear.
export type StateDirectoryEntry = {
  name: string;
  init: (projectDir: string, packageRoot: string) => void;
  clear?: () => void;
};

export const STATE_DIRECTORY_ENTRIES = [
  {
    name: 'harnessCapture',
    init: (projectDir: string): void => { initHarnessCaptureDirectory(projectDir); },
    clear: (): void => { clearCaptureDirectory(); },
  },
  {
    name: 'harnessRecording',
    init: (projectDir: string): void => { initHarnessRecordingDirectory(projectDir); },
    clear: (): void => { clearHarnessRecordingDirectory(); },
  },
  {
    name: 'harnessTranscript',
    init: (projectDir: string): void => { initHarnessTranscriptDirectory(projectDir); },
    clear: (): void => { clearHarnessTranscriptDirectory(); },
  },
  {
    name: 'shellTranscript',
    init: (projectDir: string): void => { initShellTranscriptDirectory(projectDir); },
    clear: (): void => { clearShellTranscriptDirectory(); },
  },
  {
    name: 'browserLog',
    init: (projectDir: string): void => { initBrowserLogDirectory(projectDir); },
    clear: (): void => { clearBrowserLogDirectory(); },
  },
  {
    name: 'gitFailureOutput',
    init: (projectDir: string): void => { initGitFailureDirectory(projectDir); },
    clear: (): void => { clearGitFailureDirectory(); },
  },
  {
    name: 'globalHistory',
    init: (_projectDir: string): void => { initGlobalHistory(); },
  },
  {
    name: 'connections',
    init: (projectDir: string): void => { initDbDir(projectDir); },
  },
  {
    name: 'profiles',
    init: (projectDir: string, packageRoot: string): void => { initProfileDir(projectDir, packageRoot); },
  },
  {
    name: 'workspace',
    init: (projectDir: string): void => { initWorkspaceDir(projectDir); },
    clear: (): void => { clearWorkspaceDir(); },
  },
  {
    name: 'remoteFileCache',
    init: (projectDir: string): void => { initRemoteFileCache(projectDir); },
    clear: (): void => { clearRemoteFileCache(); },
  },
  {
    // No `clear`, deliberately: outliving the process is the whole point of the record, so a fresh
    // start must not sweep it. An entry with no clear is never swept (see `clearStateDirectories`),
    // and a record describing a peer that can no longer exist is pruned when the store loads it.
    name: 'remoteSessions',
    init: (projectDir: string): void => { initRemoteSessionStore(projectDir); },
  },
  {
    // No `clear`, on the same terms as `remoteSessions` above: the record exists to outlive the
    // run, so a fresh start must not sweep it. `notifications clear` is what empties it, and that
    // is a deliberate user action rather than a launch-time decision.
    name: 'notificationRecord',
    init: (projectDir: string): void => { initNotificationRecord(projectDir); },
  },
  {
    name: 'transcriptLog',
    init: (projectDir: string): void => { new TranscriptLogger(projectDir); },
  },
] as const satisfies readonly StateDirectoryEntry[];

// The subsystem keys the registry must cover: a new entry without a key here fails the
// completeness assignment below, and a key whose entry has been dropped fails symmetrically —
// the compiler names both.
export const KNOWN_STATE_DIRECTORY_KEYS = [
  'harnessCapture', 'harnessRecording', 'harnessTranscript', 'shellTranscript',
  'browserLog', 'gitFailureOutput', 'globalHistory', 'connections', 'profiles', 'workspace',
  'remoteFileCache', 'remoteSessions', 'notificationRecord', 'transcriptLog',
] as const;

type RegisteredKey = (typeof STATE_DIRECTORY_ENTRIES)[number]['name'];
type UnregisteredKey = Exclude<(typeof KNOWN_STATE_DIRECTORY_KEYS)[number], RegisteredKey>;
type UnknownKey = Exclude<RegisteredKey, (typeof KNOWN_STATE_DIRECTORY_KEYS)[number]>;
export const STATE_DIRECTORY_ORDER_IS_COMPLETE: [UnregisteredKey] extends [never]
  ? ([UnknownKey] extends [never] ? true : UnknownKey)
  : UnregisteredKey = true;

export type StateDirectoryOptions = {
  projectDir: string;
  packageRoot: string;
};

// `boot()`'s whole state-directory lifecycle, stated once instead of sequenced by hand: init
// every registered subsystem in registry order.
export function initStateDirectories(options: StateDirectoryOptions): void {
  const entries: readonly StateDirectoryEntry[] = STATE_DIRECTORY_ENTRIES;
  for (const entry of entries) {
    entry.init(options.projectDir, options.packageRoot);
  }
}

// What every launch clears away: every entry with a clear.
export function clearStateDirectories(): void {
  const entries: readonly StateDirectoryEntry[] = STATE_DIRECTORY_ENTRIES;
  for (const entry of entries) {
    entry.clear?.();
  }
}
