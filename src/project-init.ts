import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// The `ai/` and `product/` directory tree this tool's task/backlog/plan/spec workflow expects,
// as documented in the Project Structure section of the target repo's own `CLAUDE.md`.
const SCAFFOLD_DIRS = [
  'ai/guidelines',
  'ai/personas',
  'ai/tasks',
  'product/backlog',
  'product/plans/draft',
  'product/plans/ready',
  'product/plans/complete',
  'product/plans/deferred',
  'product/specs',
];

// `janus init [<project-dir>]`: create the standard `ai/`/`product/` scaffold recursively, and
// drop a `.gitkeep` in every directory that is still empty afterward so git tracks it. Idempotent
// — safe to run against a directory that already has some or all of the scaffold in place.
export function scaffoldProject(projectDir: string): string[] {
  for (const dir of SCAFFOLD_DIRS) {
    mkdirSync(path.join(projectDir, dir), { recursive: true });
  }
  for (const dir of SCAFFOLD_DIRS) {
    const absolute = path.join(projectDir, dir);
    if (readdirSync(absolute).length === 0) {
      writeFileSync(path.join(absolute, '.gitkeep'), '');
    }
  }
  return SCAFFOLD_DIRS;
}
