import { lstatSync } from 'node:fs';
import path from 'node:path';
import type { FileNavigatorDetail, FileNavigatorRow } from '../tab/types.js';

// One cached stat result: only the three values a row can display, so the cache holds no more of
// the `Stats` object than the tree needs.
export type RowStat = { size: number; modified: number; mode: number };

// The slice of `FilesTabState` this module needs, declared structurally so `rebuild.ts` can pass
// its own narrower state type without either module importing the other's.
type StattableState = {
  root: string;
  details: FileNavigatorDetail;
  stats: Map<string, RowStat | null>;
};

// `lstat`, not `stat`: the tree renders a symlink as a leaf file, so a link's own size and mode are
// what the row describes, and a broken link caches as a miss instead of throwing.
function readStat(absPath: string): RowStat | null {
  try {
    const stat = lstatSync(absPath);
    return { size: stat.size, modified: stat.mtimeMs, mode: stat.mode };
  } catch {
    return null;
  }
}

// Attaches the stat values the tab's current detail mode needs to each row, `lstat`-ing only paths
// missing from the cache. In `name` mode the rows are returned untouched and nothing is stat'd at
// all. The `..` row is skipped — it points outside the tree and shows no detail in any mode.
export function markStats(state: StattableState, rows: FileNavigatorRow[]): FileNavigatorRow[] {
  if (state.details === 'name') return rows;
  return rows.map((row) => {
    if (row.path === '..') return row;
    let stat = state.stats.get(row.path);
    if (stat === undefined) {
      stat = readStat(path.join(state.root, row.path));
      state.stats.set(row.path, stat);
    }
    if (!stat) return row;
    if (state.details === 'size') return row.dir ? row : { ...row, size: stat.size };
    if (state.details === 'modified') return { ...row, modified: stat.modified };
    return { ...row, mode: stat.mode };
  });
}
