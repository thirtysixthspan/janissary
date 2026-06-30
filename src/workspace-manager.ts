import { findRepoRoot, createWorkspace, removeWorkspace } from './workspace.js';

const NO_REPO = 'No git repository found. Cannot create workspace.';

// Owns the set of workspace clones the app has created — a `git clone --shared` of the repo, made for
// an agent (`agent --workspace`) or a harness tab (`harness <name> --workspace`) so it works in
// isolation. Tracks each clone so it can be removed when its tab closes or at shutdown.
export class WorkspaceManager {
  private dirs = new Set<string>();

  // Create a workspace clone named `name` from the repo detected at the launch cwd, tracking it for
  // cleanup. Returns the new directory, or an `{ error }` to surface when there's no repo / the clone
  // fails. Shared by the agent and harness `--workspace` paths so both behave identically.
  create(name: string): { dir: string } | { error: string } {
    const root = findRepoRoot(process.cwd());
    if (!root) return { error: NO_REPO };
    try {
      const dir = createWorkspace(name, root);
      this.dirs.add(dir);
      return { dir };
    } catch (error) {
      return { error: `Failed to create workspace: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  // Remove a workspace clone and stop tracking it (on tab close).
  remove(dir: string): void {
    removeWorkspace(dir);
    this.dirs.delete(dir);
  }

  // Remove every workspace clone (app shutdown).
  removeAll(): void {
    for (const dir of this.dirs) removeWorkspace(dir);
    this.dirs.clear();
  }
}
