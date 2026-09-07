import { initAgentStateDirectory, clearStateDirectory } from './agent/state.js';
import { initHarnessCaptureDirectory, clearCaptureDirectory } from './harness/capture-file.js';
import { initHarnessRecordingDirectory, clearHarnessRecordingDirectory } from './harness/recording-file.js';
import { initHarnessTranscriptDirectory, clearHarnessTranscriptDirectory } from './harness/transcript-file.js';
import { initBrowserLogDirectory, clearBrowserLogDirectory } from './browser/browser-log.js';
import { initGlobalHistory } from './global-history.js';
import { initDbDir } from './connections.js';
import { initProfileDir } from './profiles.js';
import { initWorkspaceDir, clearWorkspaceDir } from './workspace/index.js';
import { initRemoteFileCache, clearRemoteFileCache } from './file-navigator/remote-file-cache.js';
import { TranscriptLogger } from './transcript/logger.js';
import { TranscriptStore } from './transcript/store.js';

// The per-subsystem init/clear pairs of the state directory, in the order `boot()` established.
// Everything that owns state under `.janissary/` has exactly one entry here, so wiring a new
// subsystem in with its init cannot forget its clear. The `always` entries are the ones whose
// clear keeps running even on a relaunch (see `clearStateDirectories`).
export type StateDirectoryEntry = {
  name: string;
  init: (projectDir: string, packageRoot: string) => void;
  clear?: () => void;
  always?: boolean;
};

export const STATE_DIRECTORY_ENTRIES = [
  {
    name: 'agentState',
    init: (projectDir: string): void => { initAgentStateDirectory(projectDir); },
    clear: (): void => { clearStateDirectory(); },
    always: false,
  },
  {
    name: 'harnessCapture',
    init: (projectDir: string): void => { initHarnessCaptureDirectory(projectDir); },
    clear: (): void => { clearCaptureDirectory(); },
    always: false,
  },
  {
    name: 'harnessRecording',
    init: (projectDir: string): void => { initHarnessRecordingDirectory(projectDir); },
    clear: (): void => { clearHarnessRecordingDirectory(); },
    always: false,
  },
  {
    name: 'harnessTranscript',
    init: (projectDir: string): void => { initHarnessTranscriptDirectory(projectDir); },
    clear: (): void => { clearHarnessTranscriptDirectory(); },
    always: false,
  },
  {
    name: 'browserLog',
    init: (projectDir: string): void => { initBrowserLogDirectory(projectDir); },
    clear: (): void => { clearBrowserLogDirectory(); },
    always: false,
  },
  {
    name: 'globalHistory',
    init: (_projectDir: string): void => { initGlobalHistory(); },
    always: false,
  },
  {
    name: 'connections',
    init: (projectDir: string): void => { initDbDir(projectDir); },
    always: false,
  },
  {
    name: 'profiles',
    init: (projectDir: string, packageRoot: string): void => { initProfileDir(projectDir, packageRoot); },
    always: false,
  },
  {
    name: 'workspace',
    init: (projectDir: string): void => { initWorkspaceDir(projectDir); },
    clear: (): void => { clearWorkspaceDir(); },
    always: false,
  },
  {
    name: 'remoteFileCache',
    init: (projectDir: string): void => { initRemoteFileCache(projectDir); },
    clear: (): void => { clearRemoteFileCache(); },
    always: true,
  },
  {
    name: 'transcriptLog',
    init: (projectDir: string): void => { new TranscriptLogger(projectDir); },
    always: false,
  },
  {
    name: 'transcriptStore',
    init: (projectDir: string): void => { new TranscriptStore(projectDir); },
    clear: (): void => { TranscriptStore.clear(); },
    always: false,
  },
] as const satisfies readonly StateDirectoryEntry[];

// The subsystem keys the registry must cover: a new entry without a key here fails the
// completeness assignment below, and a key whose entry has been dropped fails symmetrically —
// the compiler names both.
export const KNOWN_STATE_DIRECTORY_KEYS = [
  'agentState', 'harnessCapture', 'harnessRecording', 'harnessTranscript',
  'browserLog', 'globalHistory', 'connections', 'profiles', 'workspace',
  'remoteFileCache', 'transcriptLog', 'transcriptStore',
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

// What a fresh (non-relaunch) start clears away: every entry with a clear, except the `always`
// ones, which run regardless of the launch kind (a relaunch still owns its file cache).
export function clearStateDirectories(relaunch: boolean): void {
  const entries: readonly StateDirectoryEntry[] = STATE_DIRECTORY_ENTRIES;
  for (const entry of entries) {
    if (!entry.clear) continue;
    if (!entry.always && relaunch) continue;
    entry.clear();
  }
}
