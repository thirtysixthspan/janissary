import { buildRows } from './index.js';
import { pruneAndBuildRows } from './rebuild.js';
import { markStats } from './stats.js';
import type { FilesTabState } from './state.js';
import type { Tab } from '../types.js';

// The two `files` payload writes `FileNavigatorManager` makes, kept here so the manager itself
// stays under the file-size limit — see `ai/guidelines/code-guidelines.md`. Both attach the tab's
// detail mode alongside its rows, so the client always knows which stat value to render, and both
// pass through the Git-sync status the manager refreshed just before calling in.

// The payload for a tree whose awaited root has just appeared: real rows in place of the waiting
// state, still without git metadata, which `refreshGit` fills in on its own pass.
export function writeCreatedPayload(tab: Tab, state: FilesTabState, absDir: string): void {
  tab.files = {
    root: absDir,
    absoluteRoot: absDir,
    rows: markStats(state, buildRows(absDir, state.expanded)),
    sync: state.sync,
    details: state.details,
  };
}

// The payload for an ordinary rebuild: the pruned, git-marked, stat-marked row list plus the
// branch, GitHub URL, and pending restore hint the tab is currently carrying.
export function writeRebuiltPayload(tab: Tab, state: FilesTabState): void {
  tab.files = {
    root: state.root,
    absoluteRoot: state.root,
    rows: pruneAndBuildRows(state),
    branch: state.branch,
    githubUrl: state.githubUrl,
    sync: state.sync,
    restore: state.restore,
    details: state.details,
  };
}
