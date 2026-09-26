import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { WorkspaceManager } from '../workspace/manager.js';
import { workspacePath } from '../workspace/index.js';
import { getProjectTokens } from '../project/tokens.js';
import { errorText } from '../error-text.js';
import { currentBranch, defaultBranch } from './status.js';

const execFileAsync = promisify(execFile);

// Fixed name for the one shared sync workspace clone — never a tab label, since it outlives any
// single tab and is shared by every config-listed synced file (see the plan's Design decisions).
export const SYNC_WORKSPACE_NAME = 'git-sync';

type ProvisioningWorkspace = { dir: string; ready: Promise<void> };
// The cached handle also carries the branch its sync cycles pull from and push to, resolved once
// the clone is ready. Living on the handle, it is discarded with it when provisioning fails.
type SyncWorkspace = ProvisioningWorkspace & { branch?: Promise<string> };
type SyncResult = { ok: true } | { error: string };

// Owns the single shared git-sync workspace clone end to end. Lazily provisions it once, no matter
// how many synced files are opened concurrently — `ensureWorkspace` caches the handle synchronously
// before any `await`, so a second concurrent caller always sees the first call's handle rather than
// triggering a second `git clone` (`WorkspaceManager.create` itself has no such dedup). Never call
// `WorkspaceManager.remove` on its directory — it's torn down only via `removeAll()` at shutdown.
export class GitSync {
  private handle: SyncWorkspace | undefined;

  constructor(private workspace: WorkspaceManager) {}

  // The path a project-relative synced file resolves to inside the shared workspace, computable
  // synchronously even before the workspace clone exists — used as the editor tab's placeholder
  // `path` so the open-tab de-dupe check has a stable key from the very first open.
  workspaceFilePath(relativePath: string): string {
    return path.join(workspacePath(SYNC_WORKSPACE_NAME), relativePath);
  }

  private ensureWorkspace(): SyncWorkspace | { error: string } {
    if (this.handle) return this.handle;
    const created = this.workspace.create(SYNC_WORKSPACE_NAME);
    if ('error' in created) return created;
    this.handle = { dir: created.dir, ready: created.ready };
    return this.handle;
  }

  private async waitForWorkspace(handle: SyncWorkspace): Promise<void> {
    try {
      await handle.ready;
    } catch (error) {
      if (this.handle === handle) {
        this.handle = undefined;
        this.workspace.remove(handle.dir);
      }
      throw error;
    }
  }

  // Waits for the shared clone, then resolves (once per clone) the branch every cycle targets.
  private async readyBranch(handle: SyncWorkspace): Promise<string> {
    await this.waitForWorkspace(handle);
    handle.branch ??= resolveSyncBranch(handle.dir);
    return handle.branch;
  }

  // Pull-only cycle: used when a synced tab opens (or another synced tab's save completes).
  // Nothing to commit or push — just wait for the shared workspace and pull/rebase it up to date.
  async openSync(): Promise<{ dir: string } | { error: string }> {
    const handle = this.ensureWorkspace();
    if ('error' in handle) return handle;
    try {
      const branch = await this.readyBranch(handle);
      await pullRebase(handle.dir, branch);
      return { dir: handle.dir };
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  // Save-triggered cycle: commit `sync: <filename>` (if there's anything to commit), then the
  // same pull-rebase step, then push.
  async saveSync(filename: string): Promise<SyncResult> {
    const handle = this.ensureWorkspace();
    if ('error' in handle) return handle;
    try {
      const branch = await this.readyBranch(handle);
      await commitIfChanged(handle.dir, filename);
      await pullRebase(handle.dir, branch);
      await push(handle.dir, branch);
      return { ok: true };
    } catch (error) {
      return { error: errorText(error) };
    }
  }
}

// `sandboxSpawn`'s `GH_TOKEN` injection (`sandbox/index.ts`) only covers spawned agent/harness
// processes, not the server's own direct git calls — git-sync's pull/push must pass it explicitly
// so the `gh auth git-credential` helper set up by `finishProvisioning` can authenticate.
function githubEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GH_TOKEN: getProjectTokens().github };
}

// The branch the shared workspace syncs against: the remote's detected default branch, the same
// one `isPrimaryBranch` admits a file to syncing against, falling back to the clone's own
// checked-out branch, then `master` when neither can be read or the clone is detached.
async function resolveSyncBranch(dir: string): Promise<string> {
  const detected = await defaultBranch(dir);
  if (detected) return detected;
  const current = await currentBranch(dir);
  return current && current !== 'HEAD' ? current : 'master';
}

async function commitIfChanged(dir: string, filename: string): Promise<void> {
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  try {
    // Exits 0 (no staged changes) when there's nothing to commit; non-zero otherwise.
    await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: dir });
  } catch {
    await execFileAsync('git', ['commit', '-m', `sync: ${filename}`], { cwd: dir });
  }
}

// `git pull --rebase` against `origin/<branch>`. If it fails after starting a rebase, restore the
// branch to its pre-rebase state while preserving its local commits, then surface the pull error.
async function pullRebase(dir: string, branch: string): Promise<void> {
  const env = githubEnv();
  try {
    await execFileAsync('git', ['pull', '--rebase', 'origin', branch], { cwd: dir, env });
  } catch (error) {
    try {
      await execFileAsync('git', ['rebase', '--abort'], { cwd: dir });
    } catch { /* no rebase was in progress to abort */ }
    throw error;
  }
}

async function push(dir: string, branch: string): Promise<void> {
  await execFileAsync('git', ['push', 'origin', `HEAD:${branch}`], { cwd: dir, env: githubEnv() });
}
