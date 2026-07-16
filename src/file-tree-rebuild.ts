import { statSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { buildRows, markChanged } from './file-tree.js';
import { unwatchDir } from './file-tree-watch.js';
import type { FileTreeRow } from './types.js';

type RebuildableState = {
  root: string;
  expanded: Set<string>;
  changed?: Set<string>;
  watchers: Map<string, FSWatcher>;
};

// Prunes expanded directories that no longer exist on disk (closing their watchers) and returns
// the current visible row list for `state.root`, with git-changed paths marked.
export function pruneAndBuildRows(state: RebuildableState): FileTreeRow[] {
  for (const relPath of state.expanded) {
    let stillDir: boolean;
    try { stillDir = statSync(path.join(state.root, relPath)).isDirectory(); } catch { stillDir = false; }
    if (!stillDir) { state.expanded.delete(relPath); unwatchDir(state, relPath); }
  }
  return markChanged(buildRows(state.root, state.expanded), state.changed ?? new Set());
}
