import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { TaskRow } from './types.js';

// Depth-first walk of one directory: returns its entries (files and subdirectories, recursed
// into) as a flat, pre-order `TaskRow[]` — a directory row immediately followed by its children,
// so the array is already in display order. Sorted alphabetically within each directory.
function walk(dir: string, relativeDir: string, depth: number): TaskRow[] {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() || (dirent.isFile() && dirent.name.endsWith('.md')))
    .toSorted((a, b) => a.name.localeCompare(b.name));

  const rows: TaskRow[] = [];
  for (const dirent of entries) {
    const relPath = relativeDir ? `${relativeDir}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      rows.push(
        { path: relPath, name: dirent.name, depth, dir: true },
        ...walk(path.join(dir, dirent.name), relPath, depth + 1),
      );
    } else {
      rows.push({ path: relPath, name: dirent.name, depth, dir: false });
    }
  }
  return rows;
}

// Executable task prompts: markdown files under `ai/tasks/` (`build-a-feature.md`,
// `fix-a-small-issue.md`, …), recursed into any subdirectory. The `.md` extension is kept in
// `path`: the picker inserts `execute ./ai/tasks/<path>` verbatim.
export function listTasks(root: string = process.cwd()): TaskRow[] {
  try {
    return walk(path.join(root, 'ai', 'tasks'), '', 0);
  } catch {
    return [];
  }
}
