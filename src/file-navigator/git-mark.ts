import type { FileNavigatorRow } from '../types.js';
import type { GitFileStatus } from '../git-status.js';

// Row git-status annotation, split out of index.ts: a distinct concern from the tree-building
// functions (readDirSorted, buildRows, etc.) that remain there.

// Aggregation priority when a directory row picks up the state of the highest-priority descendant.
const PRIORITY: Record<GitFileStatus, number> = { conflict: 2, staged: 1, changed: 0 };

// Return `rows` with `gitStatus` set on every row git considers changed: a file row takes its own
// `path`'s status from `statuses`; a directory row takes the highest-priority status (conflict >
// staged > changed) found among the changed paths nested beneath it (a prefix check, `path` starts
// with `${row.path}/`). Propagation is purely this flat-map prefix scan — no directory is re-read,
// so a collapsed directory still colors when something deep inside it changed. Rows with no match
// are returned as-is; an empty `statuses` map marks nothing.
export function markGitStatus(rows: FileNavigatorRow[], statuses: Map<string, GitFileStatus>): FileNavigatorRow[] {
  if (statuses.size === 0) return rows;
  return rows.map((row) => {
    if (!row.dir) {
      const status = statuses.get(row.path);
      return status ? { ...row, gitStatus: status } : row;
    }
    let best: GitFileStatus | undefined;
    for (const [p, status] of statuses) {
      if (p.startsWith(`${row.path}/`) && (!best || PRIORITY[status] > PRIORITY[best])) best = status;
    }
    return best ? { ...row, gitStatus: best } : row;
  });
}
