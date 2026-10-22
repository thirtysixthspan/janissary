import { findRepoRoot, getRemoteUrl, provisionWorkspace, removeWorkspace, removeWorkspaceStrict, type ProvisionHandle } from './index.js';
import { errorText } from '../error-text.js';
import { messageBus } from '../bus.js';
import type { GitCloneOptions } from '../git/clone.js';

export const NO_REPO ='No git repository found. Cannot create workspace.';

// A workspace clone still being provisioned: its directory is known up front, but `ready` only
// resolves once the clone (and its follow-up git setup) finishes.
export type ProvisioningWorkspace = {
  dir: string; ready: Promise<void>; cancel?: () => void; readonly oauthNotice?: string;
};

type PendingWorkspace = { cancel: () => void; dir: string; ready: Promise<void> };

// Owns the set of workspace clones the app has created — an independent `git clone` of the repo's
// `origin` remote, made for a shell (`shell --workspace`) or a harness tab (`harness <name>
// --workspace`) so it works in isolation. Tracks each clone so it can be removed when its tab
// closes or at shutdown, and tracks in-flight clones (keyed by the same `name` used to create
// them — the owning tab's label) so one can be cancelled if its tab closes before it finishes.
export class WorkspaceManager {
  private refs = new Map<string, number>();
  private names = new Map<string, string>();
  private pending = new Map<string, PendingWorkspace>();
  private projectDir: string;

  constructor(projectDir?: string, private onCredentialFailure?: (label: string, message: string) => void) {
    this.projectDir = projectDir ?? process.cwd();
  }

  // Validate the repo/remote synchronously (so a caller can fail fast, before creating anything
  // that depends on this succeeding — e.g. a tab), then kick off the clone in the background.
  // Returns the target directory and a `ready` promise, or an `{ error }` when there's no repo, no
  // `origin` remote, or `origin` can't be read. Shared by the agent and harness `--workspace`
  // paths so both behave identically. `githubToken` is a remote workspace's forwarded credential;
  // a local clone passes none.
  create(
    name: string,
    githubToken?: string,
    cloneOptions?: Omit<GitCloneOptions, 'githubToken'>,
  ): ProvisioningWorkspace | { error: string } {
    const origin = this.originUrl();
    if ('error' in origin) return origin;
    const handle = cloneOptions === undefined
      ? provisionWorkspace(name, origin.url, githubToken)
      : provisionWorkspace(name, origin.url, githubToken, cloneOptions);
    this.refs.set(handle.dir, 1);
    this.names.set(name, handle.dir);
    const pending: PendingWorkspace = { cancel: handle.cancel, dir: handle.dir, ready: Promise.resolve() };
    pending.ready = this.trackReady(name, handle, pending);
    this.pending.set(name, pending);
    return {
      dir: handle.dir, ready: pending.ready, cancel: () => this.cancelAttempt(name, pending),
      get oauthNotice() { return handle.oauthNotice; },
    };
  }

  // The error `create` would return for want of a repo or an `origin` remote, or undefined when a
  // clone could start. Clones nothing, so a caller about to destroy something for the clone's sake —
  // a leftover folder under the same name — can stop first.
  preflight(): string | undefined {
    const origin = this.originUrl();
    return 'error' in origin ? origin.error : undefined;
  }

  // The project root's `origin` URL, or undefined when there is no repository or no `origin`.
  origin(): string | undefined {
    const origin = this.originUrl();
    return 'url' in origin ? origin.url : undefined;
  }

  private originUrl(): { url: string } | { error: string } {
    const root = findRepoRoot(this.projectDir);
    if (!root) return { error: NO_REPO };
    try {
      return { url: getRemoteUrl(root) };
    } catch (error) {
      return { error: `Failed to create workspace: ${errorText(error)}` };
    }
  }

  private async trackReady(name: string, handle: ProvisionHandle, pending: PendingWorkspace): Promise<void> {
    try {
      await handle.ready;
      if (this.pending.get(name) === pending && this.refs.has(handle.dir) && handle.oauthNotice) {
        try { this.onCredentialFailure?.(name, handle.oauthNotice); } catch { return; }
      }
    } finally {
      if (this.pending.get(name) === pending) this.pending.delete(name);
      messageBus.emit('state', { type: 'dirty' });
    }
  }

  // Whether a clone into `dir` is still in flight. Keyed by directory rather than by name so a
  // second tab sharing the same clone reports it too.
  provisioning(dir: string): boolean {
    for (const pending of this.pending.values()) if (pending.dir === dir) return true;
    return false;
  }

  // Whether `dir` is a clone this manager still holds a reference to. Read-only, so callers can ask
  // without reaching the private reference map; a provisioning clone counts as tracked.
  tracks(dir: string): boolean {
    return this.refs.has(dir);
  }

  // Cancel an in-flight clone still provisioning under `name` (the owning tab's label). A no-op
  // once nothing is pending for that name, or once another tab has retained the clone. In the
  // latter case the clone must finish for the surviving tab even if its creator closes first.
  cancel(name: string): void {
    const pending = this.pending.get(name);
    if (pending) this.cancelAttempt(name, pending);
  }

  private cancelAttempt(name: string, attempt: PendingWorkspace): void {
    if (this.pending.get(name) !== attempt || (this.refs.get(attempt.dir) ?? 0) > 1) return;
    attempt.cancel();
    if (this.pending.get(name) === attempt) this.pending.delete(name);
  }

  retain(dir: string): void {
    const count = this.refs.get(dir);
    if (count !== undefined) this.refs.set(dir, count + 1);
  }

  acquireAgentWorkspace(name: string): { dir: string; ready: Promise<void>; release: () => Promise<void> } | undefined {
    const dir = this.names.get(name);
    if (dir === undefined || !this.refs.has(dir)) return undefined;
    const pending = this.pending.get(name);
    return {
      dir,
      ready: pending?.dir === dir ? pending.ready : Promise.resolve(),
      release: this.acquireAgentLease(dir),
    };
  }

  acquireAgentLease(dir: string): () => Promise<void> {
    if (!this.refs.has(dir)) throw new Error(`Cannot borrow untracked workspace: ${dir}`);
    this.retain(dir);
    let released = false;
    return async () => {
      if (released) return;
      const count = this.refs.get(dir);
      if (count === undefined) throw new Error(`Workspace lease is no longer tracked: ${dir}`);
      if (count > 1) {
        this.refs.set(dir, count - 1);
        released = true;
        return;
      }
      removeWorkspaceStrict(dir);
      this.refs.delete(dir);
      this.forgetName(dir);
      released = true;
    };
  }

  private forgetName(dir: string): void {
    for (const [name, workspaceDir] of this.names) {
      if (workspaceDir === dir) this.names.delete(name);
    }
  }

  release(dir: string): void {
    const count = this.refs.get(dir);
    if (count === undefined) return;
    if (count > 1) {
      this.refs.set(dir, count - 1);
      return;
    }
    this.refs.delete(dir);
    this.forgetName(dir);
    removeWorkspace(dir);
  }

  remove(dir: string): void {
    this.release(dir);
  }

  // Remove every workspace clone (app shutdown), cancelling any still in flight first.
  removeAll(): void {
    for (const pending of this.pending.values()) pending.cancel();
    this.pending.clear();
    for (const dir of this.refs.keys()) removeWorkspace(dir);
    this.refs.clear();
    this.names.clear();
  }

  dispose(): void {
    this.removeAll();
  }
}
