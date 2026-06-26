import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let workspaceBaseDir = '';

export function initWorkspaceDir(projectDir: string): void {
  workspaceBaseDir = path.join(projectDir, '.janissary', 'workspace');
}

export function ensureWorkspaceDir(): void {
  mkdirSync(workspaceBaseDir, { recursive: true });
}

export function workspacePath(name: string): string {
  if (!workspaceBaseDir) throw new Error('Workspace dir not initialized. Call initWorkspaceDir first.');
  return path.join(workspaceBaseDir, name);
}

export function findRepoRoot(from: string): string | undefined {
  let directory = from;
  while (true) {
    if (existsSync(path.join(directory, '.git'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

export function createWorkspace(name: string, repoPath: string): string {
  ensureWorkspaceDir();
  const target = workspacePath(name);
  execSync(`git clone --shared "${repoPath}" "${target}"`, { stdio: 'pipe' });
  return target;
}

export function removeWorkspace(directory: string): void {
  try { rmSync(directory, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function clearWorkspaceDir(): void {
  if (!workspaceBaseDir) return;
  try {
    const entries = readdirSync(workspaceBaseDir);
    for (const entry of entries) {
      rmSync(path.join(workspaceBaseDir, entry), { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}
