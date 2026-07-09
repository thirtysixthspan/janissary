import { readdirSync } from 'node:fs';
import path from 'node:path';

// Executable task prompts: markdown files directly under the top-level `ai/` directory
// (`build-a-feature.md`, `fix-a-small-issue.md`, …). Subdirectories like `ai/guidelines/` and
// `ai/personas/` are excluded — the `isFile()` check drops any directory entry without naming it.
// Kept to a single `readdirSync` (no per-file `statSync`) because it runs inside every state
// broadcast. Unlike `listPersonas`, the `.md` extension is kept: the picker inserts
// `execute ./ai/<name>` verbatim.
export function listTasks(root: string = process.cwd()): string[] {
  try {
    return readdirSync(path.join(root, 'ai'), { withFileTypes: true })
      .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.md'))
      .map((dirent) => dirent.name)
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
