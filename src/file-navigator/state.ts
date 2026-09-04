import type { GitFileStatus } from '../git-status.js';
import type { FileNavigatorDetail, FileNavigatorPullStatus, RemoteTarget } from '../tab/types.js';
import type { HistoryStep } from './moves.js';
import type { TreeRestoreHint } from './restore.js';
import type { RowStat } from './stats.js';
import type { FileNavigatorEntry } from './index.js';
import type { FileSystemPort, WatchHandle } from './filesystem-port.js';

// Per files-tab state, keyed by the tab's label. `watchers` is keyed by each visible directory's
// tree-relative path ('' for the root itself). `undoStack`/`redoStack` are purely in-memory and
// reset with the rest of the tab's state on close. Declared here rather than in manager.ts so the
// half-dozen modules the manager delegates to can name it without importing the manager itself.
export type FilesTabState = {
  root: string;
  filesystem: FileSystemPort;
  remote?: RemoteTarget;
  remoteRoot?: string;
  ownerLabel?: string;
  expanded: Set<string>;
  watchers: Map<string, WatchHandle>;
  listings: Map<string, FileNavigatorEntry[]>;
  listingLoads: Set<string>;
  statLoads: Set<string>;
  debounce?: ReturnType<typeof setTimeout>;
  // Set while the tab is waiting for its root to be created (see `pollForCreation`); cleared once
  // the directory appears.
  pollTimer?: ReturnType<typeof setInterval>;
  undoStack: HistoryStep[];
  redoStack: HistoryStep[];
  // Last-computed map of git-changed, root-relative paths to their status (see `git-status.ts`).
  // Applied synchronously to every rebuild so interactive redraws are instant; recomputed
  // asynchronously by `refreshGit`. `gitRefreshing`/`gitRefreshStale` coalesce overlapping refresh
  // requests into at most one in-flight git call plus one queued follow-up.
  gitStatuses?: Map<string, GitFileStatus>;
  // Last-computed current git branch name (see `git-status.ts`), refreshed alongside `changed`.
  branch?: string;
  // Last-computed GitHub commits-page URL for the current origin/branch (see `github-url.ts`),
  // refreshed alongside `branch`. Undefined when there's no github.com origin remote.
  githubUrl?: string;
  gitRefreshing?: boolean;
  gitRefreshStale?: boolean;
  // What this tab's header pull button is signalling. `pulling` is also the coalescing check: a
  // second click while it is set is ignored rather than spawning an overlapping `git pull` that
  // would collide on git's own lockfiles. `pullFlash` is the timer returning a settled `pulled` or
  // `error` to the resting state (see `manager-pull.ts`).
  pull?: FileNavigatorPullStatus;
  pullFlash?: ReturnType<typeof setTimeout>;
  // The most recent selection hint applied by `restoreView`, copied onto every payload the tab
  // rebuilds. Its `revision` changes only when a new restore is applied, which is what stops the
  // repeated full-state broadcasts from re-applying an old hint over a selection the user has
  // since changed.
  restore?: TreeRestoreHint;
  // Which detail this tree shows to the right of each row name. Every tab starts at 'name', which
  // reproduces the display the navigator had before detail modes existed and stats nothing.
  details: FileNavigatorDetail;
  // Cached `lstat` results keyed by tree-relative path, filled lazily by `stats.ts` and emptied
  // wholesale by `scheduleRebuild` when a watcher fires — a path whose stat failed caches `null`,
  // so a broken symlink is not re-stat'd on every rebuild either.
  stats: Map<string, RowStat | null>;
};
