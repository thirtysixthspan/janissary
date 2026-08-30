import { findRepoRoot, getRemoteUrl, provisionWorkspace, removeWorkspace } from './index.js';

const NO_REPO = 'No git repository found. Cannot create workspace.';

// A workspace clone still being provisioned: its directory is known up front, but `ready` only
// resolves once the clone (and its follow-up git setup) finishes.
export type ProvisioningWorkspace = { dir: string; ready: Promise<void> };

// Owns the set of workspace clones the app has created — an independent `git clone` of the repo's
// `origin` remote, made for an agent (`agent --workspace`) or a harness tab (`harness <name>
// --workspace`) so it works in isolation. Tracks each clone so it can be removed when its tab
// closes or at shutdown, and tracks in-flight clones (keyed by the same `name` used to create
// them — the owning tab's label) so one can be cancelled if its tab closes before it finishes.
export class WorkspaceManager {
  private refs = new Map<string, number>();
  private pending = new Map<string, { cancel: () => void; dir: string }>();
  private projectDir: string;

  constructor(projectDir?: string) {
    this.projectDir = projectDir ?? process.cwd();
  }

  // Validate the repo/remote synchronously (so a caller can fail fast, before creating anything
  // that depends on this succeeding — e.g. a tab), then kick off the clone in the background.
  // Returns the target directory and a `ready` promise, or an `{ error }` when there's no repo, no
  // `origin` remote, or `origin` can't be read. Shared by the agent and harness `--workspace`
  // paths so both behave identically.
  create(name: string): ProvisioningWorkspace | { error: string } {
    const root = findRepoRoot(this.projectDir);
    if (!root) return { error: NO_REPO };
    let remoteUrl: string;
    try {
      remoteUrl = getRemoteUrl(root);
    } catch (error) {
      return { error: `Failed to create workspace: ${error instanceof Error ? error.message : String(error)}` };
    }
    const handle = provisionWorkspace(name, remoteUrl);
    this.refs.set(handle.dir, 1);
    this.pending.set(name, { cancel: handle.cancel, dir: handle.dir });
    return { dir: handle.dir, ready: this.trackReady(name, handle.ready) };
  }

  private async trackReady(name: string, ready: Promise<void>): Promise<void> {
    try {
      await ready;
    } finally {
      this.pending.delete(name);
    }
  }

  // Cancel an in-flight clone still provisioning under `name` (the owning tab's label). A no-op
  // once nothing is pending for that name, or once another tab has retained the clone. In the
  // latter case the clone must finish for the surviving tab even if its creator closes first.
  cancel(name: string): void {
    const pending = this.pending.get(name);
    if (!pending || (this.refs.get(pending.dir) ?? 0) > 1) return;
    pending.cancel();
    this.pending.delete(name);
  }

  retain(dir: string): void {
    const count = this.refs.get(dir);
    if (count !== undefined) this.refs.set(dir, count + 1);
  }

  release(dir: string): void {
    const count = this.refs.get(dir);
    if (count === undefined) return;
    if (count > 1) {
      this.refs.set(dir, count - 1);
      return;
    }
    this.refs.delete(dir);
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
  }

  dispose(): void {
    this.removeAll();
  }
}
