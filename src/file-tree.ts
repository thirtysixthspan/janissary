import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { FileTreeRow } from './types.js';

// VS Code's `files.exclude` defaults. Other dotfiles are shown.
const EXCLUDES = new Set(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db']);

type Entry = { name: string; dir: boolean };

// One directory's sorted, filtered entries: directories first, then files, `localeCompare`
// case-insensitive within each group. A symlink (file or directory) reports as a file — never
// expandable — which is the cheap way to stay cycle-proof. An unreadable directory (permission
// denied, deleted mid-read) yields [].
export function readDirSorted(absDir: string): Entry[] {
  let dirents;
  try {
    dirents = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries = dirents
    .filter((d) => !EXCLUDES.has(d.name))
    .map((d) => ({ name: d.name, dir: d.isDirectory() }));
  return entries.toSorted((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

// A depth-first, pre-flattened list of the currently *visible* rows: the root's direct children,
// plus — for each directory whose path is in `expanded` — that directory's children too, and so
// on. Children are read from disk only for expanded directories. An `expanded` entry for a path
// that no longer exists (or isn't found under its parent) is simply never reached, so it's
// naturally skipped rather than needing special-case pruning here.
export function buildRows(root: string, expanded: Set<string>): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  const walk = (absDir: string, relDir: string, depth: number): void => {
    for (const entry of readDirSorted(absDir)) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const isExpanded = entry.dir && expanded.has(relPath);
      rows.push({
        path: relPath, name: entry.name, depth, dir: entry.dir,
        ...(entry.dir && { expanded: isExpanded }),
      });
      if (isExpanded) walk(path.join(absDir, entry.name), relPath, depth + 1);
    }
  };
  walk(root, '', 0);
  if (path.dirname(root) !== root) {
    rows.unshift({ path: '..', name: '..', depth: 0, dir: true });
  }
  return rows;
}
