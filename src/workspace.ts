import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
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

export function trustWorkspace(workspaceDir: string): void {
  const claudeJson = path.join(homedir(), '.claude.json');
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(readFileSync(claudeJson, 'utf8')) as Record<string, unknown>;
  } catch { /* file absent or unparseable — start fresh */ }
  const projects = (data['projects'] ?? {}) as Record<string, Record<string, unknown>>;
  projects[workspaceDir] = { ...projects[workspaceDir], hasTrustDialogAccepted: true };
  data['projects'] = projects;
  writeFileSync(claudeJson, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// The workspace's private scratch dir, a sibling of the clone (`<name>.tmp`) — exported as
// `TMPDIR` for a sandboxed workspace so scratch writes don't need to share global `/tmp` across
// agents (see `sandbox.ts`).
export function workspaceTempPath(name: string): string {
  return `${workspacePath(name)}.tmp`;
}

export function getRemoteUrl(repoPath: string): string {
  // Intentional: user-driven workspace creation; only local-user commands reach this sink.
  const url = execSync('git remote get-url origin', { cwd: repoPath, stdio: 'pipe' }).toString().trim();
  if (!url) throw new Error(`No "origin" remote configured for ${repoPath}`);
  return url;
}

export function createWorkspace(name: string, repoPath: string): string {
  ensureWorkspaceDir();
  const target = workspacePath(name);
  const remoteUrl = getRemoteUrl(repoPath);
  // Intentional: user-driven workspace creation; only local-user commands reach this sink.
  execSync(`git clone "${remoteUrl}" "${target}"`, { stdio: 'pipe' });
  trustWorkspace(target);
  mkdirSync(workspaceTempPath(name), { recursive: true });
  return target;
}

export function untrustWorkspace(workspaceDir: string): void {
  const claudeJson = path.join(homedir(), '.claude.json');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(claudeJson, 'utf8')) as Record<string, unknown>;
  } catch { return; }
  const projects = data['projects'] as Record<string, unknown> | undefined;
  if (!projects || !Object.hasOwn(projects, workspaceDir)) return;
  delete projects[workspaceDir];
  writeFileSync(claudeJson, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function removeWorkspace(directory: string): void {
  untrustWorkspace(directory);
  try { rmSync(directory, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(`${directory}.tmp`, { recursive: true, force: true }); } catch { /* ignore */ }
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
