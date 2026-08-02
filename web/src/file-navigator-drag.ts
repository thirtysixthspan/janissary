import type { FileNavigatorRow } from '@shared/protocol';
import { basename, dirname } from './rel-path';

export type DropTarget = { path: string; conflict: boolean } | null;

// True if `candidate` is `base` itself, or is nested inside it — mirrors the server-side check in
// `src/file-navigator/index.ts`'s `isSameOrDescendantPath` (duplicated here since client and server code
// don't share a runtime module boundary).
function isSameOrDescendantPath(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}

// The containing directory of `path` — the empty string for a root-level entry, matching the
// root-as-empty-string convention already used for the conflict-path check below.
export function parentPath(path: string): string {
  return dirname(path);
}

// Given the current visible rows, the path being dragged, and the row path currently under the
// pointer (or null if the pointer isn't over any row), decides which directory is the valid drop
// target: hovering a directory row targets that directory directly; hovering a file row targets
// that file's containing directory instead, so releasing over any row inside a directory — not
// just the directory's own row — moves the dragged item into it. A target must not be the dragged
// item itself, must not be one of its own descendants, and must not be the item's own current
// parent (dropping a row back onto the directory it already lives in is a no-op, not a move). A
// valid target additionally reports
// whether it already has a child with the same name as the dragged item — checked by name only,
// and only among that child's rows that are already loaded (a collapsed directory's children
// aren't in `rows` at all, so a conflict inside one can't be detected client-side; the server
// re-verifies against disk before acting regardless).
export function resolveDropTarget(
  rows: FileNavigatorRow[],
  draggedPaths: string | string[],
  hoveredPath: string | null,
): DropTarget {
  if (hoveredPath === null || hoveredPath === '..') return null;
  const sources = typeof draggedPaths === 'string' ? [draggedPaths] : draggedPaths;
  const hovered = rows.find((r) => r.path === hoveredPath);
  if (!hovered) return null;
  const targetPath = hovered.dir ? hovered.path : parentPath(hovered.path);
  if (sources.some((source) => isSameOrDescendantPath(targetPath, source))) return null;
  const sourcePaths = sources.filter((source) => targetPath !== parentPath(source));
  if (sourcePaths.length === 0) return null;
  const conflict = sourcePaths.some((source) => {
    const name = basename(source);
    const childPath = targetPath ? `${targetPath}/${name}` : name;
    return rows.some((row) => row.path === childPath);
  });
  return { path: targetPath, conflict };
}
