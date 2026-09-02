import { existsSync, mkdirSync, renameSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { execSync, execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let workspaceBaseDir = '';
let workspaceClaudeConfig = '';

export function initWorkspaceDir(
  projectDir: string,
  claudeJson: string = path.join(homedir(), '.claude.json'),
): void {
  workspaceBaseDir = path.join(projectDir, '.janissary', 'workspace');
  workspaceClaudeConfig = claudeJson;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readClaudeConfig(claudeJson: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(claudeJson, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse Claude configuration at ${claudeJson}.`, { cause: error });
  }
  if (!isRecord(parsed)) throw new Error(`Claude configuration at ${claudeJson} is not an object.`);
  return parsed;
}

function writeJsonAtomically(file: string, data: Record<string, unknown>): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function trustWorkspace(
  workspaceDir: string,
  claudeJson: string = path.join(homedir(), '.claude.json'),
): void {
  const data = readClaudeConfig(claudeJson);
  const existingProjects = data['projects'];
  if (existingProjects !== undefined && !isRecord(existingProjects)) {
    throw new Error(`Claude configuration projects at ${claudeJson} is not an object.`);
  }
  const projects = existingProjects ?? {};
  const existingWorkspace = projects[workspaceDir];
  if (existingWorkspace !== undefined && !isRecord(existingWorkspace)) {
    throw new Error(`Claude configuration project ${workspaceDir} is not an object.`);
  }
  projects[workspaceDir] = { ...existingWorkspace, hasTrustDialogAccepted: true };
  data['projects'] = projects;
  writeJsonAtomically(claudeJson, data);
}

// The workspace's private scratch dir, a sibling of the clone (`<name>.tmp`) — exported as
// `TMPDIR` for a sandboxed workspace so scratch writes don't need to share global `/tmp` across
// agents (see `src/sandbox/index.ts`).
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
  // authenticate there — only HTTPS + the injected `GH_TOKEN` can (see src/sandbox/index.ts).
  await execFileAsync('git', ['remote', 'set-url', 'origin', toHttpsUrl(remoteUrl)], { cwd: target });
  // Local-only credential helper (never touches global git config) — `gh auth git-credential`
  // checks `GH_TOKEN` in its environment before falling back to its keychain-stored OAuth token,
  // so once the sandbox injects `GH_TOKEN` (see src/sandbox/index.ts), `git push` authenticates via it.
  //
  // Reset the inherited helper list before adding ours: git accumulates `credential.helper` across
  // the system, global, and local scopes and the *first* helper to answer a query wins, so a
  // system/global `osxkeychain` entry (the macOS default, commonly holding a since-revoked token
  // `gh` stored on an earlier login) answers first and `gh` is never consulted — the push fails
  // with a 403 even though `GH_TOKEN` is present and valid. Setting the key to the empty string
  // clears the accumulated list for this repo only; the `--add` below then makes `gh` the sole
  // helper. Both scoping and ordering matter here: `--replace-all` on its own would only replace
  // the local scope's own entries, leaving the inherited ones ahead of us.
  await execFileAsync('git', ['config', '--local', '--replace-all', 'credential.helper', ''], { cwd: target });
  await execFileAsync('git', ['config', '--local', '--add', 'credential.helper', '!gh auth git-credential'], { cwd: target });
  trustWorkspace(target, workspaceClaudeConfig);
  mkdirSync(workspaceTempPath(name), { recursive: true });
}

export function untrustWorkspace(
  workspaceDir: string,
  claudeJson: string = path.join(homedir(), '.claude.json'),
): void {
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
