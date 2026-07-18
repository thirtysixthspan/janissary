import type { FileTreeRow } from '@shared/protocol';

// The target directory for a new file, computed from the file tree's selected row (the keyboard
// cursor): a selected directory row creates inside that directory; a selected file row creates in
// its containing directory; no selection (or the ".." row) creates at the tree root. Kept out of
// the component so `FileTreeTab.tsx` stays under the file-size limit.
export function newFileTargetDir(rows: FileTreeRow[], selected: string | null): string | null {
  if (selected === null || selected === '..') return null;
  const row = rows.find((r) => r.path === selected);
  if (!row) return null;
  if (row.dir) return row.path;
  const lastSlash = row.path.lastIndexOf('/');
  return lastSlash === -1 ? null : row.path.slice(0, lastSlash);
}

// The `edit` command target for a new `untitled.md` file, given the resolved target directory.
export function newFileCommand(targetDir: string | null): string {
  return targetDir === null ? 'edit untitled.md' : `edit ${targetDir}/untitled.md`;
}
