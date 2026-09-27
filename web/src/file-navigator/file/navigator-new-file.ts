import type { FileNavigatorRow } from '@shared/protocol';
import { dirname } from '../../shared/rel-path';

// The directory row matching a pending new-directory creation's path — the one the server replied it
// created — or undefined if it hasn't shown up yet. Kept out of `FileNavigatorTab.tsx` to stay under
// the file-size limit.
export function findPendingNewDir(rows: FileNavigatorRow[], pendingNewDir: string | null): FileNavigatorRow | undefined {
  if (pendingNewDir === null) return undefined;
  return rows.find((r) => r.path === pendingNewDir && r.dir);
}

// The target directory for a new file, computed from the file navigator's selected row (the keyboard
// cursor): a selected directory row creates inside that directory; a selected file row creates in
// its containing directory; no selection (or the ".." row) creates at the tree root. Kept out of
// the component so `FileNavigatorTab.tsx` stays under the file-size limit.
export function newFileTargetDir(rows: FileNavigatorRow[], selected: string | null): string | null {
  if (selected === null || selected === '..') return null;
  const row = rows.find((r) => r.path === selected);
  if (!row) return null;
  if (row.dir) return row.path;
  return row.path.includes('/') ? dirname(row.path) : null;
}

// The tree-relative path a new `untitled` directory lands at when nothing already sits there, given
// the resolved target directory. A same-named collision makes the server pick the next free name
// (`untitled-2`, …) instead. Compared against the server's reply so only an un-collided creation is
// auto-selected and put into an in-place rename.
export function newDirectoryTargetPath(targetDir: string | null): string {
  return targetDir === null ? 'untitled' : `${targetDir}/untitled`;
}
