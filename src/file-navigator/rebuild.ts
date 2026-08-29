import { markGitStatus } from './index.js';
import { pruneCachedRows } from './filesystem-cache.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorRow } from '../tab/types.js';

// Prunes expanded directories that no longer exist on disk (closing their watchers) and returns
// the current visible row list for `state.root`, with git status and detail stats marked.
export function pruneAndBuildRows(state: FilesTabState, onReady: () => void): FileNavigatorRow[] {
  return markGitStatus(pruneCachedRows(state, onReady), state.gitStatuses ?? new Map());
}
