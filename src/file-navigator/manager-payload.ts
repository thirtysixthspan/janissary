import { pruneAndBuildRows } from './rebuild.js';
import { buildCachedRows } from './filesystem-cache.js';
import type { FilesTabState } from './state.js';
import type { Tab } from '../tab/types.js';

// The two `files` payload writes `FileNavigatorManager` makes, kept here so the manager itself
// stays under the file-size limit — see `ai/guidelines/code-guidelines.md`. Both attach the tab's
// detail mode alongside its rows, so the client always knows which stat value to render.

// The payload for a tree whose awaited root has just appeared: real rows in place of the waiting
// state, still without git metadata, which `refreshGit` fills in on its own pass.
export function writeCreatedPayload(tab: Tab, state: FilesTabState, absDir: string, onReady: () => void): void {
  tab.files = {
    root: absDir,
    absoluteRoot: absDir,
    rows: buildCachedRows(state, onReady),
    details: state.details,
    remote: state.remote,
  };
}

// The payload for an ordinary rebuild: the pruned, git-marked, stat-marked row list plus the
// branch, GitHub URL, and pending restore hint the tab is currently carrying.
export function writeRebuiltPayload(tab: Tab, state: FilesTabState, onReady: () => void): void {
  const rows = pruneAndBuildRows(state, onReady);
  tab.files = {
    root: state.root,
    absoluteRoot: state.root,
    rows,
    ...(state.listingLoads.has('') && { waitingFor: state.root }),
    branch: state.branch,
    githubUrl: state.githubUrl,
    restore: state.restore,
    details: state.details,
    remote: state.remote,
  };
}
