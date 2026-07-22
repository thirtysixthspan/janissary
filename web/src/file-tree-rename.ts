// The containing directory of `path` — the empty string for a root-level entry, matching the
// root-as-empty-string convention already used in `file-tree-drag.ts`.
export function parentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export type RenameOutcome =
  | { type: 'noop' }
  | { type: 'rename'; newPath: string };

// Given the original tree-relative path and the raw edited name, decides whether the rename is a
// no-op (unchanged, empty, or whitespace-only name) or a real rename, computing the new relative
// path in the same directory. Kept out of the component/hook so it's unit-testable without
// rendering anything — mirrors `file-tree-drag.ts`'s pure helpers.
export function computeRename(originalPath: string, rawName: string): RenameOutcome {
  const trimmed = rawName.trim();
  const original = basename(originalPath);
  if (trimmed === '' || trimmed === original) return { type: 'noop' };
  const parent = parentPath(originalPath);
  const newPath = parent ? `${parent}/${trimmed}` : trimmed;
  return { type: 'rename', newPath };
}

// True if `newName` collides with a sibling already visible in the same directory (checked by
// name only, among the rows already loaded — the server re-verifies against disk before acting
// regardless, the same caveat as the drag-move flow's own collision check).
export function hasRenameCollision(newName: string, siblingNames: string[]): boolean {
  return siblingNames.includes(newName);
}

// The default text-selection range for the editable field: the basename without its extension for
// a file (so retyping the extension isn't required), or the whole name for a directory (which has
// no extension convention).
export function defaultRenameSelection(name: string, isDir: boolean): { start: number; end: number } {
  if (isDir) return { start: 0, end: name.length };
  const dot = name.lastIndexOf('.');
  return { start: 0, end: dot > 0 ? dot : name.length };
}
