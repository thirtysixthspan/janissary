import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { WorkspaceManager } from './workspace-manager.js';
import { workspacePath } from './workspace.js';
import { getGithubToken } from './github-token.js';

const execFileAsync = promisify(execFile);

// Fixed name for the one shared sync workspace clone — never a tab label, since it outlives any
// single tab and is shared by every config-listed synced file (see the plan's Design decisions).
export const SYNC_WORKSPACE_NAME = 'git-sync';

type ProvisioningWorkspace = { dir: string; ready: Promise<void> };
type SyncResult = { ok: true } | { error: string };

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Owns the single shared git-sync workspace clone end to end. Lazily provisions it once, no matter
// how many synced files are opened concurrently — `ensureWorkspace` caches the handle synchronously
// before any `await`, so a second concurrent caller always sees the first call's handle rather than
// triggering a second `git clone` (`WorkspaceManager.create` itself has no such dedup). Never call
// `WorkspaceManager.remove` on its directory — it's torn down only via `removeAll()` at shutdown.
export class GitSync {
  private handle: ProvisioningWorkspace | { error: string } | undefined;

  constructor(private workspace: WorkspaceManager) {}

  // The path a project-relative synced file resolves to inside the shared workspace, computable
  // synchronously even before the workspace clone exists — used as the editor tab's placeholder
  // `path` so the open-tab de-dupe check has a stable key from the very first open.
  workspaceFilePath(relativePath: string): string {
    return path.join(workspacePath(SYNC_WORKSPACE_NAME), relativePath);
  }

  private ensureWorkspace(): ProvisioningWorkspace | { error: string } {
    this.handle ??= this.workspace.create(SYNC_WORKSPACE_NAME);
    return this.handle;
  }

  // Pull-only cycle: used when a synced tab opens (or another synced tab's save completes).
  // Nothing to commit or push — just wait for the shared workspace and pull/rebase it up to date.
  async openSync(): Promise<{ dir: string } | { error: string }> {
    const handle = this.ensureWorkspace();
    if ('error' in handle) return handle;
    try {
      await handle.ready;
      await pullRebase(handle.dir);
      return { dir: handle.dir };
    } catch (error) {
      return { error: toMessage(error) };
    }
  }

  // Save-triggered cycle: commit `sync: <filename>` (if there's anything to commit), then the
  // same pull-rebase step, then push.
  async saveSync(filename: string): Promise<SyncResult> {
    const handle = this.ensureWorkspace();
    if ('error' in handle) return handle;
    try {
      await handle.ready;
      await commitIfChanged(handle.dir, filename);
      await pullRebase(handle.dir);
      await push(handle.dir);
      return { ok: true };
    } catch (error) {
      return { error: toMessage(error) };
    }
  }
}

// `sandboxSpawn`'s `GH_TOKEN` injection (`sandbox/index.ts`) only covers spawned agent/harness
// processes, not the server's own direct git calls — git-sync's pull/push must pass it explicitly
// so the `gh auth git-credential` helper set up by `finishProvisioning` can authenticate.
function githubEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GH_TOKEN: getGithubToken() };
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

// `git pull --rebase` against `origin/master`. On any conflict, the remote always wins — abort the
// rebase and hard-reset to `origin/master` rather than surfacing merge-conflict UI of any kind.
async function pullRebase(dir: string): Promise<void> {
  const env = githubEnv();
  try {
    await execFileAsync('git', ['pull', '--rebase', 'origin', 'master'], { cwd: dir, env });
  } catch {
    try {
      await execFileAsync('git', ['rebase', '--abort'], { cwd: dir });
    } catch { /* no rebase was in progress to abort */ }
    await execFileAsync('git', ['fetch', 'origin', 'master'], { cwd: dir, env });
    await execFileAsync('git', ['reset', '--hard', 'origin/master'], { cwd: dir });
  }
}

async function push(dir: string): Promise<void> {
  await execFileAsync('git', ['push', 'origin', 'HEAD:master'], { cwd: dir, env: githubEnv() });
}
