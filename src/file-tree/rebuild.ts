import { statSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { buildRows, markGitStatus } from './index.js';
import { unwatchDir } from './watch.js';
import type { FileTreeRow } from '../types.js';
import type { GitFileStatus } from '../git-status.js';

type RebuildableState = {
  root: string;
  expanded: Set<string>;
  gitStatuses?: Map<string, GitFileStatus>;
  watchers: Map<string, FSWatcher>;
};

// Prunes expanded directories that no longer exist on disk (closing their watchers) and returns
// the current visible row list for `state.root`, with git status marked.
export function pruneAndBuildRows(state: RebuildableState): FileTreeRow[] {
  for (const relPath of state.expanded) {
    let stillDir: boolean;
    try { stillDir = statSync(path.join(state.root, relPath)).isDirectory(); } catch { stillDir = false; }
    if (!stillDir) { state.expanded.delete(relPath); unwatchDir(state, relPath); }
  }
  return markGitStatus(buildRows(state.root, state.expanded), state.gitStatuses ?? new Map());
}
