import path from 'node:path';
import type { WorkspaceManager } from '../workspace/manager.js';
import { workspacePath } from '../workspace/index.js';
import { getProjectTokens } from '../project/tokens.js';
import { errorText } from '../error-text.js';
import { currentBranch, defaultBranch } from './status.js';
import { isExpectedDiffChange, SyncCommandRunner, SYNC_CANCEL_REASON, SYNC_COMMAND_TIMEOUT_MS } from './sync-command.js';

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
  private queue: Promise<void> = Promise.resolve();
  private commands = new SyncCommandRunner();
  private closed = false;

  constructor(private workspace: WorkspaceManager) {}

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.commands.dispose();
  }

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
      await waitForAbort(handle.ready, this.commands.signal);
    } catch (error) {
      if (this.handle === handle && !this.closed) {
        this.handle = undefined;
        this.workspace.remove(handle.dir);
      }
      throw error;
    }
  }

  // Waits for the shared clone, then resolves (once per clone) the branch every cycle targets.
  private async readyBranch(handle: SyncWorkspace): Promise<string> {
    await this.waitForWorkspace(handle);
    handle.branch ??= resolveSyncBranch(this.commands, handle.dir);
    return handle.branch;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    const result = (async () => {
      await previous;
      return operation();
    })();
    this.queue = (async () => {
      try { await result; } catch { return; }
    })();
    return result;
  }

  // Pull-only cycle: used when a synced tab opens (or another synced tab's save completes).
  // Nothing to commit or push — just wait for the shared workspace and pull/rebase it up to date.
  async openSync(): Promise<{ dir: string } | { error: string }> {
    if (this.closed) return { error: SYNC_CANCEL_REASON };
    const handle = this.ensureWorkspace();
    if ('error' in handle) return handle;
    return this.enqueue(async () => {
      try {
        const branch = await this.readyBranch(handle);
        await pullRebase(this.commands, handle.dir, branch);
        return { dir: handle.dir };
      } catch (error) {
        return { error: errorText(error) };
      }
    });
  }

  // Save-triggered cycle: commit the saved file alone as `sync: <filename>` (if it changed), then
  // the same pull-rebase step, then push. `filePath` is the saved file's path inside the clone.
  async saveSync(filePath: string): Promise<SyncResult> {
    if (this.closed) return { error: SYNC_CANCEL_REASON };
    const handle = this.ensureWorkspace();
    if ('error' in handle) return handle;
    return this.enqueue<SyncResult>(async () => {
      try {
        const branch = await this.readyBranch(handle);
        await commitIfChanged(this.commands, handle.dir, filePath);
        await pullRebase(this.commands, handle.dir, branch);
        await push(this.commands, handle.dir, branch);
        return { ok: true };
      } catch (error) {
        return { error: errorText(error) };
      }
    });
  }
}

async function waitForAbort(promise: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error(SYNC_CANCEL_REASON);
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error(SYNC_CANCEL_REASON));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    await Promise.race([promise, cancelled]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
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
async function resolveSyncBranch(commands: SyncCommandRunner, dir: string): Promise<string> {
  const execution = { signal: commands.signal, timeout: SYNC_COMMAND_TIMEOUT_MS };
  const detected = await defaultBranch(dir, execution);
  if (detected) return detected;
  const current = await currentBranch(dir, execution);
  return current && current !== 'HEAD' ? current : 'master';
}

// The shared clone holds every synced file, so every step is scoped to the one that was saved with a
// `-- <path>` pathspec, the same way `commitRoot` in `commit.ts` scopes its staging: a bare `git add
// -A` would commit whatever else happened to be changed or untracked in the clone under this file's
// name, and `git commit` without the pathspec would take anything already staged along with it.
async function commitIfChanged(commands: SyncCommandRunner, dir: string, filePath: string): Promise<void> {
  await commands.run(['add', '-A', '--', filePath], dir);
  try {
    // Exits 0 (no staged changes) when there's nothing to commit; non-zero otherwise.
    await commands.run(['diff', '--cached', '--quiet', '--', filePath], dir);
  } catch (error) {
    if (!isExpectedDiffChange(error)) throw error;
    await commands.run(['commit', '-m', `sync: ${path.basename(filePath)}`, '--', filePath], dir);
  }
}

// `git pull --rebase` against `origin/<branch>`. If it fails after starting a rebase, restore the
// branch to its pre-rebase state while preserving its local commits, then surface the pull error.
// `--autostash` sets aside whatever the clone holds beyond its commits — another synced file whose
// own save cycle has not committed it yet — so the pull is never refused over a change it is not
// about, and puts it back once the rebase settles.
async function pullRebase(commands: SyncCommandRunner, dir: string, branch: string): Promise<void> {
  const env = githubEnv();
  try {
    await commands.run(['pull', '--rebase', '--autostash', 'origin', branch], dir, env);
  } catch (error) {
    try {
      if (!commands.isDisposed) {
        await commands.run(['rebase', '--abort'], dir, undefined, { signal: new AbortController().signal });
      }
    } catch { /* no rebase was in progress to abort */ }
    throw error;
  }
}

async function push(commands: SyncCommandRunner, dir: string, branch: string): Promise<void> {
  await commands.run(['push', 'origin', `HEAD:${branch}`], dir, githubEnv());
}
