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

// SSH auth can't work inside the workspace's sandbox (no `~/.ssh`, no SSH agent socket — see
// `sandbox-profile.ts`), so a workspace clone always uses HTTPS regardless of the root repo's own
// remote style. Handles `git@github.com:owner/repo.git` and `ssh://git@github.com/owner/repo.git`;
// an already-HTTPS URL passes through unchanged.
export function toHttpsUrl(url: string): string {
  const scpMatch = /^git@([^:]+):(.+?)(\.git)?$/.exec(url);
  if (scpMatch) return `https://${scpMatch[1]}/${scpMatch[2]}.git`;
  const sshMatch = /^ssh:\/\/git@([^/]+)\/(.+?)(\.git)?$/.exec(url);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}.git`;
  return url;
}

export function createWorkspace(name: string, repoPath: string): string {
  ensureWorkspaceDir();
  const target = workspacePath(name);
  const remoteUrl = toHttpsUrl(getRemoteUrl(repoPath));
  // Intentional: user-driven workspace creation; only local-user commands reach this sink.
  execSync(`git clone "${remoteUrl}" "${target}"`, { stdio: 'pipe' });
  // Local-only credential helper (never touches global git config) — `gh auth git-credential`
  // checks `GH_TOKEN` in its environment before falling back to its keychain-stored OAuth token,
  // so once the sandbox injects `GH_TOKEN` (see sandbox.ts), `git push` authenticates via it.
  execSync('git config --local credential.helper "!gh auth git-credential"', { cwd: target, stdio: 'pipe' });
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
