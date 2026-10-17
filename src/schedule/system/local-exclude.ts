import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../atomic-write.js';

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function relativeTarget(worktree: string, projectRoot: string, target: string): string {
  const relative = path.relative(worktree, path.join(projectRoot, target)).split(path.sep).join('/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('System schedule paths must be inside the Git worktree');
  return relative;
}

function ignored(root: string, target: string): boolean {
  try {
    git(root, ['check-ignore', '--quiet', '--', target]);
    return true;
  } catch {
    return false;
  }
}

function tracked(root: string, target: string): boolean {
  return git(root, ['ls-files', '--', target]).length > 0;
}

export function ensureSystemScheduleExcluded(projectRoot: string): void {
  const stateDirectory = path.join(projectRoot, '.janissary');
  try {
    const stateStat = lstatSync(stateDirectory);
    if (stateStat.isSymbolicLink() || !stateStat.isDirectory()) throw new Error(`Unsafe .janissary path: ${stateDirectory}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let worktree: string;
  try {
    worktree = git(projectRoot, ['rev-parse', '--show-toplevel']);
  } catch {
    return;
  }
  worktree = path.resolve(projectRoot, worktree);
  const schedule = relativeTarget(worktree, projectRoot, '.janissary/system-schedules.json');
  const scripts = relativeTarget(worktree, projectRoot, '.janissary/scripts/');
  if (tracked(worktree, schedule) || tracked(worktree, scripts)) {
    throw new Error('System schedule storage is tracked by Git and cannot be safely excluded');
  }
  const missing = [schedule, scripts].filter((target) => !ignored(worktree, target));
  if (missing.length === 0) return;
  const excludePath = git(worktree, ['rev-parse', '--git-path', 'info/exclude']);
  const absoluteExclude = path.resolve(worktree, excludePath);
  let existing = '';
  try {
    const excludeStat = lstatSync(absoluteExclude);
    if (excludeStat.isSymbolicLink() || !excludeStat.isFile()) throw new Error(`Unsafe Git exclude file: ${absoluteExclude}`);
    existing = readFileSync(absoluteExclude, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const rules = missing.map((target) => `/${target}`);
  atomicWriteFile(absoluteExclude, `${existing}${separator}${rules.join('\n')}\n`);
  for (const target of missing) {
    if (!ignored(worktree, target)) throw new Error(`Git did not exclude system schedule path: ${target}`);
  }
}
