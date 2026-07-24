import type { FileTreeRow } from '@shared/protocol';

// The directory row matching a pending new-directory creation's guessed path, or undefined if it
// hasn't shown up yet (or a name collision meant the guess never matches — see
// `newDirectoryTargetPath`). Kept out of `FileNavigatorTab.tsx` to stay under the file-size limit.
export function findPendingNewDir(rows: FileTreeRow[], pendingNewDir: string | null): FileTreeRow | undefined {
  if (pendingNewDir === null) return undefined;
  return rows.find((r) => r.path === pendingNewDir && r.dir);
}

// The target directory for a new file, computed from the file tree's selected row (the keyboard
// cursor): a selected directory row creates inside that directory; a selected file row creates in
// its containing directory; no selection (or the ".." row) creates at the tree root. Kept out of
// the component so `FileNavigatorTab.tsx` stays under the file-size limit.
export function newFileTargetDir(rows: FileTreeRow[], selected: string | null): string | null {
  if (selected === null || selected === '..') return null;
  const row = rows.find((r) => r.path === selected);
  if (!row) return null;
  if (row.dir) return row.path;
  const lastSlash = row.path.lastIndexOf('/');
  return lastSlash === -1 ? null : row.path.slice(0, lastSlash);
}

// The `newfile` command target for a new `untitled.md` file, given the resolved target directory.
export function newFileCommand(targetDir: string | null): string {
  return targetDir === null ? 'newfile untitled.md' : `newfile ${targetDir}/untitled.md`;
}

// The tree-relative path a new `untitled` directory is expected to land at, given the resolved
// target directory. This is a guess, not a guarantee — a same-named collision at the target makes
// the server pick the next free name (`untitled-2`, …) instead, which this can't predict. Used
// both to build the `newdir` command and, client-side, to recognize the created row once it
// appears so the tree can select it and start an in-place rename.
export function newDirectoryTargetPath(targetDir: string | null): string {
  return targetDir === null ? 'untitled' : `${targetDir}/untitled`;
}

// The `newdir` command target for a new `untitled` directory.
export function newDirectoryCommand(targetDir: string | null): string {
  return `newdir ${newDirectoryTargetPath(targetDir)}`;
}
