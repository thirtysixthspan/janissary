import type { FileTreeRow } from '@shared/protocol';

export type DropTarget = { path: string; conflict: boolean } | null;

// True if `candidate` is `base` itself, or is nested inside it — mirrors the server-side check in
// `src/file-tree.ts`'s `isSameOrDescendantPath` (duplicated here since client and server code
// don't share a runtime module boundary).
function isSameOrDescendantPath(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}

// Given the current visible rows, the path being dragged, and the row path currently under the
// pointer (or null if the pointer isn't over any row), decides whether that row is a valid drop
// target: it must be a directory, must not be the dragged item itself, and must not be one of its
// own descendants. A valid target additionally reports whether it already has a child with the
// same name as the dragged item — checked by name only, and only among that child's rows that are
// already loaded (a collapsed directory's children aren't in `rows` at all, so a conflict inside
// one can't be detected client-side; the server re-verifies against disk before acting regardless).
export function resolveDropTarget(rows: FileTreeRow[], draggedPath: string, hoveredPath: string | null): DropTarget {
  if (hoveredPath === null || hoveredPath === '..') return null;
  const target = rows.find((r) => r.path === hoveredPath);
  if (!target?.dir) return null;
  if (isSameOrDescendantPath(target.path, draggedPath)) return null;
  const name = draggedPath.slice(draggedPath.lastIndexOf('/') + 1);
  const childPath = target.path ? `${target.path}/${name}` : name;
  const conflict = rows.some((r) => r.path === childPath);
  return { path: target.path, conflict };
}
