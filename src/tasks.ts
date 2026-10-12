import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { janissaryRoot } from './janissary-root.js';
import type { TaskRow } from './tab/types.js';

// Depth-first walk of one directory: returns its entries (files and subdirectories, recursed
// into) as a flat, pre-order `TaskRow[]` — a directory row immediately followed by its children,
// so the array is already in display order. Within each directory the task files come first and
// the subdirectories last, each group sorted alphabetically. Every row is stamped with `source`
// so the client can group and route it.
function walk(dir: string, relativeDir: string, depth: number, source: TaskRow['source']): TaskRow[] {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() || (dirent.isFile() && dirent.name.endsWith('.md')))
    .toSorted((a, b) => (
      a.isDirectory() === b.isDirectory()
        ? a.name.localeCompare(b.name)
        : Number(a.isDirectory()) - Number(b.isDirectory())
    ));

  const rows: TaskRow[] = [];
  for (const dirent of entries) {
    const relPath = relativeDir ? `${relativeDir}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      rows.push(
        { path: relPath, name: dirent.name, depth, dir: true, source },
        ...walk(path.join(dir, dirent.name), relPath, depth + 1, source),
      );
    } else {
      rows.push({ path: relPath, name: dirent.name, depth, dir: false, source });
    }
  }
  return rows;
}

// The `ai/tasks` rows under one root, or `[]` when the directory is absent.
function listOne(root: string, source: TaskRow['source'], strict: boolean): TaskRow[] {
  const tasksDir = path.join(root, 'ai', 'tasks');
  if (strict) {
    try {
      statSync(tasksDir);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    return walk(tasksDir, '', 0, source);
  }
  if (!existsSync(tasksDir)) return [];
  try {
    return walk(tasksDir, '', 0, source);
  } catch {
    return [];
  }
}

export function listTasksFromRoot(root: string, source: TaskRow['source'], strict = false): TaskRow[] {
  return listOne(root, source, strict);
}

// Executable task prompts: markdown files under `ai/tasks/` (`feature/build-a-feature.md`,
// `fix-a-small-issue.md`, …), recursed into any subdirectory. The `.md` extension is kept in
// `path`. Tasks are drawn from two roots — the project working directory and the Janissary install
// — tagged with their `source`. When the same relative `path` exists in both, the project copy
// wins and the built-in copy is dropped; project rows are listed before Janissary rows.
export function listTasks(projectDir: string = process.cwd(), janissaryDir: string = janissaryRoot(), strict = false): TaskRow[] {
  const project = listOne(projectDir, 'project', strict);
  const projectFiles = new Set(project.filter((row) => !row.dir).map((row) => row.path));
  const builtInRows = listOne(janissaryDir, 'janissary', strict);
  const janissaryFiles = builtInRows.filter((row) => !row.dir && !projectFiles.has(row.path));
  const janissaryPaths = new Set<string>();
  for (const file of janissaryFiles) {
    janissaryPaths.add(file.path);
    let ancestor = path.posix.dirname(file.path);
    while (ancestor !== '.') {
      janissaryPaths.add(ancestor);
      ancestor = path.posix.dirname(ancestor);
    }
  }
  const janissary = builtInRows.filter((row) => janissaryPaths.has(row.path));
  return [...project, ...janissary];
}
