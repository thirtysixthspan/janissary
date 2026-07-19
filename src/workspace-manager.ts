import { findRepoRoot, getRemoteUrl, provisionWorkspace, removeWorkspace } from './workspace.js';

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
  private dirs = new Set<string>();
  private pending = new Map<string, () => void>();
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
    this.dirs.add(handle.dir);
    this.pending.set(name, handle.cancel);
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
  // once nothing is pending for that name — safe to call unconditionally on tab close.
  cancel(name: string): void {
    this.pending.get(name)?.();
    this.pending.delete(name);
  }

  // Remove a workspace clone and stop tracking it (on tab close).
  remove(dir: string): void {
    removeWorkspace(dir);
    this.dirs.delete(dir);
  }

  // Remove every workspace clone (app shutdown), cancelling any still in flight first.
  removeAll(): void {
    for (const cancel of this.pending.values()) cancel();
    this.pending.clear();
    for (const dir of this.dirs) removeWorkspace(dir);
    this.dirs.clear();
  }
}
