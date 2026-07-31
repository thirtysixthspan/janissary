import type { FSWatcher } from 'node:fs';
import type { GitFileStatus } from '../git-status.js';
import type { HistoryStep } from './moves.js';
import type { TreeRestoreHint } from './restore.js';

// Per files-tab state, keyed by the tab's label. `watchers` is keyed by each visible directory's
// tree-relative path ('' for the root itself). `undoStack`/`redoStack` are purely in-memory and
// reset with the rest of the tab's state on close. Declared here rather than in manager.ts so the
// half-dozen modules the manager delegates to can name it without importing the manager itself.
export type FilesTabState = {
  root: string;
  expanded: Set<string>;
  watchers: Map<string, FSWatcher>;
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
  // The most recent selection hint applied by `restoreView`, copied onto every payload the tab
  // rebuilds. Its `revision` changes only when a new restore is applied, which is what stops the
  // repeated full-state broadcasts from re-applying an old hint over a selection the user has
  // since changed.
  restore?: TreeRestoreHint;
};
