import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { TaskRow } from './types.js';

// Depth-first walk of one directory: returns its entries (files and subdirectories, recursed
// into) as a flat, pre-order `TaskRow[]` — a directory row immediately followed by its children,
// so the array is already in display order. Sorted alphabetically within each directory. Every
// row is stamped with `source` so the client can group and route it.
function walk(dir: string, relativeDir: string, depth: number, source: TaskRow['source']): TaskRow[] {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() || (dirent.isFile() && dirent.name.endsWith('.md')))
    .toSorted((a, b) => a.name.localeCompare(b.name));

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
function listOne(root: string, source: TaskRow['source']): TaskRow[] {
  try {
    return walk(path.join(root, 'ai', 'tasks'), '', 0, source);
  } catch {
    return [];
  }
}

// The Janissary install root — the directory above the running code (mirroring `main.ts`'s
// `import.meta.dirname/..` pattern). Its `ai/` ships with the `janus` package.
export function janissaryRoot(): string {
  return path.join(import.meta.dirname, '..');
}

// Absolute path of the Janissary install's `ai/tasks` directory, carried to the client so it can
// build the `execute <dir>/<path>` command for a built-in task.
export function janissaryTasksDir(): string {
  return path.join(janissaryRoot(), 'ai', 'tasks');
}

// Executable task prompts: markdown files under `ai/tasks/` (`build-a-feature.md`,
// `fix-a-small-issue.md`, …), recursed into any subdirectory. The `.md` extension is kept in
// `path`. Tasks are drawn from two roots — the project working directory and the Janissary install
// — tagged with their `source`. When the same relative `path` exists in both, the project copy
// wins and the built-in copy is dropped; project rows are listed before Janissary rows.
export function listTasks(projectDir: string = process.cwd(), janissaryDir: string = janissaryRoot()): TaskRow[] {
  const project = listOne(projectDir, 'project');
  const projectPaths = new Set(project.map((row) => row.path));
  const janissary = listOne(janissaryDir, 'janissary').filter((row) => !projectPaths.has(row.path));
  return [...project, ...janissary];
}
