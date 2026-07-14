import type { FileTreeRow } from '@shared/protocol';

export type DropTarget = { path: string; conflict: boolean } | null;

// True if `candidate` is `base` itself, or is nested inside it — mirrors the server-side check in
// `src/file-tree.ts`'s `isSameOrDescendantPath` (duplicated here since client and server code
// don't share a runtime module boundary).
function isSameOrDescendantPath(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}

// The containing directory of `path` — the empty string for a root-level entry, matching the
// root-as-empty-string convention already used for the conflict-path check below.
function parentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

// Given the current visible rows, the path being dragged, and the row path currently under the
// pointer (or null if the pointer isn't over any row), decides which directory is the valid drop
// target: hovering a directory row targets that directory directly; hovering a file row targets
// that file's containing directory instead, so releasing over any row inside a directory — not
// just the directory's own row — moves the dragged item into it. A target must not be the dragged
// item itself and must not be one of its own descendants. A valid target additionally reports
// whether it already has a child with the same name as the dragged item — checked by name only,
// and only among that child's rows that are already loaded (a collapsed directory's children
// aren't in `rows` at all, so a conflict inside one can't be detected client-side; the server
// re-verifies against disk before acting regardless).
export function resolveDropTarget(rows: FileTreeRow[], draggedPath: string, hoveredPath: string | null): DropTarget {
  if (hoveredPath === null || ['..', draggedPath].includes(hoveredPath)) return null;
  const hovered = rows.find((r) => r.path === hoveredPath);
  if (!hovered) return null;
  const targetPath = hovered.dir ? hovered.path : parentPath(hovered.path);
  if (isSameOrDescendantPath(targetPath, draggedPath)) return null;
  const name = draggedPath.slice(draggedPath.lastIndexOf('/') + 1);
  const childPath = targetPath ? `${targetPath}/${name}` : name;
  const conflict = rows.some((r) => r.path === childPath);
  return { path: targetPath, conflict };
}
