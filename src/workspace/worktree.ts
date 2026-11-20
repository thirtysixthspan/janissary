import { spawn, execFile, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  ensureWorkspaceDir, findRepoRoot, trustWorkspace, untrustWorkspace,
  workspaceClaudeConfigPath, workspacePath, type ProvisionHandle,
} from './index.js';
import { createWorkspaceScratch } from './scratch.js';

const execFileAsync = promisify(execFile);
const REMOTE_HEAD = 'refs/remotes/origin/HEAD';
const SYNC_PATHS = ['product'];

async function startRef(source: string): Promise<string> {
  try {
    await execFileAsync('git', ['-C', source, 'rev-parse', '--verify', '--quiet', REMOTE_HEAD]);
    return REMOTE_HEAD;
  } catch {
    return 'HEAD';
  }
}

type AddHandle = { ready: Promise<void>; cancel: () => void };

function startAdd(source: string, target: string, ref: string): AddHandle {
  let cancelled = false;
  let stderr = '';
  const child = spawn('git', ['-C', source, 'worktree', 'add', '--detach', target, ref], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
  const ready = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      const firstLine = stderr.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
      if (cancelled) reject(new Error('git worktree add cancelled.'));
      else if (code === 0) resolve();
      else reject(new Error(firstLine ?? `git worktree add exited with code ${String(code)}`));
    });
  });
  return {
    ready,
    cancel: () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      cancelled = true;
      child.kill();
    },
  };
}

function removeWorktree(source: string | undefined, dir: string): void {
  if (source !== undefined) {
    try {
      execFileSync('git', ['-C', source, 'worktree', 'remove', '--force', dir], { stdio: 'ignore' });
    } catch { /* no registration, or the directory was already removed */ }
  }
  try { untrustWorkspace(dir, workspaceClaudeConfigPath()); } catch { /* ignore */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* keep the provisioning error */ }
  try { rmSync(`${dir}.tmp`, { recursive: true, force: true }); } catch { /* ignore */ }
}

// The shared git-sync workspace is a detached worktree of the project repository, not a second
// clone. It starts at the remote's default-branch tip when that ref is available, so unpushed local
// commits in the main checkout are never carried into a sync push.
export function provisionSyncWorktree(name: string, projectDir: string): ProvisionHandle {
  ensureWorkspaceDir();
  const target = workspacePath(name);
  const source = findRepoRoot(projectDir);
  if (source === undefined) {
    return {
      dir: target,
      ready: Promise.reject(new Error('No git repository found. Cannot create workspace.')),
      cancel: () => {},
    };
  }
  let add: AddHandle | undefined;
  let oauthNotice: string | undefined;

  const ready = (async () => {
    const ref = await startRef(source);
    add = startAdd(source, target, ref);
    try {
      await add.ready;
    } catch (error) {
      removeWorktree(source, target);
      throw error;
    }
    try {
      // In a linked worktree Git keeps sparse settings in that worktree's own config, so the main
      // checkout is never made sparse by this.
      await execFileAsync('git', ['sparse-checkout', 'set', ...SYNC_PATHS], { cwd: target });
      trustWorkspace(target, workspaceClaudeConfigPath());
      oauthNotice = createWorkspaceScratch(target);
    } catch (error) {
      removeWorktree(source, target);
      throw error;
    }
  })();

  return {
    dir: target,
    ready,
    cancel: () => { add?.cancel(); },
    get oauthNotice() { return oauthNotice; },
  };
}

// Removing a worktree through Git drops its registration in the repository's common git directory;
// deleting the directory alone would leave a stale entry that blocks re-creating the same path.
export function removeSyncWorktree(dir: string, projectDir: string): void {
  removeWorktree(findRepoRoot(projectDir), dir);
}
