import { copyFileSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
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

// The backlog files documented in `CLAUDE.md`'s Project Structure section, each seeded with the
// standard empty `ready`/`development`/`deferred`/`declined` structure.
const BACKLOG_FILES = ['bugs', 'chores', 'documentation', 'features', 'issues', 'technical-debt'];
const CONFIG_DIRS = ['.codex', '.claude'];

function backlogFileContent(name: string): string {
  return `# ${name}\n\n## ready\n\n## development\n\n## deferred\n\n## declined\n`;
}

function installConfigDirectory(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  const entries = readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      installConfigDirectory(sourcePath, destinationPath);
    } else {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

// `janus init [<project-dir>]`: create the standard `ai/`/`product/` scaffold recursively, seed
// `product/backlog/` with the standard backlog files, and drop a `.gitkeep` in every directory
// that is still empty afterward so git tracks it. Idempotent — safe to run against a directory
// that already has some or all of the scaffold in place; never overwrites an existing backlog file.
export function scaffoldProject(projectDir: string): string[] {
  for (const dir of SCAFFOLD_DIRS) {
    mkdirSync(path.join(projectDir, dir), { recursive: true });
  }
  for (const name of BACKLOG_FILES) {
    const filePath = path.join(projectDir, 'product/backlog', `${name}.md`);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, backlogFileContent(name));
    }
  }
  for (const configDir of CONFIG_DIRS) {
    installConfigDirectory(
      path.join(import.meta.dirname, '..', configDir),
      path.join(projectDir, configDir),
    );
  }
  for (const dir of SCAFFOLD_DIRS) {
    const absolute = path.join(projectDir, dir);
    if (readdirSync(absolute).length === 0) {
      writeFileSync(path.join(absolute, '.gitkeep'), '');
    }
  }
  return SCAFFOLD_DIRS;
}
