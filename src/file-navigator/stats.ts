import { lstatSync } from 'node:fs';
import type { FileNavigatorDetail, FileNavigatorRow } from '../tab/types.js';

// One cached stat result: only the three values a row can display, so the cache holds no more of
// the `Stats` object than the tree needs.
export type RowStat = { size: number; modified: number; mode: number };

// The slice of `FilesTabState` this module needs, declared structurally so `rebuild.ts` can pass
// its own narrower state type without either module importing the other's.
type StattableState = {
  details: FileNavigatorDetail;
  stats: Map<string, RowStat | null>;
};

// `lstat`, not `stat`: the tree renders a symlink as a leaf file, so a link's own size and mode are
// what the row describes, and a broken link caches as a miss instead of throwing.
export function readRowStat(absPath: string): RowStat | null {
  try {
    const stat = lstatSync(absPath);
    return { size: stat.size, modified: stat.mtimeMs, mode: stat.mode };
  } catch {
    return null;
  }
}

// Attaches the stat values the tab's current detail mode needs to each row, from the cache alone.
// Filling the cache is the tab's filesystem port's job (`fillStats` in `filesystem-cache.ts`), so a
// remote tree is never described by whatever the local disk holds at the same relative path: a row
// whose stat has not arrived yet simply shows no detail until the rebuild its arrival triggers. A
// local tree's port answers synchronously, before this runs, so its rows are never caught without.
// In `name` mode the rows are returned untouched. The `..` row is skipped — it points outside the
// tree and shows no detail in any mode.
export function markStats(state: StattableState, rows: FileNavigatorRow[]): FileNavigatorRow[] {
  if (state.details === 'name') return rows;
  return rows.map((row) => {
    if (row.path === '..') return row;
    const stat = state.stats.get(row.path);
    if (!stat) return row;
    if (state.details === 'size') return row.dir ? row : { ...row, size: stat.size };
    if (state.details === 'modified') return { ...row, modified: stat.modified };
    return { ...row, mode: stat.mode };
  });
}
