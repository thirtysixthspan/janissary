import type { FileNavigatorRow } from '@shared/protocol';
import { dirname } from '../rel-path';

// The directory row matching a pending new-directory creation's guessed path, or undefined if it
// hasn't shown up yet (or a name collision meant the guess never matches — see
// `newDirectoryTargetPath`). Kept out of `FileNavigatorTab.tsx` to stay under the file-size limit.
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

// A tree-relative path made absolute against the navigator's root, which is what every command the
// navigator dispatches must send: a relative target would be resolved against the active tab's
// working directory instead — a workspaced agent's clone, say — rather than the tree being browsed.
function absoluteIn(absoluteRoot: string, relPath: string | null): string {
  const root = absoluteRoot.endsWith('/') ? absoluteRoot.slice(0, -1) : absoluteRoot;
  return relPath === null ? root : `${root}/${relPath}`;
}

// The `newfile` command target for a new `untitled.md` file, given the navigator's absolute root and
// the resolved target directory.
export function newFileCommand(absoluteRoot: string, targetDir: string | null): string {
  return `newfile ${absoluteIn(absoluteRoot, targetDir)}/untitled.md`;
}

// The tree-relative path a new `untitled` directory is expected to land at, given the resolved
// target directory. This is a guess, not a guarantee — a same-named collision at the target makes
// the server pick the next free name (`untitled-2`, …) instead, which this can't predict. Used
// both to build the `newdir` command and, client-side, to recognize the created row once it
// appears so the tree can select it and start an in-place rename.
export function newDirectoryTargetPath(targetDir: string | null): string {
  return targetDir === null ? 'untitled' : `${targetDir}/untitled`;
}

// The `newdir` command target for a new `untitled` directory, absolute against the navigator's root
// for the same reason `newFileCommand` is.
export function newDirectoryCommand(absoluteRoot: string, targetDir: string | null): string {
  return `newdir ${absoluteIn(absoluteRoot, newDirectoryTargetPath(targetDir))}`;
}
