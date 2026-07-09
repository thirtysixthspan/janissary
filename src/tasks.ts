import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { TaskRow } from './types.js';

// Directories directly under `ai/` that hold non-task content, not executable prompts:
// `guidelines/` (binding project docs) and `personas/` (monitor persona bodies). Excluded by
// name at the top level only — picking one would insert a nonsensical `execute ./ai/...` command.
const EXCLUDED_TOP_LEVEL_DIRS = new Set(['guidelines', 'personas']);

// Depth-first walk of one directory: returns its entries (files and subdirectories, recursed
// into) as a flat, pre-order `TaskRow[]` — a directory row immediately followed by its children,
// so the array is already in display order. Sorted alphabetically within each directory.
function walk(dir: string, relativeDir: string, depth: number): TaskRow[] {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => (dirent.isDirectory() && (depth > 0 || !EXCLUDED_TOP_LEVEL_DIRS.has(dirent.name)))
      || (dirent.isFile() && dirent.name.endsWith('.md')))
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

// Executable task prompts: markdown files under the top-level `ai/` directory
// (`build-a-feature.md`, `fix-a-small-issue.md`, …), recursed into any subdirectory except
// `ai/guidelines/` and `ai/personas/` (see `EXCLUDED_TOP_LEVEL_DIRS`). The `.md` extension is
// kept in `path`: the picker inserts `execute ./ai/<path>` verbatim.
export function listTasks(root: string = process.cwd()): TaskRow[] {
  try {
    return walk(path.join(root, 'ai'), '', 0);
  } catch {
    return [];
  }
}
