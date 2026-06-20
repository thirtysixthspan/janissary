import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

let workspaceBaseDir = '';

export function initWorkspaceDir(projectDir: string): void {
  workspaceBaseDir = join(projectDir, '.janussary', 'workspace');
}

export function ensureWorkspaceDir(): void {
  mkdirSync(workspaceBaseDir, { recursive: true });
}

export function workspacePath(name: string): string {
  if (!workspaceBaseDir) throw new Error('Workspace dir not initialized. Call initWorkspaceDir first.');
  return join(workspaceBaseDir, name);
}

export function findRepoRoot(from: string): string | null {
  let dir = from;
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function createWorkspace(name: string, repoPath: string): string {
  ensureWorkspaceDir();
  const target = workspacePath(name);
  execSync(`git clone --shared "${repoPath}" "${target}"`, { stdio: 'pipe' });
  return target;
}

export function removeWorkspace(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function clearWorkspaceDir(): void {
  if (!workspaceBaseDir) return;
  try {
    const entries = readdirSync(workspaceBaseDir);
    for (const entry of entries) {
      rmSync(join(workspaceBaseDir, entry), { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}
