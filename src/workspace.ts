import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { execSync, execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

// Handles `git@github.com:owner/repo.git` and `ssh://git@github.com/owner/repo.git`; an
// already-HTTPS URL passes through unchanged.
export function toHttpsUrl(url: string): string {
  const scpMatch = /^git@([^:]+):(.+?)(\.git)?$/.exec(url);
  if (scpMatch) return `https://${scpMatch[1]}/${scpMatch[2]}.git`;
  const sshMatch = /^ssh:\/\/git@([^/]+)\/(.+?)(\.git)?$/.exec(url);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}.git`;
  return url;
}

export type ProvisionHandle = {
  // The workspace's target directory — known up front, before the clone starts.
  dir: string;
  // Resolves once the clone and its follow-up setup have finished.
  ready: Promise<void>;
  // Kills the clone if it's still running. A no-op once the clone has already settled.
  cancel: () => void;
};

// Kick off a workspace clone asynchronously so it never blocks the event loop, unlike the old
// single synchronous `createWorkspace`. `remoteUrl` must already be resolved (via `getRemoteUrl`,
// which stays synchronous — see `WorkspaceManager.create`) since it's needed to even start the
// clone; only the slow parts (the clone itself, plus the setup that has to run after it) are
// asynchronous here. Exposes `cancel()` so a caller can kill an in-flight clone (e.g. the tab
// it belongs to was closed before it finished) instead of only being able to wait for it.
export function provisionWorkspace(name: string, remoteUrl: string): ProvisionHandle {
  ensureWorkspaceDir();
  const target = workspacePath(name);
  let cancelled = false;
  let child: ChildProcess | undefined;

  async function run(): Promise<void> {
    // Clone over whatever transport already works on the host (this runs unsandboxed, so SSH is
    // fine here) — intentional: user-driven workspace creation; only local-user commands reach
    // this sink. Run via `spawn` (no shell) rather than `execSync` so it doesn't block the event
    // loop and so the child process can be killed on cancel.
    child = spawn('git', ['clone', remoteUrl, target], { stdio: 'ignore' });
    const activeChild = child;
    const code = await new Promise<number | null>((resolve, reject) => {
      activeChild.on('error', reject);
      activeChild.on('exit', resolve);
    });
    if (cancelled) throw new Error('Workspace provisioning cancelled.');
    if (code !== 0) throw new Error(`git clone exited with code ${String(code)}`);
    await finishProvisioning(name, target, remoteUrl);
  }

  return {
    dir: target,
    ready: run(),
    cancel: () => { cancelled = true; child?.kill(); },
  };
}

async function finishProvisioning(name: string, target: string, remoteUrl: string): Promise<void> {
  // Rewrite the clone's own origin to HTTPS: later git operations from *inside* the workspace run
  // in the Seatbelt sandbox, which denies `~/.ssh` and scrubs `SSH_AUTH_SOCK`, so SSH can't
  // authenticate there — only HTTPS + the injected `GH_TOKEN` can (see sandbox.ts).
  await execFileAsync('git', ['remote', 'set-url', 'origin', toHttpsUrl(remoteUrl)], { cwd: target });
  // Local-only credential helper (never touches global git config) — `gh auth git-credential`
  // checks `GH_TOKEN` in its environment before falling back to its keychain-stored OAuth token,
  // so once the sandbox injects `GH_TOKEN` (see sandbox.ts), `git push` authenticates via it.
  await execFileAsync('git', ['config', '--local', 'credential.helper', '!gh auth git-credential'], { cwd: target });
  trustWorkspace(target);
  mkdirSync(workspaceTempPath(name), { recursive: true });
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
